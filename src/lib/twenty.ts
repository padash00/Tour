import { db } from "./supabase";

/*
 * «Двадцатка»: общий рейтинг игроков по играм на банк — «Десятка» и матчи больших лобби (20, 30 и 40 игроков).
 * Считается по всем сыгранным картам таких лобби; с кодом лобби — только по одному вечеру.
 * Формула — та же база, что у рейтинга турниров (аппроксимация HLTV 2.0): средний игрок ≈ 1.00.
 */

export type TwentyRow = {
  steam_id: string;
  nickname: string;
  avatar_url: string | null;
  /** сыграно карт */
  maps: number;
  /** сыграно и выиграно матчей (серий) */
  matches: number;
  wins: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  adr: number;
  hsPct: number;
  /** доля раундов с пользой, %; 0 — сервер её не прислал */
  kast: number;
  mvp: number;
  rating: number;
};

export type TwentyEvening = { code: string; finished_at: string; matches: number };

/** В общий рейтинг попадают сыгравшие хотя бы столько карт — одна удачная карта не делает королём */
export const TWENTY_MIN_MAPS = 2;

type Agg = { name: string | null; maps: number; games: Set<string>; wins: Set<string>; rounds: number; kills: number; deaths: number; assists: number; damage: number; hs: number; kast: number; mvp: number; clutches: number };

function rate(a: Agg) {
  const r = Math.max(1, a.rounds);
  const kpr = a.kills / r;
  const dpr = a.deaths / r;
  const apr = a.assists / r;
  const adr = a.damage / r;
  // KAST приходит не со всех матчей: без него берём типичные 70%, чтобы рейтинг оставался около 1.00
  const kast = a.kast > 0 ? (100 * a.kast) / r : 70;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41 + (1.5 * a.clutches) / r;
  const rating = 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
  return { adr, kast: a.kast > 0 ? kast : 0, rating: a.rounds ? rating : 0 };
}

type GameRow = { id: string; winner: number | null; finished_at: string | null; settings: { cup_of?: { code?: string } | null } | null };
type StatRow = { game_id: string; steam_id: string; name: string | null; team: number; kills: number; deaths: number; assists: number; damage: number; headshot_kills: number; rounds_played: number; kast: number; mvp: number; clutch_wins: number };

export async function twentyRating(opts: { code?: string } = {}): Promise<{ rows: TwentyRow[]; evenings: TwentyEvening[]; matches: number }> {
  let q = db().from("lobby_games").select("id, winner, finished_at, settings").eq("status", "finished").or("settings->>pot.eq.true,settings->>cup_of.not.is.null").order("finished_at", { ascending: false }).limit(600);
  if (opts.code) q = q.eq("settings->cup_of->>code", opts.code);
  const { data } = await q;
  const games = (data ?? []) as unknown as GameRow[];
  const winnerOf = new Map(games.map((g) => [g.id, g.winner]));

  // вечера: последние большие лобби, по которым есть сыгранные матчи
  const byCode = new Map<string, TwentyEvening>();
  for (const g of games) {
    const code = g.settings?.cup_of?.code;
    if (!code || !g.finished_at) continue;
    const e = byCode.get(code);
    if (!e) byCode.set(code, { code, finished_at: g.finished_at, matches: 1 });
    else e.matches++;
  }

  // статистика по картам: порциями, чтобы не упереться в лимит строк ответа
  const stats: StatRow[] = [];
  const ids = games.map((g) => g.id);
  for (let i = 0; i < ids.length; i += 25) {
    const { data: rows } = await db()
      .from("lobby_player_stats")
      .select("game_id, steam_id, name, team, kills, deaths, assists, damage, headshot_kills, rounds_played, kast, mvp, clutch_wins")
      .in("game_id", ids.slice(i, i + 25))
      .limit(1000);
    stats.push(...((rows ?? []) as StatRow[]));
  }

  const agg = new Map<string, Agg>();
  for (const s of stats) {
    if (!s.rounds_played) continue;
    let a = agg.get(s.steam_id);
    if (!a) agg.set(s.steam_id, (a = { name: s.name, maps: 0, games: new Set(), wins: new Set(), rounds: 0, kills: 0, deaths: 0, assists: 0, damage: 0, hs: 0, kast: 0, mvp: 0, clutches: 0 }));
    a.maps++;
    a.games.add(s.game_id);
    if (winnerOf.get(s.game_id) === s.team) a.wins.add(s.game_id);
    a.rounds += s.rounds_played;
    a.kills += s.kills;
    a.deaths += s.deaths;
    a.assists += s.assists;
    a.damage += s.damage;
    a.hs += s.headshot_kills;
    a.kast += s.kast;
    a.mvp += s.mvp;
    a.clutches += s.clutch_wins;
  }

  const steamIds = [...agg.keys()];
  const players = new Map<string, { nickname: string; avatar_url: string | null }>();
  for (let i = 0; i < steamIds.length; i += 200) {
    const { data: rows } = await db().from("players").select("steam_id, nickname, avatar_url").in("steam_id", steamIds.slice(i, i + 200));
    for (const p of rows ?? []) players.set(p.steam_id, { nickname: p.nickname, avatar_url: p.avatar_url });
  }

  const minMaps = opts.code ? 1 : TWENTY_MIN_MAPS;
  const rows: TwentyRow[] = [...agg.entries()]
    .filter(([, a]) => a.maps >= minMaps)
    .map(([steam_id, a]) => {
      const r = rate(a);
      const p = players.get(steam_id);
      return {
        steam_id,
        nickname: p?.nickname ?? a.name ?? steam_id,
        avatar_url: p?.avatar_url ?? null,
        maps: a.maps,
        matches: a.games.size,
        wins: a.wins.size,
        rounds: a.rounds,
        kills: a.kills,
        deaths: a.deaths,
        assists: a.assists,
        kd: a.deaths ? a.kills / a.deaths : a.kills,
        adr: r.adr,
        hsPct: a.kills ? (100 * a.hs) / a.kills : 0,
        kast: r.kast,
        mvp: a.mvp,
        rating: r.rating,
      };
    })
    .sort((x, y) => y.rating - x.rating || y.maps - x.maps);

  return { rows, evenings: [...byCode.values()].slice(0, 12), matches: games.length };
}
