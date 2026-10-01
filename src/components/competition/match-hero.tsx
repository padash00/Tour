import Link from "next/link";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { MatchStatusBadge } from "../match-bits";
import { Meta, Pill, TeamLogo, cn } from "../ui";

/** Шапка матча: команды, счёт серии, BO, текущая карта */
export function MatchHero({
  m,
  stage,
  adminHref,
}: {
  m: MatchFull;
  stage: string;
  adminHref?: string;
}) {
  const finished = m.status === "finished";
  const live = m.status === "live";
  const current = m.maps.find((x) => x.status === "live") ?? (live ? m.maps.find((x) => x.status === "pending") : undefined);

  return (
    <section className="border-b border-line">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-10 pt-8 pb-12 md:pb-14">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href={`/tournaments/${m.tournament.slug}?tab=bracket`} className="text-fg-3 hover:text-fg-2">
            ← {m.tournament.name}
          </Link>
          <div className="flex items-center gap-4">
            {m.under_review && <Pill tone="warn">На рассмотрении</Pill>}
            <MatchStatusBadge status={m.status} />
            {adminHref && (
              <Link href={adminHref} className="text-fg-3 hover:text-fg">
                Control →
              </Link>
            )}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-10">
          <TeamSide team={m.team1} align="left" winner={finished && m.winner_id === m.team1_id} dim={finished && m.winner_id !== m.team1_id} />
          <div className="text-center">
            {finished || live ? (
              <div className="num text-[44px] sm:text-[72px] font-semibold tracking-[-0.04em] leading-none">
                <span className={cn(finished && m.winner_id !== m.team1_id && "text-fg-3")}>{m.team1_score}</span>
                <span className="text-fg-3/60 mx-2 sm:mx-5">:</span>
                <span className={cn(finished && m.winner_id !== m.team2_id && "text-fg-3")}>{m.team2_score}</span>
              </div>
            ) : (
              <div className="text-xl sm:text-2xl font-semibold text-fg-3 tracking-[0.1em]">VS</div>
            )}
            {current && live && (
              <div className="mt-3 num text-sm text-fg-2">
                {mapName(current.map_name)} · {current.team1_score}:{current.team2_score}
              </div>
            )}
          </div>
          <TeamSide team={m.team2} align="right" winner={finished && m.winner_id === m.team2_id} dim={finished && m.winner_id !== m.team2_id} />
        </div>

        <Meta
          className="mt-10 justify-center text-fg-3"
          items={[
            stage,
            `BO${m.best_of}`,
            m.is_walkover && finished ? "техническая победа" : null,
            m.scheduled_at && !finished && !live ? formatDateTime(m.scheduled_at) : null,
          ]}
        />
      </div>
    </section>
  );
}

function TeamSide({ team, align, winner, dim }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean }) {
  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-3 sm:gap-5 min-w-0", align === "right" && "sm:flex-row-reverse")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size={64} /> : <div className="size-16 rounded-xl bg-white/[0.03]" />}
      <div className={cn("min-w-0 text-center", align === "right" ? "sm:text-right" : "sm:text-left")}>
        {team ? (
          <Link
            href={`/teams/${team.tag}`}
            className={cn("block text-base sm:text-[30px] font-bold tracking-[-0.03em] leading-tight truncate hover:text-accent-strong", dim && "text-fg-3")}
          >
            {team.name}
          </Link>
        ) : (
          <div className="text-base sm:text-[30px] font-bold text-fg-3">TBD</div>
        )}
        {winner && <div className="mt-1 text-[12px] font-medium text-accent">Победитель</div>}
      </div>
    </div>
  );
}
