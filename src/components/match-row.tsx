import Link from "next/link";
import type { Match, Team } from "@/lib/types";
import { Score, Status, TeamLogo, cn, matchStatus } from "@/components/ds";

type RowMatch = Pick<Match, "id" | "status" | "best_of" | "team1_id" | "team2_id" | "team1_score" | "team2_score" | "winner_id" | "server_state" | "under_review"> & {
  team1: Pick<Team, "name" | "tag" | "logo_url"> | null;
  team2: Pick<Team, "name" | "tag" | "logo_url"> | null;
};

/**
 * Строка матча F16 DS: команда — счёт / VS — команда, под ними контекст, справа статус.
 * Для списков матчей, «Моей игры», команды и турнира. highlight — id «своей» команды (выделяется).
 */
export function MatchListRow({ m, meta, highlight }: { m: RowMatch; meta?: string; highlight?: string | null }) {
  const played = m.status === "live" || m.status === "finished";
  const winner = m.winner_id ? (m.winner_id === m.team1_id ? 1 : 2) : null;
  const side = (t: RowMatch["team1"], id: string | null, right?: boolean) => (
    <span className={cn("flex min-w-0 items-center gap-2.5", right && "flex-row-reverse text-right")}>
      <TeamLogo src={t?.logo_url} tag={t?.tag ?? "TBD"} size="xs" />
      <span className={cn("truncate text-[14px]", highlight && id === highlight ? "font-semibold text-fg" : "text-fg-2")}>{t?.name ?? "TBD"}</span>
    </span>
  );
  return (
    <Link href={`/matches/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-hover)] hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          {side(m.team1, m.team1_id)}
          {played ? <Score a={m.team1_score} b={m.team2_score} winner={m.status === "finished" ? winner : null} size="sm" /> : <span className="text-micro font-semibold text-fg-3">VS</span>}
          {side(m.team2, m.team2_id, true)}
        </div>
        {meta && <div className="mt-1 truncate text-center text-micro text-fg-3">{meta}</div>}
      </div>
      <Status info={matchStatus(m.status, m.server_state === "ready", m.under_review)} size="sm" className="hidden sm:inline-flex" />
    </Link>
  );
}
