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
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const p = await res.json();
    const cs2 = p?.games?.cs2;
    return {
      id: p.player_id,
      nickname: p.nickname,
      level: cs2?.skill_level ?? null,
      elo: cs2?.faceit_elo ?? null,
    };
  } catch {
    return null;
  }
}
