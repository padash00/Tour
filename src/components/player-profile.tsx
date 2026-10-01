import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { Player } from "@/lib/types";
import { Avatar, Card, Container, EmptyState, FaceitLevel, IconChart, SectionTitle, TeamLogo } from "./ui";

export function PlayerProfile({
  player,
  team,
  actions,
}: {
  player: Player;
  team: { name: string; tag: string; logo_url: string | null } | null;
  actions?: React.ReactNode;
}) {
  const stats = [
    { label: "Rating", value: "—" },
    { label: "K/D", value: "—" },
    { label: "ADR", value: "—" },
    { label: "KAST", value: "—" },
    { label: "Матчи", value: "0" },
    { label: "Карты", value: "0" },
  ];

  return (
    <>
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <Container className="relative py-14 flex flex-col md:flex-row md:items-center gap-8">
          <Avatar src={player.avatar_url} name={player.nickname} size={112} />
          <div className="flex-1 min-w-0">
            <div className="label">Игрок F16 Arena</div>
            <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-[-0.04em] truncate">{player.nickname}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-3">
              {team ? (
                <Link href={`/teams/${team.tag}`} className="inline-flex items-center gap-2 text-fg-2 hover:text-fg">
                  <TeamLogo src={team.logo_url} tag={team.tag} size={20} />
                  {team.name}
                </Link>
              ) : (
                <span>Без команды</span>
              )}
              {player.country && <span>{player.country}</span>}
              <span>На платформе с {formatDate(player.created_at)}</span>
              {player.profile_url && (
                <a href={player.profile_url} target="_blank" rel="noreferrer" className="hover:text-fg-2">
                  Steam ↗
                </a>
              )}
            </div>
          </div>
          <div className="card px-5 py-4 flex items-center gap-4">
            <FaceitLevel level={player.faceit_level} />
            <div>
              <div className="label">FACEIT</div>
              <div className="mt-0.5 font-semibold">
                {player.faceit_nickname ? (
                  <a href={`https://www.faceit.com/ru/players/${player.faceit_nickname}`} target="_blank" rel="noreferrer" className="hover:text-accent">
                    {player.faceit_elo ?? "—"} ELO
                  </a>
                ) : (
                  <span className="text-fg-3">Не найден</span>
                )}
              </div>
            </div>
          </div>
          {actions}
        </Container>
      </section>

      <Container className="pt-10 space-y-8">
        <div>
          <SectionTitle eyebrow="Статистика F16" title="Показатели" />
          <div className="card grid grid-cols-3 md:grid-cols-6 divide-x divide-line">
            {stats.map((s) => (
              <div key={s.label} className="p-5">
                <div className="label">{s.label}</div>
                <div className="mt-2 text-2xl font-bold num text-fg-3">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <SectionTitle title="История матчей" />
            <EmptyState compact icon={<IconChart />} title="История матчей появится после первого участия" />
          </div>
          <div>
            <SectionTitle title="Турниры F16" />
            <Card className="p-6 grid grid-cols-3 gap-4">
              <div><div className="label">Турниров</div><div className="mt-2 text-xl font-bold num">0</div></div>
              <div><div className="label">Финалов</div><div className="mt-2 text-xl font-bold num">0</div></div>
              <div><div className="label">MVP</div><div className="mt-2 text-xl font-bold num">0</div></div>
            </Card>
          </div>
        </div>
      </Container>
    </>
  );
}
