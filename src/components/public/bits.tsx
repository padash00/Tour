import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { bracketLabel, formatDate, formatTime, formatMoney } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import type { MatchWithTeams } from "@/lib/matches";
import type { MatchStatus, Tournament, TournamentStatus } from "@/lib/types";
import { Status, TeamLogo, cn, matchStatus, tournamentStatus } from "@/components/ds";

export function TStatus({ status }: { status: TournamentStatus }) {
  return <Status info={tournamentStatus[status]} size="sm" />;
}

export function MStatus({ status }: { status: MatchStatus }) {
  return <Status info={matchStatus(status)} size="sm" />;
}

function tournamentFacts(t: Tournament, approved?: number) {
  const mode = modeOf(t.format);
  return [
    t.game,
    mode.size === 5 ? "5v5" : mode.size === 2 ? "2v2" : "1v1",
    bracketLabel[t.bracket_type] ?? t.bracket_type,
    approved !== undefined ? `${approved} / ${t.max_teams} ${mode.size === 1 ? "игроков" : "команд"}` : `${t.max_teams} ${mode.size === 1 ? "игроков" : "команд"}`,
    t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"),
  ];
}

function CoverImage({ url, className }: { url: string | null; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-bg-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url ?? "/home/tournament.jpg"} alt="" className="media-zoom absolute inset-0 h-full w-full object-cover saturate-[0.8]" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-bg/20 to-transparent" />
    </div>
  );
}

export function TournamentLine({ t, approved }: { t: Tournament; approved: number }) {
  const solo = modeOf(t.format).size === 1;
  const fill = Math.min(100, (approved / Math.max(1, t.max_teams)) * 100);
  const prize = t.prize_pool && !/^\s*0+\s*$/.test(t.prize_pool) ? formatMoney(t.prize_pool) : null;
  const facts = tournamentFacts(t).filter((_, i) => i !== 3);

  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group grid gap-4 rounded-surface border-b border-line-subtle px-2 py-6 transition-colors last:border-0 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:grid-cols-[168px_1fr_auto] sm:items-center lg:gap-8 lg:py-7"
    >
      <CoverImage url={t.cover_url} className="h-[120px] w-full rounded-control sm:h-[96px] sm:w-[168px]" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <TStatus status={t.status} />
          <span className="text-meta text-fg-3">{formatDate(t.starts_at)}</span>
        </div>
        <div className="mt-2 truncate text-[20px] font-semibold tracking-[-0.015em] transition-colors group-hover:text-accent-strong lg:text-[24px]">
          {t.name}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-meta text-fg-3">
          {facts.map((fact, i) => (
            <span key={`${fact}-${i}`} className="inline-flex items-center gap-3">
              {i > 0 && <span className="text-fg-4">·</span>}
              {fact}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 sm:min-w-[200px] sm:justify-end">
        <div className="flex-1 sm:w-[150px] sm:flex-none">
          <div className="flex items-baseline justify-between text-meta">
            <span className="text-fg-3">{solo ? "Участники" : "Команды"}</span>
            <span className="num text-fg">
              {approved}<span className="text-fg-3">/{t.max_teams}</span>
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${fill}%` }} />
          </div>
          {prize && <div className="mt-2 text-meta font-semibold text-fg">{prize}</div>}
        </div>
        <ArrowRight className="size-4 shrink-0 text-fg-3 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </div>
    </Link>
  );
}

type ListMatch = MatchWithTeams & { tournament?: Pick<Tournament, "name" | "slug"> | null };

function TeamCell({ team, lost, align }: { team: MatchWithTeams["team1"]; lost: boolean; align: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size="md" /> : <span className="size-10 shrink-0 rounded-control border border-dashed border-line" />}
      <span className={cn("truncate font-semibold", lost ? "text-fg-3" : "text-fg", !team && "font-normal text-fg-3")}>{team?.name ?? "TBD"}</span>
    </div>
  );
}

export function MatchLine({ m, showTournament = true }: { m: ListMatch; showTournament?: boolean }) {
  const finished = m.status === "finished";
  const live = m.status === "live";
  const scored = finished || live;
  const lost = (id: string | null) => finished && m.winner_id !== id;

  return (
    <Link
      href={`/matches/${m.id}`}
      className={cn(
        "group block rounded-control border-b border-line-subtle px-3 py-4 transition-colors last:border-0 hover:bg-white/[0.025] lg:py-5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        live && "bg-live/[0.04]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3 sm:hidden">
        <MStatus status={m.status} />
        <span className="truncate text-meta text-fg-3">{showTournament && m.tournament ? m.tournament.name : `BO${m.best_of}`}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:grid-cols-[140px_1fr_auto_1fr_180px] sm:gap-5 lg:text-[16px]">
        <div className="hidden min-w-0 sm:block">
          <MStatus status={m.status} />
          <div className="mt-1.5 text-meta text-fg-3">
            {m.scheduled_at ? `${formatDate(m.scheduled_at)}, ${formatTime(m.scheduled_at)}` : `Матч #${m.number}`}
          </div>
        </div>
        <TeamCell team={m.team1} lost={lost(m.team1_id)} align="right" />
        <div className="w-[92px] text-center">
          {scored ? (
            <span className="num text-[20px] font-semibold lg:text-[24px]">
              <span className={cn(finished && m.winner_id !== m.team1_id && "text-fg-3")}>{m.team1_score}</span>
              <span className="mx-1.5 text-fg-4">:</span>
              <span className={cn(finished && m.winner_id !== m.team2_id && "text-fg-3")}>{m.team2_score}</span>
            </span>
          ) : (
            <span className="num rounded-control border border-line-subtle px-2.5 py-1 text-meta text-fg-2">
              {m.scheduled_at ? formatTime(m.scheduled_at) : "vs"}
            </span>
          )}
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-fg-4">BO{m.best_of}</div>
        </div>
        <TeamCell team={m.team2} lost={lost(m.team2_id)} align="left" />
        <div className="hidden truncate text-right text-meta text-fg-3 sm:block">
          {showTournament && m.tournament ? m.tournament.name : `Матч #${m.number}`}
        </div>
      </div>
    </Link>
  );
}
