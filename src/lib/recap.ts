import "server-only";
import { roundTitle } from "./bracket";
import { getTournamentRegistrations } from "./data";
import { getStandings, getTournamentMatches, type MatchWithTeams } from "./matches";
import { getPlayerLeaderboard, getTournamentMvp } from "./stats";
import { db } from "./supabase";
import type { MatchMap, Player, Team, Tournament } from "./types";

/*
 * Итоги турнира: призёры, путь чемпиона, MVP, лидеры статистики и цифры турнира.
 * Только реальные данные; если чего-то нет (статистика не собиралась) — поле пустое.
 */

export type RecapPlayer = Pick<Player, "id" | "nickname" | "avatar_url" | "steam_id">;

export type Placement = {
  /** «1», «2», «3» или «3–4» (два полуфиналиста без матча за 3-е место) */
  place: string;
  team: Team;
  roster: (RecapPlayer & { role: string })[];
};

export type PathStep = { stage: string; opponent: Team | null; score: string; won: boolean; walkover: boolean; matchId: string };

export type StatLeader = {
  key: string;
  label: string;
  value: string;
  player: RecapPlayer | null;
  name: string;
  team: Pick<Team, "id" | "name" | "tag" | "logo_url"> | null;
};

export type MapHighlight = { match: MatchWithTeams; map: MatchMap; rounds: number; diff: number };

export type TournamentRecap = {
  placements: Placement[];
  championPath: PathStep[];
  mvp: Awaited<ReturnType<typeof getTournamentMvp>>;
  leaders: StatLeader[];
  longestMap: MapHighlight | null;
  closestMap: MapHighlight | null;
  totals: { matches: number; maps: number; rounds: number; kills: number; players: number; teams: number };
};

const winnerOf = (m: MatchWithTeams) => (m.winner_id && m.winner_id === m.team1_id ? m.team1 : m.winner_id && m.winner_id === m.team2_id ? m.team2 : null);
const loserOf = (m: MatchWithTeams) => (m.winner_id && m.winner_id === m.team1_id ? m.team2 : m.winner_id && m.winner_id === m.team2_id ? m.team1 : null);

/** Призёры: Double — по гранд-финалу и финалу нижней сетки; Single — по финалу и полуфиналам; круговая — по таблице */
async function placementsOf(t: Tournament, matches: MatchWithTeams[]): Promise<{ place: string; team: Team }[]> {
  const fin = matches.filter((m) => m.status === "finished" && m.winner_id);
  const gf = fin.find((m) => m.bracket === "grand_final");
  if (gf) {
    const lower = fin.filter((m) => m.bracket === "lower" && m.team1_id && m.team2_id);
    const lastLower = lower.sort((a, b) => b.round - a.round || b.number - a.number)[0];
    return [
      { place: "1", team: winnerOf(gf) },
      { place: "2", team: loserOf(gf) },
      { place: "3", team: lastLower ? loserOf(lastLower) : null },
    ].filter((x): x is { place: string; team: Team } => !!x.team);
  }

  const upper = matches.filter((m) => m.bracket === "upper");
  if (upper.length) {
    const top = Math.max(...upper.map((m) => m.round));
    const final = upper.find((m) => m.round === top && m.status === "finished" && m.winner_id);
    if (final) {
      const semis = fin.filter((m) => m.bracket === "upper" && m.round === top - 1 && m.team1_id && m.team2_id);
      const thirds = semis.map(loserOf).filter((x): x is Team => !!x);
      return [
        { place: "1", team: winnerOf(final) },
        { place: "2", team: loserOf(final) },
        ...thirds.map((team) => ({ place: thirds.length > 1 ? "3–4" : "3", team })),
      ].filter((x): x is { place: string; team: Team } => !!x.team);
    }
  }

  // только группа / швейцарка без плей-офф — по итоговой таблице (одна группа)
  const tables = await getStandings(t);
  if (tables.length !== 1) return [];
  const teamById = new Map(matches.flatMap((m) => [m.team1, m.team2]).filter((x): x is Team => !!x).map((x) => [x.id, x]));
  return tables[0].table
    .slice(0, 3)
    .map((row, i) => ({ place: String(i + 1), team: teamById.get(row.teamId) ?? null }))
    .filter((x): x is { place: string; team: Team } => !!x.team);
}

