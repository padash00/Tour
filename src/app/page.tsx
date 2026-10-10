import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { LiveRefresh } from "@/components/live-refresh";
import type { Metadata } from "next";
import { HomeView } from "@/components/public/home";
import { JsonLd } from "@/components/json-ld";
import { CLUB_SITE, ORGANIZER, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [featured, all] = await Promise.all([getFeaturedTournament(), listPublicTournaments()]);
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
      <HomeView
      featured={featured}
      approved={featured ? (counts[featured.id] ?? 0) : 0}
      isFirst={isFirst}
      upcoming={upcoming}
    />
    </>
  );
}
