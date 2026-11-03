import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getTournamentBySlug } from "@/lib/data";
import { StatsView } from "../stats-view";

// статистика турнира — из кэша CDN, обновляется раз в 30 с и сразу после матчей
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/stats/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  const tx = await getT();
  return { title: t ? tx("Статистика · {name}", { name: t.name }) : tx("Статистика") };
}

export default async function TournamentStatsPage(props: PageProps<"/stats/[slug]">) {
  const { slug } = await props.params;
  return <StatsView slug={slug} />;
}
