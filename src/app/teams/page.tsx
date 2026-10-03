import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { listTeams } from "@/lib/data";
import { ClientFilter } from "@/components/public/client-filter";
import { TeamCta } from "@/components/public/team-cta";
import { TeamsNav } from "@/components/team/teams-nav";
import { Container, EmptyState, PageTitle, TeamLogo } from "@/components/ds";

export const metadata: Metadata = { title: "Команды" };

// поиск — в браузере (ClientFilter): страница одинакова для всех и отдаётся из кэша CDN
export const revalidate = 30;

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "команда" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "команды" : "команд");

const playersWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "игрок" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "игрока" : "игроков");

export default async function TeamsPage() {
  const teams = await listTeams();

  return (
    <Container className="pt-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Команды</PageTitle>
          <p className="mt-1 text-meta text-fg-3">{teams.length ? `${teams.length} ${plural(teams.length)} на платформе` : "Пока ни одной команды"}</p>
        </div>
        <TeamCta />
      </header>
      <div className="mt-6">
        <TeamsNav />
      </div>

      <div className="pt-8">
        {teams.length === 0 ? (
          <EmptyState icon={<Users />} title="Команд пока нет" text="Станьте первой командой на платформе — создание займёт минуту." action={<TeamCta />} />
        ) : (
          <>
            <ClientFilter scope="teams" placeholder="Поиск по названию или тегу" className="mb-5" />
            <div className="overflow-hidden rounded-surface border border-line-subtle bg-surface" data-filter-scope="teams">
              <p data-filter-empty hidden className="px-5 py-8 text-[14px] text-fg-3">
                Ничего не найдено — попробуйте другое название или тег.
              </p>
              <div className="hidden grid-cols-[minmax(0,1fr)_180px_90px_100px_20px] gap-4 border-b border-line-subtle px-5 py-3 text-micro font-semibold uppercase tracking-[0.12em] text-fg-3 sm:grid">
                <span>Команда</span>
                <span>Регион</span>
                <span className="text-right">Игроки</span>
                <span className="text-right">ELO основы</span>
                <span />
              </div>
              <div className="divide-y divide-line-subtle">
                {teams.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${encodeURIComponent(t.tag)}`}
                    data-filter={`${t.name} ${t.tag}`.toLowerCase()}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition-colors duration-[var(--dur-hover)] hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_180px_90px_100px_20px]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <TeamLogo src={t.logo_url} tag={t.tag} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-fg group-hover:text-accent">{t.name}</span>
                        <span className="num block text-micro tracking-[0.1em] text-fg-3">{t.tag}</span>
                      </span>
                    </span>
                    <span className="hidden truncate text-[14px] text-fg-2 sm:block">{t.region ?? "—"}</span>
                    <span className="num text-right text-[14px] text-fg-2">
                      {t.member_count}
                      <span className="text-fg-3 sm:hidden"> {playersWord(t.member_count)}</span>
                    </span>
                    <span className="num hidden text-right text-[14px] text-fg-2 sm:block">{t.avg_elo ?? "—"}</span>
                    <ChevronRight className="hidden size-4 text-fg-4 group-hover:text-fg-2 sm:block" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
