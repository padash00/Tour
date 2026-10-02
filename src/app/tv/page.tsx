import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFeaturedTournament } from "@/lib/data";
import { TvEmpty } from "@/components/tv/panels";
import { TvShell } from "@/components/tv/tv-shell";

// редирект на текущий турнир — из кэша, раз в 10 с
export const revalidate = 10;

export const metadata: Metadata = { title: "Режим ТВ", robots: { index: false } };

/** Короткий адрес для телевизора в клубе: открывает текущий турнир */
export default async function TvPage() {
  const t = await getFeaturedTournament();
  if (t) redirect(`/tournaments/${t.slug}/tv`);
  return (
    <TvShell
      tournament="F16 Arena"
      panels={[{ key: "soon", title: "F16 Arena", node: <TvEmpty title="Скоро турнир" text="Следите за анонсами на tournament.f16-arena.kz" /> }]}
    />
  );
}
