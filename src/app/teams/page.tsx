import type { Metadata } from "next";
import Link from "next/link";
import { listTeams } from "@/lib/data";
import { ButtonLink, Container, EmptyState, PageHeader, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Команды" };

export default async function TeamsPage(props: PageProps<"/teams">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listTeams();
  const teams = q ? all.filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)) : all;

  return (
    <Container>
      <PageHeader title="Команды" actions={<ButtonLink href="/team/create" variant="secondary">Создать команду</ButtonLink>} />

      {all.length > 0 && (
        <form className="mb-4 sm:w-80">
          <input name="q" defaultValue={q} placeholder="Поиск по названию или тегу" className="field" />
        </form>
      )}

      {teams.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "Команд пока нет" : "Ничего не найдено"}
          description={all.length === 0 ? "Станьте первой командой на платформе." : "Попробуйте другой запрос."}
          action={all.length === 0 ? <ButtonLink href="/team/create">Создать команду</ButtonLink> : undefined}
        />
      ) : (
        <div>
          <div className="hidden sm:grid grid-cols-[1fr_140px_100px_100px] gap-4 px-1 pb-3 text-[12px] text-fg-3 border-b border-line">
            <span>Команда</span>
            <span>Регион</span>
            <span className="text-right">Игроки</span>
            <span className="text-right">Avg ELO</span>
          </div>
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/teams/${t.tag}`}
              className="group grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_100px_100px] items-center gap-4 px-1 py-4 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <TeamLogo src={t.logo_url} tag={t.tag} size={40} />
                <div className="min-w-0">
                  <div className="font-semibold truncate group-hover:text-accent transition-colors">{t.name}</div>
                  <div className="text-[13px] text-fg-3">{t.tag}</div>
                </div>
              </div>
              <span className="hidden sm:block text-sm text-fg-2 truncate">{t.region ?? "—"}</span>
              <span className="num text-sm text-right text-fg-2">{t.member_count}</span>
              <span className="hidden sm:block num text-sm text-right text-fg-2">{t.avg_elo ?? "—"}</span>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
