import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/data";
import { getMatchRosters, getStandings, getTournamentMatches } from "@/lib/matches";
import { modeOf } from "@/lib/modes";
import type { MapRounds } from "@/lib/rounds";
import { getMatchRounds } from "@/lib/rounds-data";
import { getTournamentRecap } from "@/lib/recap";
import { getPlayerLeaderboard, getTournamentMvp } from "@/lib/stats";
import { db } from "@/lib/supabase";
import { TvView, type TvData } from "@/components/tv/tv-view";

// экран ТВ — из кэша CDN раз в 5 с; счёт подтягивает LiveRefresh
export const revalidate = 5;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/tournaments/[slug]/tv">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  return { title: t ? `${t.name} — режим ТВ` : "Режим ТВ", robots: { index: false } };
}

/** Режим ТВ турнира: открыть на ПК у телевизора/проектора и нажать F11 */
export default async function TournamentTvPage(props: PageProps<"/tournaments/[slug]/tv">) {
  const { slug } = await props.params;
  // экран ТВ публичный и кэшируется — черновики на нём не показываются
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();

  const matches = await getTournamentMatches(t.id);
  const liveIds = matches.filter((m) => m.status === "live").map((m) => m.id);
  const hasStage = matches.some((m) => m.stage === "group" || m.stage === "swiss");

  const [liveMaps, groups, board, mvp, recap] = await Promise.all([
    liveIds.length
      ? db().from("match_maps").select("match_id, map_number, map_name, status, team1_score, team2_score").in("match_id", liveIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    hasStage ? getStandings(t) : Promise.resolve([]),
    getPlayerLeaderboard(t.id),
    getTournamentMvp(t.id),
    t.status === "finished" ? getTournamentRecap(t) : Promise.resolve(null),
  ]);

  // лента раундов идущей карты каждого live-матча
  const teamSize = modeOf(t.format).size;
  const liveRounds: Record<string, MapRounds> = {};
  await Promise.all(
    matches
      .filter((m) => m.status === "live")
      .slice(0, 4)
      .map(async (m) => {
        const cur = liveMaps.find((x) => x.match_id === m.id && x.status === "live");
        if (!cur) return;
        const rosters = await getMatchRosters(m);
        const [map] = await getMatchRounds(
          m.id,
          { team1: rosters.team1.map((r) => r.player.steam_id), team2: rosters.team2.map((r) => r.player.steam_id) },
          teamSize,
          [cur.map_number],
        );
        if (map) liveRounds[m.id] = map;
      }),
  );

  const toLeader = (p: (typeof board)[number]) => ({
    name: p.player?.nickname ?? p.name,
    avatar: p.player?.avatar_url ?? null,
    team: p.team?.name ?? null,
    rating: p.rating,
    kd: p.kd,
    adr: p.adr,
    maps: p.maps,
  });

  const data: TvData = {
    tournament: t,
    matches,
    liveMaps,
    groups: groups.map((g) => ({ label: g.label, table: g.table })),
    // в таблице лидеров — игроки, сыгравшие хотя бы 2 карты (иначе одна удачная карта занимает весь топ)
    leaders: board.filter((p) => p.maps >= Math.min(2, Math.max(...board.map((b) => b.maps), 0))).map(toLeader),
    mvp: mvp ? { ...toLeader(mvp), by: mvp.by, swing: mvp.swing } : null,
    places: (recap?.placements ?? []).map((p) => ({ place: p.place, team: p.team, roster: p.roster.map((r) => r.nickname) })),
    liveRounds,
  };

  return <TvView data={data} />;
}
