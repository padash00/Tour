import Link from "next/link";
import { bracketLabel, formatDate, formatTime } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import type { MatchWithTeams } from "@/lib/matches";
import type { MatchStatus, Tournament, TournamentStatus } from "@/lib/types";
import { IconArrow, Meta, TeamLogo, cn } from "../ui";
import { MatchStatusChip, TournamentStatusChip } from "../primitives";

// ───────────────────────── статусы (общие чипы)

export function TStatus({ status }: { status: TournamentStatus }) {
  return <TournamentStatusChip status={status} size="sm" />;
}

export function MStatus({ status }: { status: MatchStatus }) {
  return <MatchStatusChip status={status} />;
}

// ───────────────────────── факты турнира

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

/** Фото турнира: обложка из базы или кадр из утверждённого макета главной, затемнённый снизу */
function CoverImage({ url, className }: { url: string | null; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-bg-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url ?? "/home/tournament.jpg"} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.8]" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-bg/20 to-transparent" />
    </div>
  );
}

/** Строка турнира в списке — без карточки */
export function TournamentLine({ t, approved }: { t: Tournament; approved: number }) {
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group grid gap-4 lg:gap-7 py-6 lg:py-7 border-b border-white/[0.06] sm:grid-cols-[150px_1fr_auto] sm:items-center hover:bg-white/[0.015] transition-colors"
    >
      <CoverImage url={t.cover_url} className="hidden sm:block h-[88px] w-[150px] rounded-[10px]" />
      <div className="min-w-0">
        <TStatus status={t.status} />
        <div className="mt-1.5 text-xl lg:text-[24px] font-semibold tracking-[-0.015em] truncate group-hover:text-accent transition-colors">
          {t.name}
        </div>
        <Meta className="mt-1.5 text-[13px] text-fg-3" items={[formatDate(t.starts_at), ...tournamentFacts(t, approved)]} />
      </div>
      <div className="flex items-center gap-6">
        {t.prize_pool && !/^\s*0+\s*$/.test(t.prize_pool) && <div className="text-right font-semibold">{t.prize_pool}</div>}
        <IconArrow className="size-4 text-fg-3 group-hover:text-fg transition-colors" />
      </div>
    </Link>
  );
}

// ───────────────────────── матчи

type ListMatch = MatchWithTeams & { tournament?: Pick<Tournament, "name" | "slug"> | null };

/** Строка матча: команды и счёт, без рамок */
export function MatchLine({ m, showTournament = true }: { m: ListMatch; showTournament?: boolean }) {
  const finished = m.status === "finished";
  const scored = finished || m.status === "live";
  const lost = (id: string | null) => finished && m.winner_id !== id;
  return (
    <Link
      href={`/matches/${m.id}`}
      className="group grid grid-cols-[1fr_auto_1fr] sm:grid-cols-[150px_1fr_auto_1fr_160px] items-center gap-4 py-5 px-2 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors lg:text-[16px]"
    >
      <div className="hidden sm:block min-w-0">
        <MStatus status={m.status} />
      </div>
      <div className="flex items-center justify-end gap-3 min-w-0">
        <span className={cn("truncate font-medium text-right", lost(m.team1_id) && "text-fg-3")}>{m.team1?.name ?? "TBD"}</span>
        {m.team1 ? <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={32} /> : <span className="size-8" />}
      </div>
      <div className="w-[84px] text-center">
        {scored ? (
          <span className="num text-lg lg:text-[20px] font-semibold">
            {m.team1_score}
            <span className="text-fg-3 mx-1">:</span>
            {m.team2_score}
          </span>
        ) : (
          <span className="text-[13px] text-fg-3">{m.scheduled_at ? formatTime(m.scheduled_at) : "vs"}</span>
        )}
      </div>
      <div className="flex items-center gap-3 min-w-0">
        {m.team2 ? <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={32} /> : <span className="size-8" />}
        <span className={cn("truncate font-medium", lost(m.team2_id) && "text-fg-3")}>{m.team2?.name ?? "TBD"}</span>
      </div>
      <div className="hidden sm:block text-right text-[13px] text-fg-3 truncate">
        {showTournament && m.tournament ? m.tournament.name : `BO${m.best_of}`}
      </div>
    </Link>
  );
}