export async function getTournamentRecap(t: Tournament): Promise<TournamentRecap> {
  const [matches, regs, board, mvp] = await Promise.all([
    getTournamentMatches(t.id),
    getTournamentRegistrations(t.id),
    getPlayerLeaderboard(t.id),
    getTournamentMvp(t.id),
  ]);
  const played = matches.filter((m) => m.status === "finished" && m.team1_id && m.team2_id);

  // ── призёры с составами на турнир
  const places = await placementsOf(t, matches);
  const placements: Placement[] = places.map(({ place, team }) => {
    const reg = regs.find((r) => r.team_id === team.id);
    const roster = (reg?.roster ?? [])
      .filter((r) => r.player)
      .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
      .map((r) => ({ id: r.player!.id, nickname: r.player!.nickname, avatar_url: r.player!.avatar_url, steam_id: r.player!.steam_id, role: r.role }));
    return { place, team, roster };
  });

  // ── путь чемпиона
  const champion = placements.find((p) => p.place === "1")?.team ?? null;
  const totalUpper = Math.max(0, ...matches.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...matches.filter((x) => x.bracket === "lower").map((x) => x.round));
  const stageOf = (m: MatchWithTeams) =>
    m.bracket === "group"
      ? `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`
      : m.bracket === "swiss"
        ? `Швейцарка · раунд ${m.round}`
        : roundTitle(m.bracket, m.round, totalUpper, totalLower);
  const championPath: PathStep[] = champion
    ? matches
        .filter((m) => m.status === "finished" && (m.team1_id === champion.id || m.team2_id === champion.id))
        .filter((m) => m.team1_id && m.team2_id) // бай — не матч
        .sort((a, b) => a.number - b.number)
        .map((m) => {
          const isT1 = m.team1_id === champion.id;
          return {
            stage: stageOf(m),
            opponent: isT1 ? m.team2 : m.team1,
            score: isT1 ? `${m.team1_score}:${m.team2_score}` : `${m.team2_score}:${m.team1_score}`,
            won: m.winner_id === champion.id,
            walkover: m.is_walkover,
            matchId: m.id,
          };
        })
    : [];

  // ── лидеры статистики (только игроки с сыгранными картами)
  const pool = board.filter((p) => p.maps > 0);
  const minMaps = Math.max(1, Math.ceil(Math.max(0, ...pool.map((p) => p.maps)) / 3));
  const steady = pool.filter((p) => p.maps >= minMaps);
  const leader = (
    key: string,
    label: string,
    list: typeof pool,
    score: (p: (typeof pool)[number]) => number | null,
    show: (p: (typeof pool)[number]) => string,
  ): StatLeader | null => {
    const best = list
      .filter((p) => score(p) != null && Number.isFinite(score(p)!))
      .sort((a, b) => score(b)! - score(a)!)[0];
    if (!best || !score(best)) return null;
    return { key, label, value: show(best), player: best.player, name: best.player?.nickname ?? best.name, team: best.team };
  };
  const leaders = [
    leader("rating", "Лучший F16 Rating", steady, (p) => p.rating, (p) => p.rating.toFixed(2)),
    leader("kills", "Больше всего убийств", pool, (p) => p.kills, (p) => String(p.kills)),
    leader("adr", "Лучший ADR", steady, (p) => p.adr, (p) => p.adr.toFixed(1)),
    leader("swing", "Лучший Swing", steady, (p) => p.swing, (p) => `${p.swing! > 0 ? "+" : ""}${p.swing!.toFixed(2)} п.п.`),
    leader("clutches", "Больше всего клатчей", pool, (p) => p.clutches, (p) => String(p.clutches)),
    leader("hs", "Лучший % в голову", steady.filter((p) => p.kills >= 10), (p) => p.hsPct, (p) => `${p.hsPct.toFixed(0)}%`),
  ].filter((x): x is StatLeader => !!x);

  // ── карты: самая длинная и самая напряжённая
  const ids = played.map((m) => m.id);
  const { data: mapRows } = ids.length
    ? await db().from("match_maps").select("*").in("match_id", ids).eq("status", "finished")
    : { data: [] as MatchMap[] };
  const maps = (mapRows ?? []) as MatchMap[];
  const byMatch = new Map(played.map((m) => [m.id, m]));
  const highlights: MapHighlight[] = maps
    .filter((x) => byMatch.has(x.match_id) && x.team1_score + x.team2_score > 0)
    .map((x) => ({ match: byMatch.get(x.match_id)!, map: x, rounds: x.team1_score + x.team2_score, diff: Math.abs(x.team1_score - x.team2_score) }));
  const longestMap = [...highlights].sort((a, b) => b.rounds - a.rounds)[0] ?? null;
  const closestMap = [...highlights].sort((a, b) => a.diff - b.diff || b.rounds - a.rounds)[0] ?? null;

  return {
    placements,
    championPath,
    mvp,
    leaders,
    longestMap,
    closestMap: closestMap && longestMap && closestMap.map.id === longestMap.map.id ? null : closestMap,
    totals: {
      matches: played.length,
      maps: highlights.length,
      rounds: highlights.reduce((s, x) => s + x.rounds, 0),
      kills: pool.reduce((s, p) => s + p.kills, 0),
      players: pool.length,
      teams: regs.filter((r) => r.status === "approved").length,
    },
  };
}
