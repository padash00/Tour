import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTournamentBySlug } from "@/lib/data";
import { bracketLabel, formatDate } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import { getTournamentRecap } from "@/lib/recap";
import { RecapView } from "@/components/competition/recap-view";
import { ShareButton } from "@/components/stream";
import { Eyebrow, WRAP } from "@/components/primitives";

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
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const recap = await getTournamentRecap(t);
  const mode = modeOf(t.format);

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_80%_-10%,#1b2c4a66,transparent_60%)]" />
        <div className={`${WRAP} relative pt-10 pb-12 lg:pt-12 lg:pb-16`}>
          <Link href={`/tournaments/${t.slug}`} className="inline-flex min-h-11 items-center text-sm text-fg-2 hover:text-fg lg:min-h-0">
            ← {t.name}
          </Link>
          <div className="mt-12 lg:mt-16">
            <Eyebrow>Итоги турнира</Eyebrow>
            <h1 className="mt-5 text-[40px] sm:text-[56px] lg:text-[72px] font-semibold leading-[1.02] tracking-[-0.015em] break-words">{t.name}</h1>
            <div className="mt-6 flex flex-wrap items-center gap-y-2 text-[15px] lg:text-[17px] text-fg-2">
              {[t.starts_at ? formatDate(t.starts_at) : null, t.game, mode.size === 5 ? "5v5" : mode.size === 2 ? "2v2" : "1v1", bracketLabel[t.bracket_type] ?? t.bracket_type, t.is_lan ? "LAN" : "Онлайн"]
                .filter(Boolean)
                .map((x, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && <span className="mx-3 h-4 w-px bg-white/20 sm:mx-5" />}
                    {x}
                  </span>
                ))}
            </div>
            <div className="mt-8">
              <ShareButton title={`Итоги — ${t.name}`} />
            </div>
          </div>
        </div>
      </section>
      <div className={`${WRAP} pt-14`}>
        <RecapView recap={recap} solo={mode.size === 1} />
      </div>
    </>
  );
}
