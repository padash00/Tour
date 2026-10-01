import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { getTeamMatches } from "@/lib/matches";
import { getPlayerLeaderboard } from "@/lib/stats";
import { MatchLine, TStatus } from "@/components/public/bits";
import { CARD, HeroNumber, PageHero, SectionHead, Wrap } from "@/components/public/page-kit";
import { ratingColor } from "@/components/stats-table";
import { Avatar, FaceitLevel, Pill, TeamLogo, cn } from "@/components/ui";

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
  const facts = [team.tag, team.region, captain ? `Капитан — ${captain.player.nickname}` : null, `С ${formatDate(team.created_at)}`].filter(
    Boolean,
  );

  return (
    <>
      <PageHero
        media={
          <div className="shrink-0 rounded-[16px] border border-white/[0.08] bg-[#0b1420]/80 p-4">
            <TeamLogo src={team.logo_url} tag={team.tag} size={128} />
          </div>
        }
        eyebrow="Команда F16 Arena"
        title={team.name}
        lead={
          <>
            <div className="flex flex-wrap items-center gap-y-2 text-[15px] lg:text-[17px] text-fg">
              {facts.map((x, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="mx-4 h-4 w-px bg-white/20" />}
                  {x}
                </span>
              ))}
            </div>
            {team.description && <p className="mt-5 text-fg-2">{team.description}</p>}
          </>
        }
      >
        <div className="mt-12 flex flex-wrap gap-x-16 gap-y-8 border-t border-white/[0.06] pt-10">
          <HeroNumber label="Игроков" value={members.length} />
          <HeroNumber label="Средний FACEIT ELO" value={averageElo(members) ?? "—"} />
          <HeroNumber label="Турниров" value={participations.length} />
          {recent.length > 0 && <HeroNumber label="Побед в последних" value={`${wins}/${recent.length}`} />}
        </div>
      </PageHero>

      <Wrap className="pt-14">
        {/* СОСТАВ — главный раздел */}
        <section>
          <SectionHead title="Состав" />
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="hidden md:grid grid-cols-[1fr_140px_90px_100px_120px] gap-6 px-8 py-4 text-[12px] uppercase tracking-[0.2em] text-fg-3 border-b border-white/[0.06]">
              <span>Игрок</span>
              <span>Роль</span>
              <span className="text-center">FACEIT</span>
              <span className="text-right">ELO</span>
              <span className="text-right">F16 Rating</span>
            </div>
            {ordered.length === 0 && <div className="px-8 py-10 text-fg-3">В составе пока никого нет.</div>}
            {ordered.map((m, i) => {
              const s = ratingByPlayer.get(m.player.id);
              return (
                <div
                  key={m.id}
                  className={cn(
                    "grid grid-cols-[1fr_auto] md:grid-cols-[1fr_140px_90px_100px_120px] items-center gap-6 px-6 md:px-8 py-5",
                    i > 0 && "border-t border-white/[0.05]",
                  )}
                >
                  <Link href={`/players/${m.player.steam_id}`} className="flex items-center gap-5 min-w-0 group">
                    <Avatar src={m.player.avatar_url} name={m.player.nickname} size={56} />
                    <div className="min-w-0">
                      <div className="text-[18px] lg:text-[20px] font-semibold truncate group-hover:text-accent transition-colors">
                        {m.player.nickname}
                      </div>
                      <div className="md:hidden mt-0.5 text-[13px] text-fg-3">{roleLabel[m.role] ?? m.role}</div>
                    </div>
                  </Link>
                  <span className="hidden md:block text-[15px] text-fg-2">
                    {m.player.is_banned ? <Pill tone="danger">Бан</Pill> : (roleLabel[m.role] ?? m.role)}
                  </span>
                  <span className="hidden md:flex justify-center">
                    <FaceitLevel level={m.player.faceit_level} />
                  </span>
                  <span className="hidden md:block num text-[15px] text-right text-fg-2">{m.player.faceit_elo ?? "—"}</span>
                  <span className={cn("num text-[18px] text-right font-semibold", s ? ratingColor(s.rating) : "text-fg-3 font-normal")}>
                    {s ? s.rating.toFixed(2) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* МАТЧИ */}
        <section className="mt-16">
          <SectionHead title="Последние матчи" />
          {recent.length ? (
            <div className={cn(CARD, "px-6 md:px-8")}>
              {recent.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <div className={cn(CARD, "flex items-center gap-6 border-dashed px-8 py-8")}>
              <div>
                <div className="text-[17px] font-semibold text-fg">Матчей пока нет</div>
                <div className="mt-1 text-[15px] text-fg-3">История появится после первого участия в турнире.</div>
              </div>
            </div>
          )}
        </section>

        {/* ТУРНИРЫ И ДОСТИЖЕНИЯ */}
        <section className="mt-16 grid gap-4 md:grid-cols-2">
          <div className={cn(CARD, "p-8 lg:p-10")}>
            <SectionHead title="Турниры" />
            {visibleRegs.length === 0 ? (
              <p className="text-[15px] text-fg-3">Команда ещё не участвовала в турнирах.</p>
            ) : (
              <div>
                {visibleRegs.map((r, i) => (
                  <div key={r.id} className={cn("flex items-center gap-4 py-4", i > 0 && "border-t border-white/[0.06]")}>
                    <Link href={`/tournaments/${r.tournament.slug}`} className="flex-1 text-[16px] font-medium hover:text-accent truncate">
                      {r.tournament.name}
                    </Link>
                    {r.status === "approved" ? <TStatus status={r.tournament.status} /> : <Pill>{registrationStatusLabel[r.status]}</Pill>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={cn(CARD, "p-8 lg:p-10")}>
            <SectionHead title="Достижения" />
            <p className="text-[15px] text-fg-3">Первые трофеи впереди.</p>
          </div>
        </section>
      </Wrap>
    </>
  );
}
