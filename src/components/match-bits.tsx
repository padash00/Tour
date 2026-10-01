import Link from "next/link";
import { roundTitle } from "@/lib/bracket";
import type { MatchWithTeams } from "@/lib/matches";
import type { MatchStatus } from "@/lib/types";
import { Pill, TeamLogo, cn } from "./ui";

export const matchStatusLabel: Record<MatchStatus, string> = {
  pending: "Ожидает",
  upcoming: "Скоро",
  veto: "Вето",
  ready: "Готов",
  live: "Live",
  finished: "Завершён",
  cancelled: "Отменён",
};

const tone: Record<MatchStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "live"> = {
  pending: "neutral",
  upcoming: "accent",
  veto: "warn",
  ready: "ok",
  live: "live",
  finished: "neutral",
  cancelled: "neutral",
};

export function MatchStatusBadge({ status, compact }: { status: MatchStatus; compact?: boolean }) {
  if (compact) {
    const color = {
      live: "text-danger",
      veto: "text-warn",
      ready: "text-ok",
      upcoming: "text-accent",
    }[status as string];
    return <span className={cn("uppercase tracking-wider", color ?? "text-fg-3")}>{matchStatusLabel[status]}</span>;
  }
  return <Pill tone={tone[status]}>{matchStatusLabel[status]}</Pill>;
}

export function matchStage(m: { bracket: MatchWithTeams["bracket"]; round: number }, all: { bracket: string; round: number }[]) {
  const totalUpper = Math.max(0, ...all.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...all.filter((x) => x.bracket === "lower").map((x) => x.round));
  return roundTitle(m.bracket, m.round, totalUpper, totalLower);
}

export function MatchRow({ m, stage, href }: { m: MatchWithTeams; stage?: string; href?: string }) {
  const finished = m.status === "finished";
  return (
    <Link
      href={href ?? `/matches/${m.id}`}
      className="card card-hover grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        {m.team1 ? <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={32} /> : <span className="size-8 rounded-lg border border-dashed border-line-strong" />}
        <span className={cn("truncate font-medium", finished && m.winner_id !== m.team1_id && "text-fg-3")}>
          {m.team1?.name ?? "TBD"}
        </span>
      </div>
      <div className="text-center">
        {finished || m.status === "live" ? (
          <div className="num text-lg font-bold">
            {m.team1_score} : {m.team2_score}
          </div>
        ) : (
          <div className="text-xs text-fg-3">vs</div>
        )}
        <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-fg-3">
          <span className="num">#{m.number}</span>
          <span>BO{m.best_of}</span>
          <MatchStatusBadge status={m.status} compact />
        </div>
        {stage && <div className="mt-0.5 text-[11px] text-fg-3">{stage}</div>}
      </div>
      <div className="flex items-center justify-end gap-3 min-w-0">
        <span className={cn("truncate font-medium text-right", finished && m.winner_id !== m.team2_id && "text-fg-3")}>
          {m.team2?.name ?? "TBD"}
        </span>
        {m.team2 ? <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={32} /> : <span className="size-8 rounded-lg border border-dashed border-line-strong" />}
      </div>
    </Link>
  );
}

/** Матчи, которые стоит показывать в списках: без пустых и баев */
export function visibleMatches<T extends MatchWithTeams>(list: T[]) {
  return list.filter((m) => m.status !== "cancelled" && !(m.is_walkover && (!m.team1_id || !m.team2_id)));
}
