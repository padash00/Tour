import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./supabase";
import { getStandings } from "./matches";
import { getPlayerLeaderboard } from "./stats";
import { rankTeams, type RankMatch, type RankTournament, type RankedTeam } from "./team-ranking-core";
import type { Tournament } from "./types";

/**
 * Рейтинг команд F16 для страницы /ranking и значка на странице команды.
 * Считается из результатов турниров 5×5 (см. team-ranking-core), кэш 10 минут.
 */

export type RankingPlayer = { id: string; nickname: string; avatar_url: string | null; steam_id: string; role: string; rating: number | null; maps: number };
export type RankingRow = RankedTeam & {
  team: { id: string; name: string; tag: string; logo_url: string | null; region: string | null };
  /** изменение места за неделю: + поднялись, − опустились, null — новая в рейтинге */
  change: number | null;
  players: RankingPlayer[];
};

const WEEK = 7 * 86_400_000;

export const getTeamRanking = unstable_cache(
  async (): Promise<{ rows: RankingRow[]; updatedAt: string }> => {
    const now = Date.now();
    const { data: ts } = await db()
      .from("tournaments")
      .select("*")
      .in("status", ["live", "finished"])
      .eq("format", "5v5")
      .eq("is_private", false);
    const tournaments = (ts ?? []) as Tournament[];
    if (!tournaments.length) return { rows: [], updatedAt: new Date(now).toISOString() };

    const { data: ms } = await db()
      .from("matches")
      .select("id, tournament_id, bracket, round, status, team1_id, team2_id, winner_id, finished_at, is_walkover")
      .in("tournament_id", tournaments.map((t) => t.id))
      .eq("status", "finished");
    const matches: RankMatch[] = (ms ?? []).map((m) => ({
      id: m.id,
      tournamentId: m.tournament_id,
      bracket: m.bracket,
      round: m.round,
      status: m.status,
      team1_id: m.team1_id,
      team2_id: m.team2_id,
      winner_id: m.winner_id,
      finishedAt: m.finished_at,
      walkover: m.is_walkover,
    }));

    // итоговая таблица нужна только завершённым турнирам без плей-офф
    const rankTs: RankTournament[] = await Promise.all(
      tournaments.map(async (t) => {
        const own = matches.filter((m) => m.tournamentId === t.id);
        let ranking: string[] | undefined;
        if (t.status === "finished" && own.length && !own.some((m) => ["upper", "lower", "grand_final", "third_place"].includes(m.bracket))) {
          const groups = await getStandings(t).catch(() => []);
          if (groups.length === 1) ranking = groups[0].table.map((r) => r.teamId);
        }
        return { id: t.id, name: t.name, slug: t.slug, startsAt: t.starts_at ?? t.created_at, official: t.is_official, lan: t.is_lan, finished: t.status === "finished", ranking };
      }),
    );

    const teamIds = [...new Set(matches.flatMap((m) => [m.team1_id, m.team2_id]).filter((x): x is string => !!x))];
    if (!teamIds.length) return { rows: [], updatedAt: new Date(now).toISOString() };
    const { data: teams } = await db().from("teams").select("id, name, tag, logo_url, region, is_solo, disbanded_at").in("id", teamIds);
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const eligible = (id: string) => {
      const t = teamMap.get(id);
      return !!t && !t.is_solo && !t.disbanded_at;
    };

    const current = rankTeams(rankTs, matches, now, eligible);
    const before = new Map(rankTeams(rankTs, matches, now - WEEK, eligible).map((r) => [r.teamId, r.rank]));

    // нынешние составы и F16 Rating игроков за всё время
    const { data: members } = await db()
      .from("team_members")
      .select("team_id, role, joined_at, player:players(id, nickname, avatar_url, steam_id)")
      .in("team_id", current.map((r) => r.teamId))
      .is("left_at", null);
    const board = await getPlayerLeaderboard();
    const ratingOf = new Map(board.filter((p) => p.player_id).map((p) => [p.player_id!, { rating: p.rating, maps: p.maps }]));
    const order = (role: string) => (role === "captain" ? 0 : role === "substitute" ? 2 : 1);

    const rows: RankingRow[] = current.map((r) => {
      const t = teamMap.get(r.teamId)!;
      const prev = before.get(r.teamId);
      const players = (members ?? [])
        .filter((m) => m.team_id === r.teamId && m.player)
        .sort((a, b) => order(a.role) - order(b.role) || a.joined_at.localeCompare(b.joined_at))
        .map((m) => {
          const p = m.player as unknown as { id: string; nickname: string; avatar_url: string | null; steam_id: string };
          const s = ratingOf.get(p.id);
          return { ...p, role: m.role, rating: s ? Number(s.rating.toFixed(2)) : null, maps: s?.maps ?? 0 };
        });
      return {
        ...r,
        team: { id: t.id, name: t.name, tag: t.tag, logo_url: t.logo_url, region: t.region },
        change: prev ? prev - r.rank : null,
        players,
      };
    });
    return { rows, updatedAt: new Date(now).toISOString() };
  },
  ["team-ranking", "v1"],
  { revalidate: 600, tags: ["team-ranking"] },
);

/** Место команды в рейтинге (для значка на странице команды) */
export async function getTeamRank(teamId: string) {
  const { rows } = await getTeamRanking();
  const row = rows.find((r) => r.teamId === teamId);
  return row ? { rank: row.rank, points: row.points, total: rows.length } : null;
}
