import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MAX_MAIN, averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { getTeamMatches } from "@/lib/matches";
import { getHeadToHead, getPlayerLeaderboard } from "@/lib/stats";
import { HeadToHeadList } from "@/components/head-to-head";
import { getTeamAwards } from "@/lib/awards";
import { AwardsRow } from "@/components/public/awards";
import { MatchLine, TStatus } from "@/components/public/bits";
import { FormStrip } from "@/components/public/form-strip";
import { ratingColor } from "@/components/stats-format";
import { Avatar, FaceitLevel, TeamLogo, cn } from "@/components/ui";
import { CARD, EmptyCard, Eyebrow, HeroNumber, SectionHead, StatusChip, WRAP, Wrap } from "@/components/primitives";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

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

  const [members, regs, matches, board, awards, h2h] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getTeamMatches(team.id),
    getPlayerLeaderboard(),
    getTeamAwards(team.id),
    getHeadToHead({ teamIds: [team.id] }),
  ]);
  const finished = matches.filter((m) => m.status === "finished").reverse();
  const recent = finished.slice(0, 10);
  const participations = regs.filter((r) => r.status === "approved");
  const visibleRegs = regs.filter((r) => r.status !== "withdrawn");
  const captain = members.find((m) => m.role === "captain");
  const ratingByPlayer = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));
  const wins = finished.filter((m) => m.winner_id === team.id).length;
  const losses = finished.length - wins;
  const ordered = [...members].sort(
    (a, b) => ["captain", "player", "substitute"].indexOf(a.role) - ["captain", "player", "substitute"].indexOf(b.role),
  );
  const mains = ordered.filter((m) => m.role !== "substitute");
  const subs = ordered.filter((m) => m.role === "substitute");
  const ratings = members.map((m) => ratingByPlayer.get(m.player.id)?.rating).filter((r): r is number => r != null);
  const teamRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const form = recent.slice(0, 5).map((m) => (m.winner_id === team.id ? "W" : "L") as "W" | "L");

  return (
    <>
      {/* ── идентичность команды */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(1000px_480px_at_80%_-10%,#1a2c48c0,transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(700px_380px_at_0%_110%,#0f1b2c90,transparent_70%)]" />
          {/* тег команды крупно на фоне — типографика вместо картинки */}
          <div className="absolute -right-6 top-1/2 hidden -translate-y-1/2 select-none text-[220px] font-bold uppercase leading-none tracking-[-0.04em] text-white/[0.025] lg:block xl:text-[280px]">
            {team.tag}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
        </div>
        <div className={cn(WRAP, "relative pt-14 pb-12 lg:pt-20 lg:pb-14")}>
          <Link href="/teams" className="inline-flex min-h-11 items-center lg:min-h-0 text-[14px] text-fg-2 transition-colors hover:text-fg">
            ← Команды
          </Link>
          <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-8 sm:flex-row sm:items-end">
              <div className="shrink-0 rounded-[20px] border border-white/[0.1] bg-[#0b1420]/80 p-5 shadow-[var(--shadow-soft)]">
                <TeamLogo src={team.logo_url} tag={team.tag} size={144} />
              </div>
              <div className="min-w-0">
                <Eyebrow>Команда F16 Arena · {team.tag}</Eyebrow>
                <h1 className="t-display mt-5 break-words">{team.name}</h1>
                <div className="mt-6 flex flex-col items-start gap-y-2 text-[15px] text-fg sm:flex-row sm:flex-wrap sm:items-center lg:text-[17px]">
                  {[team.region, captain ? `Капитан — ${captain.player.nickname}` : null, `С ${formatDate(team.created_at)}`]
                    .filter(Boolean)
                    .map((x, i) => (
                      <span key={i} className="flex min-w-0 max-w-full items-center">
                        {i > 0 && <span className="mx-4 hidden h-4 w-px shrink-0 bg-white/20 sm:block" />}
                        <span className="min-w-0 break-all sm:break-normal">{x}</span>
                      </span>
                    ))}
                </div>
                {team.description && <p className="t-body mt-5 max-w-[640px]">{team.description}</p>}
              </div>
            </div>
            {/* форма */}
            <div className={cn(CARD, "shrink-0 p-6 lg:min-w-[300px]")}>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-fg-3">Форма</div>
              {form.length ? (
                <>
                  <FormStrip results={form} className="mt-4" />
                  <div className="num mt-4 text-[14px] text-fg-2">
                    <span className="text-ok">{wins}W</span> · <span className="text-danger">{losses}L</span>
                    <span className="text-fg-3"> за всё время</span>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-[14px] text-fg-3">Первый официальный матч впереди.</p>
              )}
            </div>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-8 border-t border-white/[0.06] pt-10 sm:grid-cols-4">
            <HeroNumber label="Игроков" value={members.length} />
            <HeroNumber label="Средний ELO" value={averageElo(members) ?? "—"} />
            <HeroNumber label="F16 Rating" value={teamRating ? teamRating.toFixed(2) : "—"} tone={teamRating ? ratingColor(teamRating) : "text-fg-3"} />
            <HeroNumber label="Турниров" value={participations.length} />
          </div>
        </div>
      </section>

      <Wrap className="pt-14">
        {/* ── состав: карточки игроков */}
        <section>
          <SectionHead title={`Основа · ${mains.length}/${MAX_MAIN}`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 lg:gap-4">
            {mains.map((m) => (
              <PlayerCard key={m.id} m={m} rating={ratingByPlayer.get(m.player.id)?.rating ?? null} matches={ratingByPlayer.get(m.player.id)?.matches ?? 0} />
            ))}
            {Array.from({ length: Math.max(0, MAX_MAIN - mains.length) }, (_, i) => (
              <div
                key={`slot-${i}`}
                className="grid min-h-[260px] place-items-center rounded-[12px] border border-dashed border-white/[0.1] text-center text-[13px] text-fg-3"
              >
                <div>
                  <div className="mx-auto mb-3 size-16 rounded-full border border-dashed border-white/[0.14]" />
                  Свободный слот
                </div>
              </div>
            ))}
          </div>
          {subs.length > 0 && (
            <>
              <SectionHead title="Запас" className="mt-10" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 lg:gap-4">
                {subs.map((m) => (
                  <PlayerCard key={m.id} m={m} rating={ratingByPlayer.get(m.player.id)?.rating ?? null} matches={ratingByPlayer.get(m.player.id)?.matches ?? 0} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── результаты */}
        <section className="mt-16 grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <SectionHead title="Последние матчи" />
            {recent.length ? (
              <div className={cn(CARD, "px-6 md:px-8")}>
                {recent.map((m) => (
                  <div key={m.id} className="relative">
                    <span
                      className={cn("absolute -left-6 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full md:-left-8", m.winner_id === team.id ? "bg-ok" : "bg-danger")}
                      aria-hidden
                    />
                    <MatchLine m={m} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyCard dashed title="Матчей пока нет" text="История появится после первого участия в турнире." />
            )}
          </div>

          <div className="space-y-4">
            {h2h.length > 0 && (
              <div>
                <SectionHead title="Личные встречи" />
                <div className={cn(CARD, "px-6 py-2 lg:px-8")}>
                  <HeadToHeadList items={h2h} />
                </div>
              </div>
            )}
            <div>
              <SectionHead title="Турниры" />
              <div className={cn(CARD, "px-6 py-2 lg:px-8")}>
                {visibleRegs.length === 0 ? (
                  <p className="py-5 text-[14px] text-fg-3">Команда ещё не участвовала в турнирах.</p>
                ) : (
                  visibleRegs.map((r, i) => (
                    <div key={r.id} className={cn("flex items-center gap-4 py-4", i > 0 && "border-t border-white/[0.06]")}>
                      <Link href={`/tournaments/${r.tournament.slug}`} className="flex-1 truncate text-[15px] font-semibold transition-colors hover:text-accent">
                        {r.tournament.name}
                      </Link>
                      {r.status === "approved" ? (
                        <TStatus status={r.tournament.status} />
                      ) : (
                        <StatusChip size="sm">{registrationStatusLabel[r.status]}</StatusChip>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <SectionHead title="Трофеи" />
              {awards.length ? (
                <div className={cn(CARD, "px-5 py-5 lg:px-6")}>
                  <AwardsRow awards={awards} />
                </div>
              ) : (
                <div className={cn(CARD, "flex items-center gap-5 px-6 py-6 lg:px-8")}>
                  <svg viewBox="0 0 24 24" className="size-9 shrink-0 text-fg-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                    <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z M7.5 6H4.5v1.2A3 3 0 0 0 7.5 10M16.5 6h3v1.2a3 3 0 0 1-3 3M12 13.5v3.5M8.5 20h7M10 17h4v3h-4z" />
                  </svg>
                  <p className="text-[14px] text-fg-3">Первые трофеи впереди — призовые места F16 Arena появятся здесь.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </Wrap>
    </>
  );
}

type Member = Awaited<ReturnType<typeof getTeamMembers>>[number];

/** Карточка игрока в составе: аватар, ник, роль, FACEIT, F16 Rating */
function PlayerCard({ m, rating, matches }: { m: Member; rating: number | null; matches: number }) {
  const cap = m.role === "captain";
  return (
    <Link
      href={`/players/${m.player.steam_id}`}
      className={cn(
        CARD,
        "group relative flex min-h-[260px] flex-col items-center px-4 pb-5 pt-7 text-center transition-[border-color,background-color,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#0d1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        cap && "border-accent/30",
      )}
    >
      {cap && (
        <span className="absolute left-3 top-3 grid size-6 place-items-center rounded-[5px] border border-accent/40 bg-accent/[0.1] text-[11px] font-bold text-accent" title="Капитан">
          C
        </span>
      )}
      <span className="absolute right-3 top-3">
        <FaceitLevel level={m.player.faceit_level} />
      </span>
      <div className="rounded-full border border-white/[0.1] p-1">
        <Avatar src={m.player.avatar_url} name={m.player.nickname} size={84} />
      </div>
      <div className="mt-4 w-full truncate text-[17px] font-semibold text-fg transition-colors group-hover:text-accent lg:text-[18px]">{m.player.nickname}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-fg-3">
        {m.player.is_banned ? <span className="text-danger">Бан</span> : roleLabel[m.role] ?? m.role}
      </div>
      <div className="mt-auto grid w-full grid-cols-2 gap-2 border-t border-white/[0.06] pt-4">
        <div>
          <div className={cn("num text-[22px] font-semibold leading-none", rating != null ? ratingColor(rating) : "text-fg-3")}>
            {rating != null ? rating.toFixed(2) : "—"}
          </div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-3">Rating</div>
        </div>
        <div>
          <div className="num text-[22px] font-semibold leading-none text-fg-2">{m.player.faceit_elo ?? "—"}</div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-3">{matches ? `ELO · ${matches} м.` : "ELO"}</div>
        </div>
      </div>
    </Link>
  );
}
