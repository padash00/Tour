import "server-only";
import { db } from "../supabase";

/*
 * Админы сайта для серверной части: уведомления о сбоях, права MatchZy в игре, вход на любой матч зрителем.
 * Админ — is_admin в players или SteamID из ADMIN_STEAM_IDS. Фильтр — в SQL (без чтения всей таблицы игроков
 * на каждой синхронизации), результат держим в памяти процесса минуту.
 */

export type SiteAdmin = { id: string; steam_id: string; nickname: string };

const CACHE_MS = 60_000;
let cache: { at: number; rows: SiteAdmin[] } | null = null;
let loading: Promise<SiteAdmin[]> | null = null;

const envAdminSteamIds = () =>
  (process.env.ADMIN_STEAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));

async function loadAdmins(): Promise<SiteAdmin[]> {
  const env = envAdminSteamIds();
  // SteamID проверены регуляркой — в фильтр PostgREST попадают только цифры
  const filter = env.length ? `is_admin.eq.true,steam_id.in.(${env.join(",")})` : "is_admin.eq.true";
  const { data, error } = await db().from("players").select("id, steam_id, nickname").or(filter);
  if (error) throw new Error("Не удалось получить список админов", { cause: error });
  return (data ?? []).map((p) => ({ id: p.id as string, steam_id: (p.steam_id as string) ?? "", nickname: (p.nickname as string) ?? "Admin" }));
}

export async function siteAdmins(): Promise<SiteAdmin[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  loading ??= loadAdmins()
    .then((rows) => {
      cache = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** id админов — для уведомлений */
export async function adminIds() {
  return (await siteAdmins()).map((a) => a.id);
}

/** Админы сайта (SteamID + ник) — им в игре права MatchZy и вход на любой матч зрителем */
export async function adminPlayers() {
  return (await siteAdmins())
    .filter((a) => /^\d{17}$/.test(a.steam_id))
    .map((a) => ({ steam_id: a.steam_id, nickname: a.nickname }));
}
