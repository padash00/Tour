import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { HomeView } from "@/components/public/home";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

export default async function HomePage() {
  const [featured, all] = await Promise.all([getFeaturedTournament(), listPublicTournaments()]);
  const counts = featured ? await approvedCounts([featured.id]) : {};
  const upcoming = all.filter((t) => t.id !== featured?.id && !["finished", "cancelled"].includes(t.status));
  // «первый турнир платформы» — только если до него не было завершённых турниров
  const isFirst = !all.some((t) => t.id !== featured?.id && t.status === "finished");

  return (
    <HomeView
      featured={featured}
      approved={featured ? (counts[featured.id] ?? 0) : 0}
      isFirst={isFirst}
      upcoming={upcoming}
    />
  );
}
