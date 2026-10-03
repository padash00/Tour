import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/data";
import { bracketLabel, formatDate } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import { getTournamentRecap } from "@/lib/recap";
import { RecapView } from "@/components/competition/recap-view";
import { ShareButton } from "@/components/stream";
import { Button, Container, PageTitle } from "@/components/ds";

// одинакова для всех — из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

/** Страница итогов турнира — для отправки в чаты и соцсети (с картинкой-превью opengraph-image) */
export async function generateMetadata(props: PageProps<"/tournaments/[slug]/recap">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) return { title: "Итоги турнира" };
  const recap = t.status === "finished" ? await getTournamentRecap(t) : null;
  const champ = recap?.placements.find((p) => p.place === "1")?.team.name;
  const title = `Итоги — ${t.name}`;
  const description = champ ? `Чемпион ${t.name} — ${champ}. Призёры, MVP и рекорды турнира на F16 Arena.` : `Итоги турнира ${t.name} на F16 Arena.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function RecapPage(props: PageProps<"/tournaments/[slug]/recap">) {
  const { slug } = await props.params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();
  const recap = await getTournamentRecap(tournament);
  const mode = modeOf(tournament.format);

  const meta = [
    tournament.starts_at ? formatDate(tournament.starts_at) : null,
    tournament.game,
    mode.size === 5 ? "5v5" : mode.size === 2 ? "2v2" : "1v1",
    bracketLabel[tournament.bracket_type] ?? tournament.bracket_type,
    tournament.is_lan ? "LAN" : "Онлайн",
  ].filter(Boolean);

  return (
    <>
      <div className="border-b border-line-subtle bg-shell">
        <Container width="wide" className="py-8 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Button href={`/tournaments/${tournament.slug}`} variant="quiet" size="sm">
                ← {tournament.name}
              </Button>
              <div className="mt-5 text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">Итоги турнира</div>
              <PageTitle className="mt-1">{tournament.name}</PageTitle>
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-3">
                {meta.map((item, i) => (
                  <span key={String(item)} className="inline-flex items-center gap-3">
                    {i > 0 && <span aria-hidden>·</span>}
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <ShareButton title={`Итоги — ${tournament.name}`} />
          </div>
        </Container>
      </div>

      <Container width="wide" className="py-10 sm:py-12">
        <RecapView recap={recap} solo={mode.size === 1} imageBase={`/tournaments/${tournament.slug}/recap/image`} />
      </Container>
    </>
  );
}
