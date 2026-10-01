import Link from "next/link";
import { roundTitle } from "@/lib/bracket";
import type { MatchWithTeams } from "@/lib/matches";
import { formatDateTime } from "@/lib/format";
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

// единая система: LIVE — красный, готов — синий, вето — янтарный, ожидание — серый
const tone: Record<MatchStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "live"> = {
  pending: "neutral",
  upcoming: "neutral",
  veto: "warn",
  ready: "accent",
  live: "live",
  finished: "neutral",
  cancelled: "neutral",
};

export function MatchStatusBadge({ status, compact }: { status: MatchStatus; compact?: boolean }) {
  if (compact) {
    const color = { live: "text-danger", veto: "text-warn", ready: "text-accent" }[status as string];
    return (
      <span className={cn("inline-flex items-center gap-1", color ?? "text-fg-3")}>
        {color && <span className={cn("size-1 rounded-full bg-current", status === "live" && "animate-pulse")} />}
        {matchStatusLabel[status]}
      </span>
    );
  }
  return (
    <Pill tone={tone[status]} dot>
      {matchStatusLabel[status]}
    </Pill>
  );
}

export function matchStage(
  m: { bracket: MatchWithTeams["bracket"]; round: number; group_label?: string | null },
  all: { bracket: string; round: number }[],
) {
  if (m.bracket === "group") return `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`;
  if (m.bracket === "swiss") return `Швейцарка · раунд ${m.round}`;
  const totalUpper = Math.max(0, ...all.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...all.filter((x) => x.bracket === "lower").map((x) => x.round));
  return roundTitle(m.bracket, m.round, totalUpper, totalLower);
}

/** Строка матча: команды по краям, счёт или время по центру. Без рамки-карточки */
export function MatchRow({ m, stage, href }: { m: MatchWithTeams; stage?: string; href?: string }) {
  const finished = m.status === "finished";
  const showScore = finished || m.status === "live";
  return (
    <Link
      href={href ?? `/matches/${m.id}`}
      className={cn(
        "group grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3.5 rounded-xl transition-colors hover:bg-white/[0.03]",
        m.status === "live" && "bg-danger-dim/50",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {m.team1 ? <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={28} /> : <span className="size-7 rounded-md bg-white/[0.03]" />}
        <span className={cn("truncate font-medium", finished && m.winner_id !== m.team1_id && "text-fg-3")}>
          {m.team1?.name ?? "TBD"}
        </span>
      </div>
      <div className="text-center min-w-[96px]">
        {showScore ? (
          <div className="num text-lg font-semibold">
            <span className={cn(finished && m.winner_id !== m.team1_id && "text-fg-3")}>{m.team1_score}</span>
            <span className="text-fg-3 mx-1.5">:</span>
            <span className={cn(finished && m.winner_id !== m.team2_id && "text-fg-3")}>{m.team2_score}</span>
          </div>
        ) : m.scheduled_at ? (
          <div className="text-[13px] text-fg-2">{formatDateTime(m.scheduled_at)}</div>
        ) : (
          <div className="text-[13px] text-fg-3">vs</div>
        )}
        <div className="mt-0.5 flex items-center justify-center gap-2 text-[11px] text-fg-3">
          <span>BO{m.best_of}</span>
          <MatchStatusBadge status={m.status} compact />
        </div>
        {stage && <div className="mt-0.5 text-[11px] text-fg-3">{stage}</div>}
      </div>
      <div className="flex items-center justify-end gap-3 min-w-0">
        <span className={cn("truncate font-medium text-right", finished && m.winner_id !== m.team2_id && "text-fg-3")}>
          {m.team2?.name ?? "TBD"}
        </span>
        {m.team2 ? <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={28} /> : <span className="size-7 rounded-md bg-white/[0.03]" />}
      </div>
    </Link>
  );
}

/** Матчи, которые стоит показывать в списках: без пустых и баев */
export function visibleMatches<T extends MatchWithTeams>(list: T[]) {
  return list.filter((m) => m.status !== "cancelled" && !(m.is_walkover && (!m.team1_id || !m.team2_id)));
}
