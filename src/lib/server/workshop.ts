import "server-only";
import { getWorkshopMaps } from "../settings";
import { db } from "../supabase";
import { enqueueCommand } from "./state";

// ───────────────────────── Workshop-карты: библиотека, проверка загрузки, прогрев

export const MAP_LOAD_TIMEOUT_MS = 2 * 60_000;

/** Карт в автоматическом прогреве: каждая занимает сервер до 4 минут загрузки и минуту на возврат */
export const AUTO_PREFETCH_MAX_MAPS = 3;
/** После прогрева — пауза перед следующим автоматическим (не крутить сервер на картах, которые не грузятся) */
const PREFETCH_COOLDOWN_MS = 10 * 60_000;

export type WorkshopInfo = Record<string, { map: string | null; ok: boolean; seconds?: number; checked_at: string; note?: string }>;

export async function workshopInfo(): Promise<WorkshopInfo> {
  const { data } = await db().from("app_settings").select("value").eq("key", "WORKSHOP_MAP_INFO").maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as WorkshopInfo) : {};
  } catch {
    return {};
  }
}

/**
 * Какое имя карты должен показать сервер: стандартная — её id (de_mirage),
 * workshop — внутреннее имя, которое агент узнал при проверке (aim_map@3070549948 → aim_map_d).
 * null — проверить нельзя (workshop-карта ещё не проверялась).
 */
export async function expectedMapName(matchId: string): Promise<string | null> {
  const { data: maps } = await db().from("match_maps").select("map_name, status, map_number").eq("match_id", matchId).order("map_number");
  const current = (maps ?? []).find((x) => x.status !== "finished") ?? maps?.[0];
  if (!current) return null;
  if (!current.map_name.includes("@")) return current.map_name;
  const info = await workshopInfo();
  return info[current.map_name.split("@")[1]]?.map ?? null;
}

/** Результат прогрева от агента («123 → aim_map_d (5 с)» / «123: не загрузилась за 600 с») → в библиотеку */
export async function saveWorkshopResults(result: string) {
  const info = await workshopInfo();
  const now = new Date().toISOString();
  for (const m of result.matchAll(/(\d+) → ([\w.-]+) \((\d+) с\)/g)) info[m[1]] = { map: m[2], ok: true, seconds: Number(m[3]), checked_at: now };
  for (const m of result.matchAll(/(\d+): не загрузилась за (\d+) с/g)) {
    info[m[1]] = { map: null, ok: false, checked_at: now, note: "не загружается в CS2 — возможно, карта из CS:GO" };
  }
  await db().from("app_settings").upsert({ key: "WORKSHOP_MAP_INFO", value: JSON.stringify(info), updated_at: now });
}

/**
 * Прогрев уже идёт или был недавно: команда в очереди/у агента (сколько бы ни длилась — до 5 минут на карту)
 * или создана меньше 10 минут назад.
 */
async function prefetchRecentlyQueued() {
  const since = new Date(Date.now() - PREFETCH_COOLDOWN_MS).toISOString();
  const { count, error } = await db()
    .from("agent_commands")
    .select("id", { count: "exact", head: true })
    .eq("type", "prefetch_maps")
    .or(`status.in.(pending,sent),created_at.gte."${since}"`);
  if (error) throw new Error("Не удалось проверить очередь прогрева", { cause: error });
  return (count ?? 0) > 0;
}

/** Автоматический прогрев: не больше AUTO_PREFETCH_MAX_MAPS карт и не поверх идущего */
export async function enqueueAutoPrefetch(ids: string[]) {
  const unique = [...new Set(ids)].slice(0, AUTO_PREFETCH_MAX_MAPS);
  if (!unique.length || (await prefetchRecentlyQueued())) return false;
  await enqueueCommand(null, "prefetch_maps", { workshop_ids: unique });
  return true;
}

/** Идёт турнирный день или игра: проверка библиотеки подождёт — прогрев занимает сервер и steamapps */
async function gamesActive() {
  const [{ count: tournaments }, { count: matches }, { count: lobbyGames }] = await Promise.all([
    db().from("tournaments").select("id", { count: "exact", head: true }).in("status", ["checkin", "live"]),
    db().from("matches").select("id", { count: "exact", head: true }).in("status", ["ready", "live"]),
    db().from("lobby_games").select("id", { count: "exact", head: true }).in("status", ["veto", "waiting", "live"]),
  ]);
  return (tournaments ?? 0) + (matches ?? 0) + (lobbyGames ?? 0) > 0;
}

/**
 * Карты библиотеки, которые ещё ни разу не проверялись на сервере, → прогрев.
 * Только в свободное время: не во время check-in/турнира, матчей и игр лобби. По 3 карты за раз.
 */
export async function verifyWorkshopLibrary() {
  const [library, info] = await Promise.all([getWorkshopMaps(), workshopInfo()]);
  // непроверенные + те, что не загрузились больше часа назад (сбой мог быть разовым — сервер упал, Steam тормозил)
  const hourAgo = Date.now() - 60 * 60_000;
  const unchecked = library
    .map((w) => w.split("@")[1])
    .filter((id) => !info[id] || (!info[id].ok && new Date(info[id].checked_at).getTime() < hourAgo));
  if (!unchecked.length) return;
  if (await gamesActive()) return;
  await enqueueAutoPrefetch(unchecked);
}
