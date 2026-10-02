import type { Metadata } from "next";
import Link from "next/link";
import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { TournamentLine } from "@/components/public/bits";
import { TournamentCard } from "@/components/public/home";
import { cn } from "@/components/ui";
import { OutlineBtn, PageHero, SectionHead, WRAP } from "@/components/primitives";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

export const metadata: Metadata = { title: "Турниры" };

export default async function TournamentsPage() {
  const [all, featured] = await Promise.all([listPublicTournaments(), getFeaturedTournament()]);
  const counts = await approvedCounts(all.map((t) => t.id));
  const current = featured && !["finished", "cancelled"].includes(featured.status) ? featured : null;
  const upcoming = all.filter((t) => t.id !== current?.id && !["finished", "cancelled"].includes(t.status));
  const archive = all.filter((t) => ["finished", "cancelled"].includes(t.status));
  const isFirst = !archive.some((t) => t.status === "finished");

  return (
    <>
      <PageHero eyebrow="Соревнования F16 Arena" title="Турниры" description="Турниры по CS2 на реальных серверах F16 Arena." />

      <div className={cn(WRAP, "pt-14")}>
        <section>
          <SectionHead>Текущий турнир</SectionHead>
          {current ? (
            <TournamentCard t={current} approved={counts[current.id] ?? 0} isFirst={isFirst} />
          ) : (
            <div className="rounded-[12px] border border-dashed border-white/[0.12] bg-white/[0.012] px-8 py-10 lg:px-11">
              <div className="text-[18px] lg:text-[22px] font-semibold text-fg">Сейчас турниров нет</div>
              <p className="mt-2 text-[15px] lg:text-[17px] text-fg-3">Следующий турнир F16 Arena будет объявлен здесь.</p>
              <div className="mt-7">
                <OutlineBtn href="/team/create">Собрать команду</OutlineBtn>
              </div>
            </div>
          )}
        </section>

        <section className="mt-16 lg:mt-20">
          <SectionHead>Следующие турниры</SectionHead>
          {upcoming.length > 0 ? (
            <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-1.5">
              {upcoming.map((t) => (
                <TournamentLine key={t.id} t={t} approved={counts[t.id] ?? 0} />
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-white/[0.12] bg-white/[0.012] px-8 py-7 lg:px-11 lg:py-8">
              <div className="text-[15px] lg:text-[18px] font-semibold text-fg">Скоро</div>
              <div className="mt-1 text-[14px] lg:text-[16px] text-fg-3">Впереди ещё больше соревнований. Следите за обновлениями!</div>
            </div>
          )}
        </section>

        {archive.length > 0 && (
          <section className="mt-16 lg:mt-20">
            <SectionHead action={<Link href="/stats" className="text-[14px] text-fg-3 hover:text-fg">Статистика →</Link>}>
              Архив
            </SectionHead>
            <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-1.5">
              {archive.map((t) => (
                <TournamentLine key={t.id} t={t} approved={counts[t.id] ?? 0} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
