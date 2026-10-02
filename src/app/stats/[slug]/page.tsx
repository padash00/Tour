import type { Metadata } from "next";
import { getTournamentBySlug } from "@/lib/data";
import { StatsView } from "../stats-view";

// статистика турнира — из кэша CDN, обновляется раз в 30 с и сразу после матчей
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/stats/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  return { title: t ? `Статистика · ${t.name}` : "Статистика" };
}

export default async function TournamentStatsPage(props: PageProps<"/stats/[slug]">) {
  const { slug } = await props.params;
  return <StatsView slug={slug} />;
}
