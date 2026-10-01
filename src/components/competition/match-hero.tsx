import Image from "next/image";
import Link from "next/link";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { Eyebrow, WRAP } from "../public/home";
import { MatchStatusBadge } from "../match-bits";
import { Pill, TeamLogo, cn } from "../ui";

/** Шапка матча в стиле утверждённой главной: фото события, команды, крупный счёт серии */
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
  const meta = [
    stage,
    `BO${m.best_of}`,
    m.is_walkover && finished ? "техническая победа" : null,
    m.scheduled_at && !finished && !live ? formatDateTime(m.scheduled_at) : null,
  ].filter(Boolean) as string[];

  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div className="pointer-events-none absolute inset-0">
        <Image src="/home/tournament.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[60%_35%] opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/80 to-bg" />
      </div>
      <div className={cn(WRAP, "relative pt-10 pb-14 lg:pb-20")}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href={`/tournaments/${m.tournament.slug}?tab=bracket`} className="text-fg-2 hover:text-fg">
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

        <Eyebrow className="mt-12 lg:mt-16 text-center">{meta.join("  ·  ")}</Eyebrow>

        <div className="mt-10 lg:mt-12 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-10 lg:gap-16">
          <TeamSide team={m.team1} align="left" winner={finished && m.winner_id === m.team1_id} dim={finished && m.winner_id !== m.team1_id} />
          <div className="text-center">
            {finished || live ? (
              <div className="num text-[48px] sm:text-[80px] lg:text-[112px] font-semibold tracking-[-0.04em] leading-none">
                <span className={cn(finished && m.winner_id !== m.team1_id && "text-fg-3")}>{m.team1_score}</span>
                <span className="text-fg-3/50 mx-2 sm:mx-5">:</span>
                <span className={cn(finished && m.winner_id !== m.team2_id && "text-fg-3")}>{m.team2_score}</span>
              </div>
            ) : (
              <div className="text-2xl sm:text-4xl font-semibold text-fg-3 tracking-[0.2em]">VS</div>
            )}
            {current && live && (
              <div className="mt-4 inline-flex items-center gap-2 text-[14px] lg:text-[16px] text-fg-2">
                <span className="size-1.5 rounded-full bg-danger animate-pulse" />
                {mapName(current.map_name)} · <span className="num">{current.team1_score}:{current.team2_score}</span>
              </div>
            )}
          </div>
          <TeamSide team={m.team2} align="right" winner={finished && m.winner_id === m.team2_id} dim={finished && m.winner_id !== m.team2_id} />
        </div>
      </div>
    </section>
  );
}

function TeamSide({ team, align, winner, dim }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean }) {
  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-3 sm:gap-6 min-w-0", align === "right" && "sm:flex-row-reverse")}>
      {team ? (
        <TeamLogo src={team.logo_url} tag={team.tag} size={96} />
      ) : (
        <div className="size-16 sm:size-24 rounded-xl bg-white/[0.04]" />
      )}
      <div className={cn("min-w-0 text-center", align === "right" ? "sm:text-right" : "sm:text-left")}>
        {team ? (
          <Link
            href={`/teams/${team.tag}`}
            className={cn(
              "block text-base sm:text-[30px] lg:text-[40px] font-semibold tracking-[-0.015em] leading-tight truncate hover:text-accent-strong",
              dim && "text-fg-3",
            )}
          >
            {team.name}
          </Link>
        ) : (
          <div className="text-base sm:text-[30px] lg:text-[40px] font-semibold text-fg-3">TBD</div>
        )}
        {winner && <Eyebrow className="mt-2 text-accent">Победитель</Eyebrow>}
      </div>
    </div>
  );
}
