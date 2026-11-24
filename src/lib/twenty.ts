import { unstable_cache } from "next/cache";
import { db } from "./supabase";
import { buildTwenty, mapEdge, type CoreGame, type CoreStat, type RoleKey } from "./twenty-core";

/*
 * «Двадцатка»: общий рейтинг игроков по играм на банк — «Десятка» и матчи больших лобби (20, 30 и 40 игроков).
 * Здесь только чтение из базы; сами расчёты (рейтинг, карты, роли, номинации, рекорды) — в twenty-core.ts.
 */

export { TWENTY_MIN_MAPS, MAP_MIN, ROLE_MIN_MAPS, DUO_MIN } from "./twenty-core";
export type { TwentyRow, MapBoard, MapCell, Nomination, RecordItem, Duo, Relations, RoleKey } from "./twenty-core";

export type TwentyEvening = { code: string; finished_at: string; matches: number };
export type TwentyPlayer = { nickname: string; avatar_url: string | null };
export type TwentyData = { games: CoreGame[]; stats: CoreStat[]; players: Record<string, TwentyPlayer> };

type GameRow = { id: string; winner: number | null; finished_at: string | null; maps: CoreGame["maps"] | null; settings: { cup_of?: { code?: string } | null } | null };
type StatRow = Omit<CoreStat, "k3" | "k4" | "k5" | "utility_damage" | "enemies_flashed" | "bomb_plants" | "bomb_defuses"> & { raw: Record<string, unknown> | null };

/** Все сыгранные игры на банк со статистикой по картам и никами игроков */
export async function loadTwentyData(): Promise<TwentyData> {
  const { data } = await db()
    .from("lobby_games")
    .select("id, winner, finished_at, maps, settings")
    .eq("status", "finished")
    .or("settings->>pot.eq.true,settings->>cup_of.not.is.null")
    .order("finished_at", { ascending: false })
    .limit(600);
  const games: CoreGame[] = ((data ?? []) as unknown as GameRow[]).map((g) => ({ id: g.id, code: g.settings?.cup_of?.code ?? null, winner: g.winner, finished_at: g.finished_at, maps: g.maps ?? [] }));

  // статистика по картам: порциями, чтобы не упереться в лимит строк ответа (BO5 — до 50 строк на игру)
  const stats: CoreStat[] = [];
  const ids = games.map((g) => g.id);
  for (let i = 0; i < ids.length; i += 15) {
    const { data: rows } = await db()
      .from("lobby_player_stats")
      .select("game_id, map_number, steam_id, name, team, kills, deaths, assists, damage, headshot_kills, rounds_played, kast, mvp, clutch_wins, first_kills, raw")
      .in("game_id", ids.slice(i, i + 15))
      .limit(1000);
    for (const { raw, ...s } of (rows ?? []) as unknown as StatRow[]) {
      const n = (k: string) => Number(raw?.[k] ?? 0) || 0;
      stats.push({ ...s, k3: n("3k"), k4: n("4k"), k5: n("5k"), utility_damage: n("utility_damage"), enemies_flashed: n("enemies_flashed"), bomb_plants: n("bomb_plants"), bomb_defuses: n("bomb_defuses") });
    }
  }

  const steamIds = [...new Set(stats.map((s) => s.steam_id))];
  const players: Record<string, TwentyPlayer> = {};
  for (let i = 0; i < steamIds.length; i += 200) {
    const { data: rows } = await db().from("players").select("steam_id, nickname, avatar_url").in("steam_id", steamIds.slice(i, i + 200));
    for (const p of rows ?? []) players[p.steam_id] = { nickname: p.nickname, avatar_url: p.avatar_url };
  }
  return { games, stats, players };
}

/**
 * Игрок в «Миксе» для его профиля: место, строка рейтинга, напарник и соперники. null — в рейтинге его нет.
 * В кэше до 2 минут и по одному игроку: свежесть до секунды профилю не нужна, а запись остаётся маленькой.
 */
export const getTwentyProfile = unstable_cache(
  async (steamId: string) => {
    const data = await loadTwentyData();
    const twenty = buildTwenty(data.games, data.stats);
    const place = twenty.rows.findIndex((r) => r.steam_id === steamId);
    if (place < 0) return null;
    const relations = twenty.relations(steamId);
    const players: Record<string, TwentyPlayer> = {};
    for (const id of [steamId, relations.partner?.steam_id, relations.nemesis?.steam_id, relations.victim?.steam_id]) if (id && data.players[id]) players[id] = data.players[id];
    return { place: place + 1, total: twenty.rows.length, row: twenty.rows[place], relations, players };
  },
  ["twenty-profile", "v1"],
  { revalidate: 120 },
);

/** Вечера: последние большие лобби, по которым есть сыгранные матчи */
export function eveningsOf(games: CoreGame[]): TwentyEvening[] {
  const byCode = new Map<string, TwentyEvening>();
  for (const g of games) {
    if (!g.code || !g.finished_at) continue;
    const e = byCode.get(g.code);
    if (!e) byCode.set(g.code, { code: g.code, finished_at: g.finished_at, matches: 1 });
    else e.matches++;
  }
  return [...byCode.values()].slice(0, 12);
}

/** Рейтинг и всё остальное для страницы «Двадцатка»; с кодом лобби — только один вечер */
export async function getTwenty(opts: { code?: string } = {}) {
  const data = await loadTwentyData();
  return { ...buildTwenty(data.games, data.stats, opts), players: data.players, evenings: eveningsOf(data.games) };
}

/** Короткая справка по игроку для комнаты лобби: рейтинг, роль, коронная карта и рейтинг по картам */
export type TwentyBrief = { rating: number; maps: number; role: RoleKey | null; best: { map: string; rating: number } | null; byMap: { map: string; rating: number; rounds: number }[] };

/**
 * Справки по всем игрокам «Двадцатки» — комната лобби опрашивается раз в 1,5 с, поэтому результат лежит в кэше 5 минут:
 * подсказки капитанам не обязаны меняться в ту же секунду, когда закончилась карта.
 */
export const twentyBriefs = unstable_cache(
  async (): Promise<Record<string, TwentyBrief>> => {
    const data = await loadTwentyData();
    const out: Record<string, TwentyBrief> = {};
    for (const r of buildTwenty(data.games, data.stats).rows) {
      out[r.steam_id] = {
        rating: Math.round(r.rating * 100) / 100,
        maps: r.maps,
        role: r.role,
        best: r.best ? { map: r.best.map, rating: Math.round(r.best.rating * 100) / 100 } : null,
        byMap: r.byMap.map((c) => ({ map: c.map, rating: c.rating, rounds: c.rounds })),
      };
    }
    return out;
  },
  ["twenty-briefs", "v1"],
  { revalidate: 300 },
);

/** Перевес команд по картам пула — для вето (см. mapEdge) */
export function vetoEdge(briefs: Record<string, TwentyBrief>, team1: string[], team2: string[], pool: string[]) {
  const edge = mapEdge(Object.entries(briefs).map(([steam_id, b]) => ({ steam_id, byMap: b.byMap })), team1, team2, pool);
  const round = (x: { rating: number; known: number } | null) => (x ? { rating: Math.round(x.rating * 100) / 100, known: x.known } : null);
  return Object.fromEntries(Object.entries(edge).map(([map, e]) => [map, { team1: round(e.team1), team2: round(e.team2) }]));
}
