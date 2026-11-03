import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getTournamentBySlug } from "@/lib/data";
import { TournamentView } from "../tournament-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Предпросмотр турнира"), robots: { index: false } };
}

/** Предпросмотр для админа: черновик и любой турнир — всегда свежий, без кэша */
export default async function TournamentPreviewPage(props: PageProps<"/tournaments/[slug]/preview">) {
  const { slug } = await props.params;
  await requireAdmin(`/tournaments/${slug}/preview`);
  const t = await getTournamentBySlug(slug, true);
  if (!t) notFound();
  return <TournamentView t={t} />;
}
