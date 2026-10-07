import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import { roundFacts, updateRoster, type LogEvent, type Side } from "./swing";
import type { Tables } from "./database.types";
import type { Narrow, Player, Team } from "./types";

/** Строка player_map_stats (без сырого отчёта MatchZy) + swing из player_map_swing */
export type MapStatRow = Narrow<
  Omit<Tables<"player_map_stats">, "raw" | "updated_at">,
  { multi_kills: { "2k"?: number; "3k"?: number; "4k"?: number; "5k"?: number } }
> & {
  swing_sum?: number;
  swing_rounds?: number;
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
  swingSum: number;
  swingRounds: number;
  // производные
  kd: number;
  adr: number;
  kast: number; // %
  hsPct: number; // %
  kpr: number;
  rating: number;
  /** средний вклад в шанс победы раунда, п.п. за раунд; null — нет данных лога */
  swing: number | null;
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

function rate(a: Omit<PlayerAgg, "kd" | "adr" | "kast" | "hsPct" | "kpr" | "rating" | "swing">) {
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
    swing: a.swingRounds ? (100 * a.swingSum) / a.swingRounds : null,
  };
}

const isDuel = (r: MapStatRow) =>
  (r as MapStatRow & { match?: { tournament?: { format?: string } } }).match?.tournament?.format === "1v1";

export function aggregatePlayers(rows: MapStatRow[]): PlayerAgg[] {
  const by = new Map<string, MapStatRow[]>();
  for (const r of rows) {
    if (!by.has(r.steam_id)) by.set(r.steam_id, []);
    by.get(r.steam_id)!.push(r);
  }
  return [...by.values()].map((list) => {
    const sum = (f: (r: MapStatRow) => number) => list.reduce((acc, r) => acc + (f(r) || 0), 0);
    // в дуэли 1×1 каждое убийство — и первое в раунде, и «клатч 1 на 1»: эти цифры берём только из командных матчей
    const team = (f: (r: MapStatRow) => number) => (r: MapStatRow) => (isDuel(r) ? 0 : f(r));
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
      firstKills: sum(team((r) => r.first_kills)),
      firstDeaths: sum(team((r) => r.first_deaths)),
      trades: sum((r) => r.trade_kills),
      clutches: sum(team((r) => r.clutch_wins)),
      k2: sum((r) => r.multi_kills?.["2k"] ?? 0),
      k3: sum((r) => r.multi_kills?.["3k"] ?? 0),
      k4: sum((r) => r.multi_kills?.["4k"] ?? 0),
      k5: sum((r) => r.multi_kills?.["5k"] ?? 0),
      utilityDamage: sum((r) => r.utility_damage),
      swingSum: sum((r) => r.swing_sum ?? 0),
      swingRounds: sum((r) => r.swing_rounds ?? 0),
    };
    return { ...base, ...rate(base) };
  });
}

// ───────────────────────── выборки

/** PostgREST отдаёт не больше max_rows (по умолчанию 1000) строк за запрос — длинные выборки читаем страницами */
const PAGE = 1000;
/** Сколько id за раз передаём в .in(...) — чтобы не упереться в длину URL */
const IN_CHUNK = 150;

/**
 * Читает выборку целиком страницами по PAGE строк. page(from, to) должен каждый раз строить НОВЫЙ запрос
 * со стабильным .order(...) (иначе страницы могут пересекаться) и вызывать .range(from, to).
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) {
      console.error("stats: fetchAll", error);
      break;
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** fetchAll по кускам списка id (для .in(...)) */
async function fetchAllIn<T>(ids: string[], page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
  const parts = await Promise.all(chunks.map((c) => fetchAll<T>((from, to) => page(c, from, to))));
  return parts.flat();
}

/** Статистика по завершённым и идущим матчам опубликованных турниров (или одного турнира) */
export function getStatRows(filter: { tournamentId?: string; playerId?: string; matchId?: string } = {}) {
  // cache() сравнивает аргументы по ссылке — разворачиваем фильтр в примитивы
  return statRowsCached(filter.tournamentId, filter.playerId, filter.matchId);
}

