import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { RosterList } from "@/components/roster-list";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { Card, Container, EmptyState, Pill, SectionTitle, Stat, TeamLogo } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/teams/[tag]">): Promise<Metadata> {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  return { title: team?.name ?? "Команда" };
}

export default async function TeamPage(props: PageProps<"/teams/[tag]">) {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team) notFound();

  const [members, regs] = await Promise.all([getTeamMembers(team.id), getTeamRegistrations(team.id)]);
  const participations = regs.filter((r) => r.status === "approved");
  const captain = members.find((m) => m.role === "captain");

  return (
    <>
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <Container className="relative py-14 flex flex-col md:flex-row md:items-center gap-8">
          <TeamLogo src={team.logo_url} tag={team.tag} size={112} />
          <div className="flex-1">
            <div className="label">{team.tag}{team.region ? ` · ${team.region}` : ""}</div>
            <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-[-0.04em]">{team.name}</h1>
            {team.description && <p className="mt-4 max-w-xl text-fg-2 leading-relaxed">{team.description}</p>}
          </div>
          <div className="grid grid-cols-3 gap-8">
            <Stat label="Игроков" value={<span className="num">{members.length}</span>} />
            <Stat label="Avg ELO" value={<span className="num">{averageElo(members) ?? "—"}</span>} />
            <Stat label="Турниров" value={<span className="num">{participations.length}</span>} />
          </div>
        </Container>
      </section>

      <Container className="pt-10 grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle title="Состав" />
            <RosterList
              items={members.map((m) => ({
                key: m.id,
                player: m.player,
                role: m.role === "captain" ? "captain" : m.role === "substitute" ? "sub" : "main",
              }))}
            />
          </Card>
          <div>
            <SectionTitle title="Последние матчи" />
            <EmptyState compact title="История матчей появится после первого участия" />
          </div>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <div className="label mb-4">Информация</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-fg-3">Капитан</span><span>{captain?.player.nickname ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-3">Регион</span><span>{team.region ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-fg-3">Создана</span><span>{formatDate(team.created_at)}</span></div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="label mb-4">Турниры</div>
            {regs.filter((r) => r.status !== "withdrawn").length === 0 ? (
              <p className="text-sm text-fg-3">Команда ещё не участвовала в турнирах.</p>
            ) : (
              <div className="divide-y divide-line">
                {regs
                  .filter((r) => r.status !== "withdrawn")
                  .map((r) => (
                    <div key={r.id} className="py-3 flex items-center gap-3">
                      <Link href={`/tournaments/${r.tournament.slug}`} className="flex-1 text-sm font-medium hover:text-accent">
                        {r.tournament.name}
                      </Link>
                      {r.status === "approved" ? (
                        <TournamentStatusPill status={r.tournament.status} />
                      ) : (
                        <Pill>{registrationStatusLabel[r.status]}</Pill>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </Card>
          <Card className="p-6">
            <div className="label mb-2">Достижения</div>
            <p className="text-sm text-fg-3">Пока пусто — первые трофеи впереди.</p>
          </Card>
        </div>
      </Container>
    </>
  );
}
