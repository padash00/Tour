import type { Metadata } from "next";
import Link from "next/link";
import { listTeams } from "@/lib/data";
import { IconArrow, TeamLogo, cn } from "@/components/ui";
import { CARD, EmptyCard, OutlineBtn, PageHero, PrimaryBtn, Wrap } from "@/components/primitives";
import { ClientFilter } from "@/components/public/client-filter";

export const metadata: Metadata = { title: "Команды" };

// поиск — в браузере (ClientFilter): страница одинакова для всех и отдаётся из кэша CDN
export const revalidate = 30;

export default async function TeamsPage() {
  const all = await listTeams();
  const teams = all;

  return (
    <>
      <PageHero
        eyebrow="Команды F16 Arena"
        title="Команды"
        lead={all.length ? `${all.length} ${all.length === 1 ? "команда" : all.length < 5 ? "команды" : "команд"} на платформе.` : undefined}
        aside={<OutlineBtn href="/team/create">Создать команду</OutlineBtn>}
      />

      <Wrap className="pt-10">
        {all.length > 0 && (
          <ClientFilter scope="teams" placeholder="Поиск по названию или тегу" className="mb-6" />
        )}

        {teams.length === 0 ? (
          <EmptyCard
            dashed={all.length === 0}
            title={all.length === 0 ? "Команд пока нет" : "Ничего не найдено"}
            text={all.length === 0 ? "Станьте первой командой на платформе." : "Попробуйте другое название или тег."}
            action={all.length === 0 ? <PrimaryBtn href="/team/create">Создать команду</PrimaryBtn> : undefined}
          />
        ) : (
          <div className={cn(CARD, "overflow-hidden")} data-filter-scope="teams">
            <p data-filter-empty hidden className="px-8 py-10 text-[15px] text-fg-3">
              Ничего не найдено — попробуйте другое название или тег.
            </p>
            <div className="hidden sm:grid grid-cols-[1fr_180px_110px_110px_24px] gap-6 px-8 py-4 text-[12px] uppercase tracking-[0.2em] text-fg-3 border-b border-white/[0.06]">
              <span>Команда</span>
              <span>Регион</span>
              <span className="text-right">Игроки</span>
              <span className="text-right">Avg ELO</span>
              <span />
            </div>
            {teams.map((t, i) => (
              <Link
                key={t.id}
                href={`/teams/${t.tag}`}
                data-filter={`${t.name} ${t.tag}`.toLowerCase()}
                className={cn(
                  "group grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_110px_110px_24px] items-center gap-6 px-6 sm:px-8 py-5 transition-colors hover:bg-white/[0.025]",
                  i > 0 && "border-t border-white/[0.05]",
                )}
              >
                <div className="flex items-center gap-5 min-w-0">
                  <TeamLogo src={t.logo_url} tag={t.tag} size={48} />
                  <div className="min-w-0">
                    <div className="text-[17px] lg:text-[18px] font-semibold truncate group-hover:text-accent transition-colors">{t.name}</div>
                    <div className="mt-0.5 text-[13px] uppercase tracking-[0.18em] text-fg-3">{t.tag}</div>
                  </div>
                </div>
                <span className="hidden sm:block text-[15px] text-fg-2 truncate">{t.region ?? "—"}</span>
                <span className="num text-[15px] text-right text-fg-2">
                  {t.member_count}
                  <span className="sm:hidden text-fg-3"> игр.</span>
                </span>
                <span className="hidden sm:block num text-[15px] text-right text-fg-2">{t.avg_elo ?? "—"}</span>
                <IconArrow className="nudge hidden sm:block size-4 text-fg-3 group-hover:text-fg" />
              </Link>
            ))}
          </div>
        )}
      </Wrap>
    </>
  );
}