const statRowsCached = cache(async (tournamentId?: string, playerId?: string, matchId?: string) => {
  const rows = await fetchAll<MapStatRow & { updated_at?: string }>((from, to) => {
    let q = db()
      .from("player_map_stats")
      .select("*, match:matches!inner(id, tournament_id, status, tournament:tournaments!inner(status, format))")
      .neq("match.tournament.status", "draft")
      .gt("rounds_played", 0);
    if (tournamentId) q = q.eq("match.tournament_id", tournamentId);
    if (playerId) q = q.eq("player_id", playerId);
    if (matchId) q = q.eq("match_id", matchId);
    return q.order("match_id").order("map_number").order("steam_id").range(from, to);
  });
  // постранично читаем по первичному ключу (стабильно), а для агрегации — по времени обновления:
  // имя и команда игрока берутся из последней строки
  rows.sort((a, b) => (a.updated_at ?? "").localeCompare(b.updated_at ?? ""));
  return attachLogFacts(await attachSwing(rows));
});

/**
 * MatchZy присылает KAST и первые фраги нулями — считаем их сами по сохранённым событиям раундов
 * (match_rounds из HTTP-лога сервера). Только для карт, где MatchZy их не дал.
 */
async function attachLogFacts(rows: MapStatRow[]) {
  const empty = new Set<string>();
  const byMap = new Map<string, MapStatRow[]>();
  for (const r of rows) {
    const k = `${r.match_id}:${r.map_number}`;
    if (!byMap.has(k)) byMap.set(k, []);
    byMap.get(k)!.push(r);
  }
  for (const [k, list] of byMap) if (list.every((r) => !r.kast && !r.first_kills && !r.first_deaths)) empty.add(k);
  if (empty.size === 0) return rows;
  const matchIds = [...new Set([...empty].map((k) => k.split(":")[0]))];
  const data = await fetchAllIn<{ match_id: string; map_number: number; round_number: number; events: LogEvent[] }>(matchIds, (ids, from, to) =>
    db()
      .from("match_rounds")
      .select("match_id, map_number, round_number, events")
      .in("match_id", ids)
      .order("match_id")
      .order("map_number")
      .order("round_number")
      .range(from, to),
  );
  // куски по match_id приходят независимо — карты одного матча всегда в одном куске, порядок внутри сохранён
  const facts = new Map<string, { kast: number; fk: number; fd: number }>();
  const bump = (key: string, f: "kast" | "fk" | "fd") => {
    const cur = facts.get(key) ?? { kast: 0, fk: 0, fd: 0 };
    cur[f]++;
    facts.set(key, cur);
  };
  let roster = new Map<string, Side>();
  let mapKey = "";
  for (const r of data) {
    const k = `${r.match_id}:${r.map_number}`;
    if (!empty.has(k)) continue;
    if (k !== mapKey) {
      roster = new Map();
      mapKey = k;
    }
    updateRoster(roster, r.events);
    const f = roundFacts(r.events, roster.keys());
    for (const id of f.kast) bump(`${k}:${id}`, "kast");
    if (f.firstKill) bump(`${k}:${f.firstKill}`, "fk");
    if (f.firstDeath) bump(`${k}:${f.firstDeath}`, "fd");
  }
  for (const r of rows) {
    const f = facts.get(`${r.match_id}:${r.map_number}:${r.steam_id}`);
    if (!f) continue;
    r.kast = Math.min(f.kast, r.rounds_played);
    r.first_kills = f.fk;
    r.first_deaths = f.fd;
  }
  return rows;
}

/** Подмешивает swing из player_map_swing к строкам статистики (по матчу, карте и SteamID) */
async function attachSwing<R extends MapStatRow>(rows: R[]): Promise<R[]> {
  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  if (matchIds.length === 0) return rows;
  const data = await fetchAllIn<{ match_id: string; map_number: number; steam_id: string; swing_sum: number; rounds: number }>(matchIds, (ids, from, to) =>
    db()
      .from("player_map_swing")
      .select("match_id, map_number, steam_id, swing_sum, rounds")
      .in("match_id", ids)
      .order("match_id")
      .order("map_number")
      .order("steam_id")
      .range(from, to),
  );
  const key = (m: string, n: number, s: string) => `${m}:${n}:${s}`;
  const swing = new Map(data.map((r) => [key(r.match_id, r.map_number, r.steam_id), r]));
  for (const r of rows) {
    const s = swing.get(key(r.match_id, r.map_number, r.steam_id));
    if (s) {
      r.swing_sum = s.swing_sum;
      r.swing_rounds = s.rounds;
    }
  }
  return rows;
}

