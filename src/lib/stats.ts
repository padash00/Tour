import "server-only";
import { db } from "./supabase";
import type { Match, MatchMap, Player, Team, VetoActionRow } from "./types";

export type MapStatRow = {
  match_id: string;
  map_number: number;
  steam_id: string;
  player_id: string | null;
  team_id: string | null;
  name: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshot_kills: number;
  rounds_played: number;
  kast: number;
  first_kills: number;
  first_deaths: number;
  trade_kills: number;
  clutch_wins: number;
  multi_kills: { "2k"?: number; "3k"?: number; "4k"?: number; "5k"?: number };
  utility_damage: number;
  enemies_flashed: number;
  flash_assists: number;
  bomb_plants: number;
  bomb_defuses: number;
  mvp: number;
};

export type PlayerAgg = {
  steam_id: string;
  player_id: string | null;
  name: string;
  team_id: string | null;
  maps: number;
  matches: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  hs: number;
  kastRounds: number;
  firstKills: number;
  firstDeaths: number;
  trades: number;
  clutches: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  utilityDamage: number;
  // производные
  kd: number;
  adr: number;
  kast: number; // %
  hsPct: number; // %
  kpr: number;
  rating: number;
};

/**
 * F16 Rating v1. Зафиксирован до начала первого турнира.
 * База — открытая аппроксимация HLTV Rating 2.0, Impact расширен entry, клатчами, мультикиллами и трейдами:
 *
 *   Impact = 2.13·KPR + 0.42·APR − 0.41 + (FK − FD)/R + 1.5·Clutch/R + MK/R + 0.5·Trades/R
 *   MK     = 0.25·2K + 0.5·3K + 1·4K + 2·5K
 *   Rating = 0.0073·KAST% + 0.3591·KPR − 0.5329·DPR + 0.2372·Impact + 0.0032·ADR + 0.1587
 *
 * Средний игрок ≈ 1.00. Считается по всем раундам игрока, не как среднее рейтингов карт.
 */
export const F16_RATING_VERSION = "v1";

function rate(a: Omit<PlayerAgg, "kd" | "adr" | "kast" | "hsPct" | "kpr" | "rating">) {
  const r = Math.max(1, a.rounds);
  const kpr = a.kills / r;
  const dpr = a.deaths / r;
  const apr = a.assists / r;
  const adr = a.damage / r;
  const kast = (100 * a.kastRounds) / r;
  const mk = 0.25 * a.k2 + 0.5 * a.k3 + 1 * a.k4 + 2 * a.k5;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41 + (a.firstKills - a.firstDeaths) / r + (1.5 * a.clutches) / r + mk / r + (0.5 * a.trades) / r;
  const rating = 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
  return {
    kd: a.deaths ? a.kills / a.deaths : a.kills,
    adr,
    kast,
    hsPct: a.kills ? (100 * a.hs) / a.kills : 0,
    kpr,
    rating: a.rounds ? rating : 0,
  };
}

export function aggregatePlayers(rows: MapStatRow[]): PlayerAgg[] {
  const by = new Map<string, MapStatRow[]>();
  for (const r of rows) {
    if (!by.has(r.steam_id)) by.set(r.steam_id, []);
    by.get(r.steam_id)!.push(r);
  }
  return [...by.values()].map((list) => {
    const sum = (f: (r: MapStatRow) => number) => list.reduce((acc, r) => acc + (f(r) || 0), 0);
    const last = list[list.length - 1];
    const base = {
      steam_id: last.steam_id,
      player_id: list.find((r) => r.player_id)?.player_id ?? null,
      name: last.name ?? last.steam_id,
      team_id: last.team_id,
      maps: list.filter((r) => r.rounds_played > 0).length,
      matches: new Set(list.map((r) => r.match_id)).size,
      rounds: sum((r) => r.rounds_played),
      kills: sum((r) => r.kills),
      deaths: sum((r) => r.deaths),
      assists: sum((r) => r.assists),
      damage: sum((r) => r.damage),
      hs: sum((r) => r.headshot_kills),
      kastRounds: sum((r) => r.kast),
      firstKills: sum((r) => r.first_kills),
      firstDeaths: sum((r) => r.first_deaths),
      trades: sum((r) => r.trade_kills),
      clutches: sum((r) => r.clutch_wins),
      k2: sum((r) => r.multi_kills?.["2k"] ?? 0),
      k3: sum((r) => r.multi_kills?.["3k"] ?? 0),
      k4: sum((r) => r.multi_kills?.["4k"] ?? 0),
      k5: sum((r) => r.multi_kills?.["5k"] ?? 0),
      utilityDamage: sum((r) => r.utility_damage),
    };
    return { ...base, ...rate(base) };
  });
}

