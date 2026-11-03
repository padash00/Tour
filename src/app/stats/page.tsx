import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { StatsView } from "./stats-view";
import { LegacyStatsRedirect } from "./legacy-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Статистика"),
    description: "Рейтинг и статистика игроков CS2 на F16 Arena: F16 Rating, Swing, K/D, ADR, KAST и лучшие игроки турниров.",
    alternates: { canonical: "/stats" },
  };
}

// одинакова для всех — из кэша CDN, обновляется раз в 30 с и сразу после матчей
export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <>
      <LegacyStatsRedirect />
      <StatsView slug={null} />
    </>
  );
}
