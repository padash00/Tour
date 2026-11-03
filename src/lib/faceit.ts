import "server-only";
import { getSetting } from "./settings";

export type FaceitProfile = {
  id: string;
  nickname: string;
  level: number | null;
  elo: number | null;
};

/** Ищет FACEIT-профиль по SteamID64. null — профиля нет или ключ не задан. */
export async function fetchFaceitBySteamId(steamId: string): Promise<FaceitProfile | null> {
  const key = await getSetting("FACEIT_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch(
      `https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamId}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(3500) },
    );
    if (!res.ok) return null;
    const p = await res.json();
    const cs2 = p?.games?.cs2;
    let level: number | null = typeof cs2?.skill_level === "number" && cs2.skill_level > 0 ? cs2.skill_level : null;
    let elo: number | null = typeof cs2?.faceit_elo === "number" && cs2.faceit_elo > 0 ? cs2.faceit_elo : null;
    // Без калибровки FACEIT отдаёт стартовые 1000 ELO (4 уровень) — это не рейтинг игрока.
    // Проверяем число сыгранных матчей CS2: 0 — ELO и уровень не показываем.
    if (elo != null && p.player_id) {
      const [matches, last] = await Promise.all([faceitMatchCount(p.player_id, key), faceitLastMatchAt(p.player_id, key)]);
      const uncalibrated = matches === 0 || (matches == null && elo === UNCALIBRATED_ELO);
      // давно не играл: FACEIT продолжает отдавать ELO прошлого сезона, хотя в текущем у игрока «нет ранга»
      const stale = last === 0 || (last != null && Date.now() - last > ACTIVE_DAYS * 86_400_000);
      if (uncalibrated || stale) {
        elo = null;
        level = null;
      }
    }
    return { id: p.player_id, nickname: p.nickname, level, elo };
  } catch {
    return null;
  }
}

/** ELO считается, только если игрок сыграл на FACEIT хотя бы один матч CS2 за этот срок */
export const ACTIVE_DAYS = 90;

/** Стартовый ELO FACEIT CS2 до калибровки */
export const UNCALIBRATED_ELO = 1000;

/** Сколько матчей CS2 сыграно на FACEIT; null — не удалось узнать */
async function faceitMatchCount(playerId: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (res.status === 404) return 0; // статистики по CS2 нет — ни одного матча
    if (!res.ok) return null;
    const s = await res.json();
    const n = Number(s?.lifetime?.Matches ?? s?.lifetime?.matches);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Когда закончился последний матч CS2 на FACEIT (мс); 0 — матчей нет; null — не удалось узнать */
async function faceitLastMatchAt(playerId: string, key: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&offset=0&limit=1`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const h = await res.json();
    const item = h?.items?.[0];
    if (!item) return 0;
    const t = Number(item.finished_at ?? item.started_at);
    if (!Number.isFinite(t) || t <= 0) return null;
    return t < 1e12 ? t * 1000 : t;
  } catch {
    return null;
  }
}