export type LeaderboardRow = Awaited<ReturnType<typeof getPlayerLeaderboard>>[number];

/** Таблица игроков (по рейтингу). В пределах запроса считается один раз на турнир */
export const getPlayerLeaderboard = cache(async (tournamentId?: string) => {
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
});

/**
 * MVP турнира: лучший Swing (средний вклад в шанс победы раунда) среди игроков, сыгравших
 * не меньше половины карт своей команды (минимум 2 карты). Если данных Swing нет — по F16 Rating.
 */
export async function getTournamentMvp(tournamentId: string, precomputed?: LeaderboardRow[]) {
  return mvpOf(precomputed ?? (await getPlayerLeaderboard(tournamentId)));
}

/** MVP по готовой таблице игроков турнира (без лишних запросов) */
export function mvpOf(board: LeaderboardRow[]) {
  if (board.length === 0) return null;
  const teamMaps = new Map<string, number>();
  for (const p of board) if (p.team_id) teamMaps.set(p.team_id, Math.max(teamMaps.get(p.team_id) ?? 0, p.maps));
  const eligible = board.filter((p) => p.maps >= Math.max(2, Math.ceil((teamMaps.get(p.team_id ?? "") ?? 0) / 2)));
  const withSwing = eligible.filter((p) => p.swing != null);
  if (withSwing.length) return { ...withSwing.sort((a, b) => b.swing! - a.swing!)[0], by: "swing" as const };
  return eligible[0] ? { ...eligible[0], by: "rating" as const } : null;
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
  const table = new Map<string, TeamAgg>();
  const get = (t: TeamAgg["team"]) => {
    if (!table.has(t.id)) table.set(t.id, { team: t, matches: 0, wins: 0, maps: 0, mapWins: 0, roundsFor: 0, roundsAgainst: 0 });
    return table.get(t.id)!;
  };
  for (const m of data ?? []) {
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

export type TeamStatRow = TeamAgg & {
  /** куда ведёт имя: страница команды или профиль игрока (1×1) */
  href: string;
  kills: number;
  deaths: number;
  damage: number;
  hs: number;
  /** сколько игроков команды играли */
  players: number;
  /** сумма раундов, сыгранных игроками команды — ADR = урон / эти раунды */
  rounds: number;
};

/**
 * Статистика команд: результаты серий/карт/раундов + сумма по игрокам (K, D, урон, хедшоты).
 * Порядок: победы → разница карт → разница раундов.
 */
export async function getTeamStats(tournamentId?: string, precomputed?: LeaderboardRow[]): Promise<TeamStatRow[]> {
  const [players, table] = await Promise.all([precomputed ?? getPlayerLeaderboard(tournamentId), getTeamTable(tournamentId)]);
  const zero = { kills: 0, deaths: 0, damage: 0, hs: 0, players: 0, rounds: 0 };
  const sums = new Map<string, typeof zero>();
  for (const p of players) {
    if (!p.team_id) continue;
    const s = sums.get(p.team_id) ?? { ...zero };
    s.kills += p.kills;
    s.deaths += p.deaths;
    s.damage += p.damage;
    s.hs += p.hs;
    s.players++;
    s.rounds += p.rounds;
    sums.set(p.team_id, s);
  }
  const hrefs = await teamHrefs(table.map((t) => t.team.id));
  return table
    .map((t) => ({ ...t, ...(sums.get(t.team.id) ?? zero), href: hrefs.get(t.team.id) ?? `/teams/${t.team.tag}` }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.mapWins - (b.maps - b.mapWins) - (a.mapWins - (a.maps - a.mapWins)) ||
        b.roundsFor - b.roundsAgainst - (a.roundsFor - a.roundsAgainst),
    );
}

export type WeaponStat = { weapon: string; kills: number; hs: number };

/** Убийства игрока по оружию — из событий раундов (лог сервера); только убийства соперников */
export async function getPlayerWeapons(steamId: string, matchIds: string[]): Promise<WeaponStat[]> {
  if (!matchIds.length) return [];
  const data = await fetchAllIn<{ events: LogEvent[] }>([...new Set(matchIds)], (ids, from, to) =>
    db().from("match_rounds").select("events").in("match_id", ids).order("match_id").order("map_number").order("round_number").range(from, to),
  );
  const by = new Map<string, WeaponStat>();
  for (const r of data) {
    for (const e of r.events ?? []) {
      if (e.type !== "kill" || e.killer.steamId !== steamId || !e.killer.side || e.killer.side === e.victim.side) continue;
      const w = (e.weapon || "unknown").replace(/^weapon_/, "");
      const cur = by.get(w) ?? { weapon: w, kills: 0, hs: 0 };
      cur.kills++;
      if (e.headshot) cur.hs++;
      by.set(w, cur);
    }
  }
  return [...by.values()].sort((a, b) => b.kills - a.kills);
}

export type HeadToHead = {
  opponent: Pick<Team, "id" | "name" | "tag" | "logo_url">;
  href: string;
  matches: number;
  wins: number;
  maps: number;
  mapWins: number;
  roundsFor: number;
  roundsAgainst: number;
};

/** Личные встречи: соперники команд(ы) по сыгранным (не техническим) матчам опубликованных турниров */
/** matchIds — только эти матчи (для игрока: те, где он сам играл) */
export async function getHeadToHead({ teamIds, matchIds }: { teamIds: string[]; matchIds?: string[] }): Promise<HeadToHead[]> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (!ids.length) return [];
  if (matchIds && !matchIds.length) return [];
  const list = ids.join(",");
  let q = db()
    .from("matches")
    .select(
      "id, team1_id, team2_id, winner_id, maps:match_maps(team1_score, team2_score, winner_id, status), team1:teams!matches_team1_id_fkey(id, name, tag, logo_url), team2:teams!matches_team2_id_fkey(id, name, tag, logo_url), tournament:tournaments!inner(status)",
    )
    .eq("status", "finished")
    .eq("is_walkover", false)
    .neq("tournament.status", "draft")
    .or(`team1_id.in.(${list}),team2_id.in.(${list})`);
  if (matchIds) q = q.in("id", matchIds);
  const { data } = await q;
  const by = new Map<string, HeadToHead>();
  for (const m of data ?? []) {
    const mine = ids.includes(m.team1_id ?? "") ? 1 : 2;
    const me = mine === 1 ? m.team1_id : m.team2_id;
    const opp = mine === 1 ? m.team2 : m.team1;
    if (!opp || !me || ids.includes(opp.id)) continue;
    const h = by.get(opp.id) ?? { opponent: opp, href: "", matches: 0, wins: 0, maps: 0, mapWins: 0, roundsFor: 0, roundsAgainst: 0 };
    h.matches++;
    if (m.winner_id === me) h.wins++;
    for (const map of m.maps.filter((x) => x.status === "finished")) {
      h.maps++;
      if (map.winner_id === me) h.mapWins++;
      h.roundsFor += mine === 1 ? map.team1_score : map.team2_score;
      h.roundsAgainst += mine === 1 ? map.team2_score : map.team1_score;
    }
    by.set(opp.id, h);
  }
  const hrefs = await teamHrefs([...by.keys()]);
  for (const h of by.values()) h.href = hrefs.get(h.opponent.id) ?? `/teams/${h.opponent.tag}`;
  return [...by.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins);
}

/**
 * Ссылка на команду: у «одиночной» команды (дуэли 1×1) своей страницы нет — ведём в профиль игрока.
 * id команды → href
 */
export async function teamHrefs(teamIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(teamIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data: teams } = await db().from("teams").select("id, tag, is_solo, captain_id").in("id", ids);
  const solo = (teams ?? []).filter((t) => t.is_solo && t.captain_id);
  const { data: caps } = solo.length
    ? await db().from("players").select("id, steam_id").in("id", solo.map((t) => t.captain_id))
    : { data: [] };
  const steam = new Map((caps ?? []).map((p) => [p.id, p.steam_id as string]));
  for (const t of teams ?? []) {
    const sid = t.is_solo ? steam.get(t.captain_id) : undefined;
    out.set(t.id, sid ? `/players/${sid}` : `/teams/${encodeURIComponent(t.tag)}`);
  }
  return out;
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
  for (const m of maps ?? []) {
    const t = get(m.map_name);
    t.played++;
    t.rounds += m.team1_score + m.team2_score;
  }
  for (const v of veto ?? []) {
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
    .limit(30)
    .overrideTypes<{ multi_kills: MapStatRow["multi_kills"] }[]>();
  const rows = await attachSwing(data ?? []);
  return rows.map((r) => {
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
