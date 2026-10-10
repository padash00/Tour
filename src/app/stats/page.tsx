import type { Metadata } from "next";
import { StatsView } from "./stats-view";
import { LegacyStatsRedirect } from "./legacy-redirect";

export const metadata: Metadata = {
  title: "Статистика",
  description: "Рейтинг и статистика игроков CS2 на F16 Arena: F16 Rating, Swing, K/D, ADR, KAST и лучшие игроки турниров.",
  alternates: { canonical: "/stats" },
};

// одинакова для всех — из кэша CDN, обновляется раз в 30 с и сразу после матчей
export const revalidate = 30;

export default function StatsPage() {
  return (
    <>
      <LegacyStatsRedirect />
      <StatsView slug={null} />
    </>
  );
}