// ───────────────────────── выборки

/** Статистика по завершённым и идущим матчам опубликованных турниров (или одного турнира) */
export async function getStatRows(filter: { tournamentId?: string; playerId?: string; matchId?: string } = {}) {
  let q = db()
    .from("player_map_stats")
    .select("*, match:matches!inner(id, tournament_id, status, tournament:tournaments!inner(status))")
    .neq("match.tournament.status", "draft")
    .gt("rounds_played", 0);
  if (filter.tournamentId) q = q.eq("match.tournament_id", filter.tournamentId);
  if (filter.playerId) q = q.eq("player_id", filter.playerId);
  if (filter.matchId) q = q.eq("match_id", filter.matchId);
  const { data } = await q.limit(5000);
  return (data ?? []) as MapStatRow[];
}

export async function getPlayerLeaderboard(tournamentId?: string) {
  const rows = await getStatRows({ tournamentId });
  const agg = aggregatePlayers(rows);
  const ids = [...new Set(agg.map((a) => a.team_id).filter(Boolean))] as string[];
  const pids = agg.map((a) => a.player_id).filter(Boolean) as string[];
  const [{ data: teams }, { data: players }] = await Promise.all([
    ids.length ? db().from("teams").select("id, name, tag, logo_url").in("id", ids) : Promise.resolve({ data: [] }),
    pids.length ? db().from("players").select("id, nickname, avatar_url, steam_id").in("id", pids) : Promise.resolve({ data: [] }),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t as Pick<Team, "id" | "name" | "tag" | "logo_url">]));
  const playerById = new Map((players ?? []).map((p) => [p.id, p as Pick<Player, "id" | "nickname" | "avatar_url" | "steam_id">]));
  return agg
    .map((a) => ({
      ...a,
      team: a.team_id ? (teamById.get(a.team_id) ?? null) : null,
      player: a.player_id ? (playerById.get(a.player_id) ?? null) : null,
    }))
    .sort((a, b) => b.rating - a.rating);
}

/**
 * MVP турнира: лучший F16 Rating среди игроков, сыгравших не меньше половины карт своей команды
 * (минимум 2 карты), чтобы рейтинг по одной карте не побеждал.
 */
export async function getTournamentMvp(tournamentId: string) {
  const board = await getPlayerLeaderboard(tournamentId);
  if (board.length === 0) return null;
  const teamMaps = new Map<string, number>();
  for (const p of board) if (p.team_id) teamMaps.set(p.team_id, Math.max(teamMaps.get(p.team_id) ?? 0, p.maps));
  const eligible = board.filter((p) => p.maps >= Math.max(2, Math.ceil((teamMaps.get(p.team_id ?? "") ?? 0) / 2)));
  return eligible[0] ?? null;
}

export type TeamAgg = {
  team: Pick<Team, "id" | "name" | "tag" | "logo_url">;
  matches: number;
  wins: number;
  maps: number;
  mapWins: number;
  roundsFor: number;
  roundsAgainst: number;
};

export async function getTeamTable(tournamentId?: string): Promise<TeamAgg[]> {
  let q = db()
    .from("matches")
    .select(
      "id, team1_id, team2_id, winner_id, is_walkover, tournament_id, maps:match_maps(team1_score, team2_score, winner_id, status), team1:teams!matches_team1_id_fkey(id, name, tag, logo_url), team2:teams!matches_team2_id_fkey(id, name, tag, logo_url), tournament:tournaments!inner(status)",
    )
    .eq("status", "finished")
    .eq("is_walkover", false)
    .neq("tournament.status", "draft");
  if (tournamentId) q = q.eq("tournament_id", tournamentId);
  const { data } = await q;
  type Row = Pick<Match, "id" | "team1_id" | "team2_id" | "winner_id"> & {
    maps: Pick<MatchMap, "team1_score" | "team2_score" | "winner_id" | "status">[];
    team1: TeamAgg["team"];
    team2: TeamAgg["team"];
  };
  const table = new Map<string, TeamAgg>();
  const get = (t: TeamAgg["team"]) => {
    if (!table.has(t.id)) table.set(t.id, { team: t, matches: 0, wins: 0, maps: 0, mapWins: 0, roundsFor: 0, roundsAgainst: 0 });
    return table.get(t.id)!;
  };
  for (const m of (data ?? []) as unknown as Row[]) {
    for (const [side, team] of [[1, m.team1], [2, m.team2]] as const) {
      if (!team) continue;
      const t = get(team);
      t.matches++;
      if (m.winner_id === team.id) t.wins++;
      for (const map of m.maps.filter((x) => x.status === "finished")) {
        t.maps++;
        if (map.winner_id === team.id) t.mapWins++;
        t.roundsFor += side === 1 ? map.team1_score : map.team2_score;
        t.roundsAgainst += side === 1 ? map.team2_score : map.team1_score;
      }
    }
  }
  return [...table.values()].sort((a, b) => b.wins / Math.max(1, b.matches) - a.wins / Math.max(1, a.matches) || b.wins - a.wins);
}

