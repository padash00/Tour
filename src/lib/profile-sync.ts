import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { fetchFaceitBySteamId } from "./faceit";
import { getSetting } from "./settings";
import { fetchSteamProfile } from "./steam";
import { db } from "./supabase";

/**
 * Автообновление профилей игроков: ник, аватар, страна из Steam и уровень/ELO/ник FACEIT.
 *  — при входе через Steam (сразу, в callback);
 *  — фоном на каждой синхронизации агента: небольшая пачка самых «старых» профилей;
 *  — при открытии профиля или /me, если данные старше STALE_MS (после ответа, через after()).
 * Ничего здесь не бросает исключений и не задерживает страницу.
 */

export const STALE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 3500;
const BATCH = 3;
const MIN_TICK_GAP_MS = 60_000;

type Row = { id: string; steam_id: string; avatar_url: string | null };

function withTimeout<T>(p: Promise<T>, fallback: T, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** Колонка profile_refreshed_at появляется миграцией; пока её нет — работаем без неё */
let hasRefreshedColumn: boolean | null = null;

async function markRefreshed(ids: string[], at: string) {
  if (!ids.length || hasRefreshedColumn === false) return;
  const { error } = await db().from("players").update({ profile_refreshed_at: at }).in("id", ids);
  if (error?.code === "42703") hasRefreshedColumn = false;
  else if (!error) hasRefreshedColumn = true;
}

type SteamSummary = { nickname: string; avatarUrl: string | null; profileUrl: string; country: string | null };

/** Steam GetPlayerSummaries пачкой до 100 SteamID; без ключа — по одному через публичный профиль */
async function steamSummaries(steamIds: string[]): Promise<Map<string, SteamSummary>> {
  const out = new Map<string, SteamSummary>();
  const key = await getSetting("STEAM_API_KEY");
  if (key) {
    for (let i = 0; i < steamIds.length; i += 100) {
      const chunk = steamIds.slice(i, i + 100);
      try {
        const res = await fetch(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${chunk.join(",")}`,
          { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) },
        );
        const data = await res.json();
        for (const p of data?.response?.players ?? []) {
          out.set(String(p.steamid), {
            nickname: p.personaname ?? String(p.steamid),
            avatarUrl: p.avatarfull ?? null,
            profileUrl: p.profileurl ?? `https://steamcommunity.com/profiles/${p.steamid}`,
            country: p.loccountrycode ?? null,
          });
        }
      } catch {
        // Steam не ответил — оставим сохранённые данные
      }
    }
    return out;
  }
  for (const id of steamIds) {
    const p = await withTimeout(fetchSteamProfile(id), null);
    if (p?.ok) out.set(id, { nickname: p.nickname, avatarUrl: p.avatarUrl, profileUrl: p.profileUrl, country: p.country });
  }
  return out;
}

/** Обновить переданных игроков. Возвращает, сколько профилей Steam и FACEIT удалось получить. */
export async function refreshPlayers(rows: Row[]): Promise<{ steam: number; faceit: number }> {
  if (!rows.length) return { steam: 0, faceit: 0 };
  const now = new Date().toISOString();
  const steam = await steamSummaries(rows.map((r) => r.steam_id));

  // FACEIT — по одному игроку, не больше 3 запросов одновременно
  const faceit = new Map<string, Awaited<ReturnType<typeof fetchFaceitBySteamId>>>();
  for (let i = 0; i < rows.length; i += 3) {
    await Promise.all(
      rows.slice(i, i + 3).map(async (r) => faceit.set(r.steam_id, await withTimeout(fetchFaceitBySteamId(r.steam_id), null))),
    );
  }

  let s = 0;
  let f = 0;
  for (const r of rows) {
    const sp = steam.get(r.steam_id);
    const fc = faceit.get(r.steam_id);
    if (sp) s++;
    if (fc) f++;
    if (!sp && !fc) continue;
    await db()
      .from("players")
      .update({
        ...(sp && { nickname: sp.nickname, avatar_url: sp.avatarUrl ?? r.avatar_url, profile_url: sp.profileUrl, country: sp.country }),
        ...(fc && {
          faceit_id: fc.id,
          faceit_nickname: fc.nickname,
          faceit_level: fc.level,
          faceit_elo: fc.elo,
          faceit_updated_at: now,
        }),
      })
      .eq("id", r.id);
  }
  // отметку ставим всем, кого пытались обновить, — чтобы не долбить недоступные профили каждую минуту
  await markRefreshed(
    rows.map((r) => r.id),
    now,
  );
  return { steam: s, faceit: f };
}

/** Самые давно обновлённые профили (старше STALE_MS) */
async function stalePlayers(limit: number): Promise<Row[]> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  if (hasRefreshedColumn !== false) {
    const { data, error } = await db()
      .from("players")
      .select("id, steam_id, avatar_url")
      .or(`profile_refreshed_at.is.null,profile_refreshed_at.lt.${cutoff}`)
      .order("profile_refreshed_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (!error) {
      hasRefreshedColumn = true;
      return (data ?? []) as Row[];
    }
    if (error.code !== "42703") return [];
    hasRefreshedColumn = false;
  }
  // до миграции: ориентируемся на время обновления FACEIT
  const { data } = await db()
    .from("players")
    .select("id, steam_id, avatar_url")
    .or(`faceit_updated_at.is.null,faceit_updated_at.lt.${cutoff}`)
    .order("faceit_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data ?? []) as Row[];
}

let lastTick = 0;

/** Фоновый шаг для синхронизации агента: не чаще раза в минуту, небольшая пачка. Не бросает. */
export async function refreshStaleProfilesTick() {
  if (Date.now() - lastTick < MIN_TICK_GAP_MS) return;
  lastTick = Date.now();
  try {
    const rows = await stalePlayers(BATCH);
    if (rows.length) await refreshPlayers(rows);
  } catch (e) {
    console.error("profile sync failed", e);
  }
}

/**
 * Если профиль старше STALE_MS — обновить после отправки страницы (не задерживает рендер).
 * Вызывать из серверных страниц профиля игрока и /me.
 */
export function refreshIfStale(player: { id: string; steam_id: string; avatar_url: string | null } & Record<string, unknown>) {
  const stamp = (player.profile_refreshed_at ?? player.faceit_updated_at ?? null) as string | null;
  if (stamp && Date.now() - new Date(stamp).getTime() < STALE_MS) return;
  try {
    after(async () => {
      try {
        await refreshPlayers([{ id: player.id, steam_id: player.steam_id, avatar_url: player.avatar_url }]);
        revalidatePath(`/players/${player.steam_id}`);
        revalidatePath("/me");
      } catch {
        // фоновая задача — молча
      }
    });
  } catch {
    // вне контекста запроса after() недоступен
  }
}

/** Отметка после входа через Steam (сам вход уже обновил данные) */
export async function markLoginRefreshed(playerId: string) {
  await markRefreshed([playerId], new Date().toISOString()).catch(() => {});
}
