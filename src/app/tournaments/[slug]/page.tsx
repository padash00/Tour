import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/data";
import { TournamentView } from "./tournament-view";

// страница одинакова для всех — из кэша CDN, обновляется раз в 30 с и сразу после изменений;
// черновик здесь не виден — админ смотрит его через /tournaments/<slug>/preview
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/tournaments/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  return { title: t?.name ?? "Турнир" };
}

export default async function TournamentPage(props: PageProps<"/tournaments/[slug]">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  return <TournamentView t={t} />;
}
