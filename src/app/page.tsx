import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { getUpcomingMatches } from "@/lib/matches";
import { getMapImages } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import type { Metadata } from "next";
import { HomeView, type HomeMatch } from "@/components/public/home";
import { JsonLd } from "@/components/json-ld";
import { CLUB_SITE, ORGANIZER, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Последние сыгранные матчи с картами — для «Последних результатов» */
async function recentResults(limit = 6) {
  const { data } = await db()
    .from("matches")
    .select(
      "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), tournament:tournaments!inner(id, name, slug, status), maps:match_maps(map_number, map_name, team1_score, team2_score)",
    )
    .eq("status", "finished")
    .neq("tournament.status", "draft")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(limit * 2);
  return visibleMatches((data ?? []) as HomeMatch[])
    .map((m) => ({ ...m, maps: [...(m.maps ?? [])].sort((a, b) => a.map_number - b.map_number) }))
    .slice(0, limit);
}

export default async function HomePage() {
  const [featured, all, active, results, mapImages] = await Promise.all([
    getFeaturedTournament(),
    listPublicTournaments(),
    getUpcomingMatches(50),
    recentResults(),
    getMapImages(),
  ]);
  const live = active.filter((m) => m.status === "live").slice(0, 6) as HomeMatch[];
  // сколько раундов в верхней сетке у турниров идущих матчей — для подписи стадии («1/4 финала», «Полуфинал»)
  const liveTournaments = [...new Set(live.map((m) => m.tournament_id))];
  const { data: roundRows } = liveTournaments.length
    ? await db().from("matches").select("tournament_id, round").in("tournament_id", liveTournaments).eq("bracket", "upper")
    : { data: [] };
  const upperRounds: Record<string, number> = {};
  for (const r of roundRows ?? []) upperRounds[r.tournament_id] = Math.max(upperRounds[r.tournament_id] ?? 0, r.round);
  const counts = featured ? await approvedCounts([featured.id]) : {};
  const upcoming = all.filter((t) => t.id !== featured?.id && !["finished", "cancelled"].includes(t.status));
  // «первый турнир платформы» — только если до него не было завершённых турниров
  const isFirst = !all.some((t) => t.id !== featured?.id && t.status === "finished");

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: `${SITE_NAME} — турниры по CS2`, inLanguage: "ru", description: SITE_DESCRIPTION, publisher: { "@id": `${SITE_URL}/#org` } },
            { ...ORGANIZER, "@id": `${SITE_URL}/#org`, sameAs: [CLUB_SITE] },
          ],
        }}
      />
      {featured && ["registration", "checkin", "live"].includes(featured.status) && (
        <LiveRefresh watch={`tournament:${featured.id}`} intervalMs={8000} />
      )}
      {live.length > 0 && <LiveRefresh watch="matches" intervalMs={8000} />}
      <HomeView
        featured={featured}
        approved={featured ? (counts[featured.id] ?? 0) : 0}
        isFirst={isFirst}
        upcoming={upcoming}
        live={live}
        results={results}
        mapImages={mapImages}
        upperRounds={upperRounds}
      />
    </>
  );
}