export type MapAgg = { map: string; played: number; picked: number; banned: number; avgRounds: number };

export async function getMapTable(tournamentId?: string): Promise<MapAgg[]> {
  let mq = db()
    .from("match_maps")
    .select("map_name, team1_score, team2_score, status, picked_by, match:matches!inner(tournament_id, tournament:tournaments!inner(status))")
    .eq("status", "finished")
    .neq("match.tournament.status", "draft");
  let vq = db()
    .from("veto_actions")
    .select("map_name, action, match:matches!inner(tournament_id, tournament:tournaments!inner(status))")
    .neq("match.tournament.status", "draft");
  if (tournamentId) {
    mq = mq.eq("match.tournament_id", tournamentId);
    vq = vq.eq("match.tournament_id", tournamentId);
  }
  const [{ data: maps }, { data: veto }] = await Promise.all([mq, vq]);
  const table = new Map<string, MapAgg & { rounds: number }>();
  const get = (map: string) => {
    if (!table.has(map)) table.set(map, { map, played: 0, picked: 0, banned: 0, avgRounds: 0, rounds: 0 });
    return table.get(map)!;
  };
  for (const m of (maps ?? []) as unknown as Pick<MatchMap, "map_name" | "team1_score" | "team2_score">[]) {
    const t = get(m.map_name);
    t.played++;
    t.rounds += m.team1_score + m.team2_score;
  }
  for (const v of (veto ?? []) as unknown as Pick<VetoActionRow, "map_name" | "action">[]) {
    const t = get(v.map_name);
    if (v.action === "pick") t.picked++;
    if (v.action === "ban") t.banned++;
  }
  return [...table.values()]
    .map(({ rounds, ...t }) => ({ ...t, avgRounds: t.played ? rounds / t.played : 0 }))
    .sort((a, b) => b.played - a.played || b.picked - a.picked);
}

/** История карт игрока: по каждой карте — счёт и его показатели */
export async function getPlayerMapHistory(playerId: string) {
  const { data } = await db()
    .from("player_map_stats")
    .select(
      "*, match:matches!inner(id, number, team1_id, team2_id, winner_id, status, tournament:tournaments!inner(name, slug, status), team1:teams!matches_team1_id_fkey(name, tag), team2:teams!matches_team2_id_fkey(name, tag), maps:match_maps(map_number, map_name, team1_score, team2_score))",
    )
    .eq("player_id", playerId)
    .neq("match.tournament.status", "draft")
    .gt("rounds_played", 0)
    .order("updated_at", { ascending: false })
    .limit(30);
  type Row = MapStatRow & {
    match: Pick<Match, "id" | "number" | "team1_id" | "team2_id" | "winner_id" | "status"> & {
      tournament: { name: string; slug: string };
      team1: { name: string; tag: string } | null;
      team2: { name: string; tag: string } | null;
      maps: Pick<MatchMap, "map_number" | "map_name" | "team1_score" | "team2_score">[];
    };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const agg = aggregatePlayers([r])[0];
    const map = r.match.maps.find((x) => x.map_number === r.map_number);
    const mySide = r.team_id === r.match.team1_id ? 1 : 2;
    return {
      key: `${r.match_id}:${r.map_number}`,
      matchId: r.match.id,
      tournament: r.match.tournament,
      opponent: mySide === 1 ? r.match.team2 : r.match.team1,
      mapName: map?.map_name ?? "",
      scoreFor: map ? (mySide === 1 ? map.team1_score : map.team2_score) : 0,
      scoreAgainst: map ? (mySide === 1 ? map.team2_score : map.team1_score) : 0,
      stats: agg,
    };
  });
}
