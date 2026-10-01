import type { Metadata } from "next";
import Link from "next/link";
import { listTeams } from "@/lib/data";
import { ButtonLink, Container, EmptyState, IconUsers, PageHeader, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Команды" };

export default async function TeamsPage(props: PageProps<"/teams">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listTeams();
  const teams = q ? all.filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)) : all;

  return (
    <Container>
      <PageHeader
        eyebrow="Сообщество"
        title="Команды"
        description="Все команды F16 Arena. Средний ELO считается по FACEIT-профилям игроков."
        actions={<ButtonLink href="/team/create">Создать команду</ButtonLink>}
      />
      <form className="mb-6 sm:w-72">
        <input name="q" defaultValue={q} placeholder="Поиск команды или тега" className="field h-9 py-0" />
      </form>

      {teams.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title={all.length === 0 ? "Команд пока нет" : "Ничего не найдено"}
          description={all.length === 0 ? "Станьте первой командой на платформе." : "Попробуйте другой запрос."}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.tag}`} className="card card-hover p-5 flex items-center gap-4">
              <TeamLogo src={t.logo_url} tag={t.tag} size={52} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-fg-3 mt-1">
                  {t.tag}
                  {t.region ? ` · ${t.region}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm">{t.member_count}/5</div>
                <div className="num text-xs text-fg-3 mt-1">{t.avg_elo ?? "—"} elo</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
