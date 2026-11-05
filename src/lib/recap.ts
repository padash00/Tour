import "server-only";
import { roundTitle } from "./bracket";
import { rankQuarterLosers, WALKOVER_ROUNDS, type QuarterTiebreak } from "./awards-core";
import { createHash } from "node:crypto";
import { averageElo } from "./data";
import { makeT, type T } from "./i18n/core";
import { getTournamentRegistrations } from "./data";
import { getStandings, getTournamentMatches, type MatchWithTeams } from "./matches";
import { getTournamentNominations } from "./nominations";
import { getPlayerLeaderboard, mvpOf } from "./stats";
import { db } from "./supabase";
import type { MatchMap, Player, Team, Tournament } from "./types";

/*
 * Итоги турнира: призёры, путь чемпиона, MVP, лидеры статистики и цифры турнира.
 * Только реальные данные; если чего-то нет (статистика не собиралась) — поле пустое.
 */

export type RecapPlayer = Pick<Player, "id" | "nickname" | "avatar_url" | "steam_id">;

export type Placement = {
  /** «1», «2», «3», «4» (по матчу за 3-е место) или «3–4» (два полуфиналиста без матча за 3-е место) */
  place: string;
  team: Team;
  roster: (RecapPlayer & { role: string })[];
  /** итог команды на турнире: серии и карты */
  record: { wins: number; losses: number; mapWins: number; mapLosses: number };
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

/** Номинация в итогах: итог (решение судей или кандидат по статистике) */
export type RecapNomination = {
  key: string;
  title: string;
  name: string;
  team: Pick<Team, "id" | "name" | "tag" | "logo_url"> | null;
  value: string | null;
  source: "judges" | "stats";
  /** приз за номинацию (бонус клуба из блока «Призы») */
  bonus: string | null;
};

export type TournamentRecap = {
  placements: Placement[];
  /** места V–VIII среди выбывших в 1/4 финала (п. 4.6.1): по разнице раундов; tie — равенство, жеребьёвка судей */
  quarterPlaces: { place: string; team: Team; won: number; lost: number; walkover: boolean; by: QuarterTiebreak; totalDiff: number; elo: number | null; record: Placement["record"] }[];
  nominations: RecapNomination[];
  championPath: PathStep[];
  mvp: ReturnType<typeof mvpOf>;
  leaders: StatLeader[];
  longestMap: MapHighlight | null;
  closestMap: MapHighlight | null;
  totals: { matches: number; maps: number; rounds: number; kills: number; players: number; teams: number };
};

const winnerOf = (m: MatchWithTeams) => (m.winner_id && m.winner_id === m.team1_id ? m.team1 : m.winner_id && m.winner_id === m.team2_id ? m.team2 : null);
const loserOf = (m: MatchWithTeams) => (m.winner_id && m.winner_id === m.team1_id ? m.team2 : m.winner_id && m.winner_id === m.team2_id ? m.team1 : null);

/**
 * Призёры: Double — по гранд-финалу и финалу нижней сетки; Single — по финалу и матчу за 3-е место
 * (если его нет — оба полуфиналиста делят 3–4 место); круговая — по таблице.
 */
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
      // матч за 3-е место: 3 — его победитель, 4 — проигравший; пока не сыгран — только 1 и 2
      const third = matches.find((m) => m.bracket === "third_place");
      if (third) {
        const done = third.status === "finished" && third.winner_id;
        return [
          { place: "1", team: winnerOf(final) },
          { place: "2", team: loserOf(final) },
          { place: "3", team: done ? winnerOf(third) : null },
          { place: "4", team: done ? loserOf(third) : null },
        ].filter((x): x is { place: string; team: Team } => !!x.team);
      }
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

/** tx — язык подписей (страница турнира); без него по-русски (пульт, картинки, выгрузки) */
export async function getTournamentRecap(t: Tournament, tx: T = makeT("ru")): Promise<TournamentRecap> {
  const [matches, regs, board, allNominations] = await Promise.all([
    getTournamentMatches(t.id),
    getTournamentRegistrations(t.id),
    getPlayerLeaderboard(t.id),
    getTournamentNominations(t.id, tx),
  ]);
  const nominations: RecapNomination[] = allNominations
    .filter((n) => n.winner)
    .map((n) => ({ key: n.key, title: n.title, name: n.winner!.name, team: n.winner!.team, value: n.winner!.value, source: n.winner!.source, bonus: n.bonus }));
  // MVP решением судей (Положение 5.5) главнее расчёта: блок MVP показывает выбранного игрока
  const judgedMvp = allNominations.find((n) => n.key === "mvp")?.decision;
  const judgedRow = judgedMvp?.playerId ? board.find((p) => p.player_id === judgedMvp.playerId) : null;
  const mvp = judgedMvp ? (judgedRow ? { ...judgedRow, by: "rating" as const } : null) : mvpOf(board);
  const played = matches.filter((m) => m.status === "finished" && m.team1_id && m.team2_id);

  // серии и карты команды (счёт серии = выигранные карты; тех. победы — без карт)
  const recordOf = (teamId: string) => {
    const record = { wins: 0, losses: 0, mapWins: 0, mapLosses: 0 };
    for (const m of played) {
      if (m.team1_id !== teamId && m.team2_id !== teamId) continue;
      const isT1 = m.team1_id === teamId;
      if (m.winner_id === teamId) record.wins++;
      else if (m.winner_id) record.losses++;
      if (!m.is_walkover) {
        record.mapWins += isT1 ? m.team1_score : m.team2_score;
        record.mapLosses += isT1 ? m.team2_score : m.team1_score;
      }
    }
    return record;
  };

  // ── призёры с составами на турнир
  const places = await placementsOf(t, matches);
  const placements: Placement[] = places.map(({ place, team }) => {
    const reg = regs.find((r) => r.team_id === team.id);
    const roster = (reg?.roster ?? [])
      .filter((r) => r.player)
      .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
      .map((r) => ({ id: r.player!.id, nickname: r.player!.nickname, avatar_url: r.player!.avatar_url, steam_id: r.player!.steam_id, role: r.role }));
    return { place, team, roster, record: recordOf(team.id) };
  });

  // ── путь чемпиона
  const champion = placements.find((p) => p.place === "1")?.team ?? null;
  const totalUpper = Math.max(0, ...matches.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...matches.filter((x) => x.bracket === "lower").map((x) => x.round));
  const stageOf = (m: MatchWithTeams) =>
    m.bracket === "group"
      ? m.group_label
        ? tx("Группа {g} · тур {n}", { g: m.group_label, n: m.round })
        : tx("тур {n}", { n: m.round })
      : m.bracket === "swiss"
        ? tx("Швейцарка · раунд {n}", { n: m.round })
        : roundTitle(m.bracket, m.round, totalUpper, totalLower, tx);
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
    leader("rating", tx("Лучший F16 Rating"), steady, (p) => p.rating, (p) => p.rating.toFixed(2)),
    leader("kills", tx("Больше всего убийств"), pool, (p) => p.kills, (p) => String(p.kills)),
    leader("adr", tx("Лучший ADR"), steady, (p) => p.adr, (p) => p.adr.toFixed(1)),
    leader("swing", tx("Лучший Swing"), steady, (p) => p.swing, (p) => tx("{v} п.п.", { v: `${p.swing! > 0 ? "+" : ""}${p.swing!.toFixed(2)}` })),
    leader("clutches", tx("Больше всего клатчей"), pool, (p) => p.clutches, (p) => String(p.clutches)),
    leader("hs", tx("Лучший % в голову"), steady.filter((p) => p.kills >= 10), (p) => p.hsPct, (p) => `${p.hsPct.toFixed(0)}%`),
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

  // ── места V–VIII (олимпийская система): выбывшие в 1/4 финала — по разнице раундов в этом матче,
  // при равенстве — по выигранным раундам; тех. поражение — 0:13. Показываем, когда сыграны все 1/4.
  let quarterPlaces: TournamentRecap["quarterPlaces"] = [];
  const upperRounds = matches.filter((m) => m.bracket === "upper").map((m) => m.round);
  const topRound = upperRounds.length ? Math.max(...upperRounds) : 0;
  const quarters = matches.filter((m) => m.bracket === "upper" && m.round === topRound - 2 && m.team1_id && m.team2_id);
  if (topRound >= 3 && !matches.some((m) => m.bracket === "grand_final") && quarters.length && quarters.every((m) => m.status === "finished" && m.winner_id)) {
    const losers = quarters.map((m) => {
      const loserIsT1 = m.winner_id === m.team2_id;
      const team = loserIsT1 ? m.team1 : m.team2;
      if (m.is_walkover) return { team, teamId: team?.id ?? "", ...WALKOVER_ROUNDS, walkover: true };
      const ms = maps.filter((x) => x.match_id === m.id);
      const won = ms.reduce((n, x) => n + (loserIsT1 ? x.team1_score : x.team2_score), 0);
      const lost = ms.reduce((n, x) => n + (loserIsT1 ? x.team2_score : x.team1_score), 0);
      return { team, teamId: team?.id ?? "", won, lost, walkover: false };
    }).filter((x): x is typeof x & { team: Team } => !!x.team);
    const teamOf = new Map(losers.map((l) => [l.teamId, l.team]));
    // разница раундов за весь турнир (все сыгранные карты команды)
    const totalDiff = (teamId: string) =>
      maps.reduce((n, x) => {
        const m = byMatch.get(x.match_id);
        if (!m) return n;
        if (m.team1_id === teamId) return n + x.team1_score - x.team2_score;
        if (m.team2_id === teamId) return n + x.team2_score - x.team1_score;
        return n;
      }, 0);
    // средний FACEIT ELO основного состава заявки (как при отборе команд, п. 3.6.1)
    const eloOf = (teamId: string) => {
      const reg = regs.find((r) => r.team_id === teamId);
      const mains = (reg?.roster ?? []).filter((r) => r.role === "main" && r.player);
      return mains.length ? averageElo(mains as { player: NonNullable<(typeof mains)[number]["player"]> }[]) : null;
    };
    // жребий платформы: число из хэша «турнир:команда» — известно заранее, проверяемо, без участия людей
    const lotOf = (teamId: string) => parseInt(createHash("sha256").update(`${t.id}:${teamId}`).digest("hex").slice(0, 8), 16);
    quarterPlaces = rankQuarterLosers(
      losers.map(({ teamId, won, lost, walkover }) => ({ teamId, won, lost, walkover, totalDiff: totalDiff(teamId), elo: eloOf(teamId), lot: lotOf(teamId) })),
    ).map((q) => ({
      place: q.place, team: teamOf.get(q.teamId)!, won: q.won, lost: q.lost, walkover: q.walkover, by: q.by, totalDiff: q.totalDiff, elo: q.elo, record: recordOf(q.teamId),
    }));
  }
  const closestMap = [...highlights].sort((a, b) => a.diff - b.diff || b.rounds - a.rounds)[0] ?? null;

  return {
    placements,
    quarterPlaces,
    nominations,
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
