import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { getTeamMatches } from "@/lib/matches";
import { getPlayerLeaderboard } from "@/lib/stats";
import { MatchLine, TStatus } from "@/components/public/bits";
import { Avatar, BigStat, Container, EmptyState, FaceitLevel, Meta, Pill, TeamLogo } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/teams/[tag]">): Promise<Metadata> {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  return { title: team?.name ?? "Команда" };
}

const roleLabel = { captain: "Капитан", player: "Основа", substitute: "Запасной" } as Record<string, string>;

export default async function TeamPage(props: PageProps<"/teams/[tag]">) {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team) notFound();

  const [members, regs, matches, board] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getTeamMatches(team.id),
    getPlayerLeaderboard(),
  ]);
  const recent = matches.filter((m) => m.status === "finished").reverse().slice(0, 10);
  const participations = regs.filter((r) => r.status === "approved");
  const visibleRegs = regs.filter((r) => r.status !== "withdrawn");
  const captain = members.find((m) => m.role === "captain");
  const ratingByPlayer = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));
  const wins = recent.filter((m) => m.winner_id === team.id).length;
  const ordered = [...members].sort(
    (a, b) => ["captain", "player", "substitute"].indexOf(a.role) - ["captain", "player", "substitute"].indexOf(b.role),
  );

  return (
    <>
      <section className="atmos">
        <Container className="pt-16 pb-14 md:pt-24 md:pb-16 flex flex-col md:flex-row md:items-end gap-8 md:gap-10">
          <TeamLogo src={team.logo_url} tag={team.tag} size={128} />
          <div className="flex-1 min-w-0">
            <h1 className="text-[44px] md:text-[64px] font-bold tracking-[-0.045em] leading-[0.95]">{team.name}</h1>
            <Meta
              className="mt-5"
              items={[
                team.tag,
                team.region,
                captain ? `Капитан — ${captain.player.nickname}` : null,
                `С ${formatDate(team.created_at)}`,
              ]}
            />
            {team.description && <p className="mt-5 max-w-xl text-fg-2 leading-relaxed">{team.description}</p>}
          </div>
        </Container>
      </section>

      <Container className="pt-14">
        <div className="flex flex-wrap gap-x-16 gap-y-8">
          <BigStat label="Игроков" value={members.length} />
          <BigStat label="Средний FACEIT ELO" value={averageElo(members) ?? "—"} />
          <BigStat label="Турниров" value={participations.length} />
          {recent.length > 0 && <BigStat label="Побед в последних матчах" value={`${wins}/${recent.length}`} />}
        </div>

        {/* СОСТАВ */}
        <section className="mt-20">
          <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Состав</h2>
          <div className="mt-6">
            <div className="hidden md:grid grid-cols-[1fr_120px_80px_90px_90px] gap-4 px-1 pb-3 text-[12px] text-fg-3 border-b border-line">
              <span>Игрок</span>
              <span>Роль</span>
              <span className="text-center">FACEIT</span>
              <span className="text-right">ELO</span>
              <span className="text-right">F16 Rating</span>
            </div>
            {ordered.map((m) => {
              const s = ratingByPlayer.get(m.player.id);
              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_80px_90px_90px] items-center gap-4 px-1 py-4 border-b border-white/[0.06]"
                >
                  <Link href={`/players/${m.player.steam_id}`} className="flex items-center gap-4 min-w-0 group">
                    <Avatar src={m.player.avatar_url} name={m.player.nickname} size={44} />
                    <div className="min-w-0">
                      <div className="text-[17px] font-semibold truncate group-hover:text-accent transition-colors">
                        {m.player.nickname}
                      </div>
                      <div className="md:hidden text-[13px] text-fg-3">{roleLabel[m.role] ?? m.role}</div>
                    </div>
                  </Link>
                  <span className="hidden md:block text-sm text-fg-2">
                    {m.player.is_banned ? <Pill tone="danger">Бан</Pill> : (roleLabel[m.role] ?? m.role)}
                  </span>
                  <span className="hidden md:flex justify-center">
                    <FaceitLevel level={m.player.faceit_level} />
                  </span>
                  <span className="hidden md:block num text-sm text-right text-fg-2">{m.player.faceit_elo ?? "—"}</span>
                  <span className="num text-sm text-right">{s ? s.rating.toFixed(2) : <span className="text-fg-3">—</span>}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* МАТЧИ */}
        <section className="mt-20">
          <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Последние матчи</h2>
          {recent.length ? (
            <div className="mt-4">
              {recent.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <EmptyState compact title="Матчей пока нет" description="История появится после первого участия в турнире." />
          )}
        </section>

        {/* ТУРНИРЫ */}
        <section className="mt-20 grid md:grid-cols-2 gap-14">
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.025em]">Турниры</h2>
            {visibleRegs.length === 0 ? (
              <p className="mt-3 text-fg-3">Команда ещё не участвовала в турнирах.</p>
            ) : (
              <div className="mt-3">
                {visibleRegs.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 py-3.5 border-b border-white/[0.06]">
                    <Link href={`/tournaments/${r.tournament.slug}`} className="flex-1 font-medium hover:text-accent truncate">
                      {r.tournament.name}
                    </Link>
                    {r.status === "approved" ? (
                      <TStatus status={r.tournament.status} />
                    ) : (
                      <Pill>{registrationStatusLabel[r.status]}</Pill>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.025em]">Достижения</h2>
            <p className="mt-3 text-fg-3">Первые трофеи впереди.</p>
          </div>
        </section>
      </Container>
    </>
  );
}
