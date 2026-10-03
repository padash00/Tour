import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { Container, Score, Status, TeamLogo, cn, matchStatus } from "@/components/ds";

/**
 * Компактная шапка Match Room. Это контекст матча, а не marketing hero:
 * турнир → команды/счёт → стадия/BO/время → статус.
 */
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
  const info = matchStatus(m.status, m.server_state === "ready", m.under_review);
  const meta = [
    stage,
    `BO${m.best_of}`,
    m.is_walkover && finished ? "техническая победа" : null,
    m.scheduled_at && !finished && !live ? formatDateTime(m.scheduled_at) : null,
  ].filter(Boolean) as string[];

  return (
    <section className="relative overflow-hidden border-b border-line-subtle">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Image src="/home/tournament.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[60%_35%] opacity-[0.13]" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/95 to-bg/80" />
        {live && <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_50%_55%,rgba(255,91,100,0.08),transparent_70%)]" />}
      </div>

      <Container width="wide" className="relative pb-7 pt-5 sm:pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/tournaments/${m.tournament.slug}?tab=bracket`} className="inline-flex min-h-10 items-center gap-2 text-meta text-fg-3 hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden />
            {m.tournament.name}
          </Link>
          <div className="flex items-center gap-2">
            <Status info={info} size="sm" />
            {adminHref && (
              <Link href={adminHref} className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-meta text-fg-3 hover:bg-white/[0.05] hover:text-fg">
                <Settings className="size-3.5" aria-hidden />
                Control
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-meta text-fg-3">
          {meta.map((item, i) => (
            <span key={item} className="inline-flex items-center gap-3">
              {i > 0 && <span className="text-fg-4" aria-hidden>·</span>}
              {item}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8 lg:gap-12">
          <TeamSide team={m.team1} align="left" winner={finished && m.winner_id === m.team1_id} dim={finished && !!m.winner_id && m.winner_id !== m.team1_id} />

          <div className="min-w-[74px] text-center sm:min-w-[120px]">
            {finished || live ? (
              <Score
                a={m.team1_score}
                b={m.team2_score}
                winner={finished ? (m.winner_id === m.team1_id ? 1 : m.winner_id === m.team2_id ? 2 : null) : null}
                size="lg"
                className={live ? "text-live" : undefined}
              />
            ) : (
              <span className="text-title font-semibold tracking-[0.16em] text-fg-3">VS</span>
            )}
            {current && live && (
              <div className="mt-2 text-micro text-fg-3">
                {mapName(current.map_name)} · <span className="num text-fg-2">{current.team1_score}:{current.team2_score}</span>
              </div>
            )}
          </div>

          <TeamSide team={m.team2} align="right" winner={finished && m.winner_id === m.team2_id} dim={finished && !!m.winner_id && m.winner_id !== m.team2_id} />
        </div>
      </Container>
    </section>
  );
}

function TeamSide({ team, align, winner, dim }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 sm:gap-4", align === "right" && "flex-row-reverse text-right")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size="lg" /> : <span className="size-14 shrink-0 rounded-surface border border-dashed border-line bg-surface-2" />}
      <div className="min-w-0">
        {team ? (
          <Link
            href={`/teams/${encodeURIComponent(team.tag)}`}
            className={cn("block truncate text-[16px] font-semibold text-fg hover:text-accent sm:text-title", dim && "text-fg-3")}
          >
            {team.name}
          </Link>
        ) : (
          <div className="text-[16px] font-semibold text-fg-3 sm:text-title">TBD</div>
        )}
        {winner && <div className="mt-1 text-micro font-semibold uppercase tracking-[0.12em] text-ok">Победитель</div>}
      </div>
    </div>
  );
}
