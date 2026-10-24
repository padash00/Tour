import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { Container, TeamLogo, cn } from "@/components/ds";

/**
 * Шапка Match Room — табло: фон — картинка текущей карты, команды, крупный счёт, статус словами.
 * В BO1 во время игры главный счёт — раунды карты (счёт серии до конца карты 0:0).
 */

/** Карта, которую показывает табло: идущая → последняя сыгранная → первая по плану */
export function heroMap(m: MatchFull) {
  const byNumber = [...m.maps].sort((a, b) => a.map_number - b.map_number);
  return (
    byNumber.find((x) => x.status === "live") ??
    [...byNumber].reverse().find((x) => x.status === "finished") ??
    byNumber.find((x) => x.status === "pending") ??
    null
  );
}

const STATUS: Record<MatchFull["status"], { label: string; cls: string }> = {
  pending: { label: "Ждём соперника", cls: "bg-white/90 text-fg-2" },
  upcoming: { label: "Матч назначен", cls: "bg-white/90 text-fg-2" },
  veto: { label: "Выбор карт", cls: "bg-white text-accent" },
  ready: { label: "Ждём сервер", cls: "bg-white text-warn" },
  live: { label: "Идёт игра", cls: "bg-white text-live" },
  finished: { label: "Матч окончен", cls: "bg-white/90 text-fg" },
  cancelled: { label: "Матч отменён", cls: "bg-white/90 text-danger" },
};

export function MatchHero({
  m,
  stage,
  adminHref,
  mapImages = {},
}: {
  m: MatchFull;
  stage: string;
  adminHref?: string;
  mapImages?: Record<string, string>;
}) {
  const finished = m.status === "finished";
  const live = m.status === "live";
  const map = heroMap(m);
  const liveMap = live ? m.maps.find((x) => x.status === "live") : undefined;
  const image = (map && mapImages[map.map_name]) || "/home/tournament.jpg";
  const status = m.status === "ready" && m.server_state === "ready" ? { label: "Сервер готов", cls: "bg-white text-ok" } : STATUS[m.status];
  // BO1 в игре — счёт раундов текущей карты; иначе — счёт серии по картам
  const roundsMain = live && m.best_of === 1 && !!liveMap;
  const s1 = roundsMain ? liveMap.team1_score : m.team1_score;
  const s2 = roundsMain ? liveMap.team2_score : m.team2_score;
  const winner = finished ? (m.winner_id === m.team1_id ? 1 : m.winner_id === m.team2_id ? 2 : null) : null;
  const round = liveMap ? liveMap.team1_score + liveMap.team2_score + 1 : null;
  const meta = [stage, m.best_of === 1 ? "до 1 победы" : `до ${Math.ceil(m.best_of / 2)} побед`, m.is_walkover && finished ? "техническая победа" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Container width="wide" className="pt-5 sm:pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/tournaments/${m.tournament.slug}?tab=bracket`} className="inline-flex min-h-10 items-center gap-2 text-[15px] font-medium text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          {m.tournament.name}
        </Link>
        {adminHref && (
          <Link href={adminHref} className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-meta font-medium text-fg-2 hover:bg-ink/[0.05] hover:text-fg">
            <Settings className="size-4" aria-hidden />
            Управление матчем
          </Link>
        )}
      </div>

      <section className="relative isolate overflow-hidden rounded-feature text-white" aria-label="Табло матча">
        {/* eslint-disable-next-line @next/next/no-img-element -- картинка карты из настроек (Supabase Storage) */}
        <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-ink/75" aria-hidden />
        {live && <div className="absolute inset-x-0 top-0 h-1 bg-live" aria-hidden />}

        <div className="px-5 pb-7 pt-5 sm:px-8 sm:pb-9 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[15px] font-semibold text-white/85">{meta}</span>
            <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold", status.cls)}>
              {(live || m.status === "veto" || m.status === "ready") && <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />}
              {status.label}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8 lg:gap-12">
            <Side team={m.team1} align="left" winner={winner === 1} dim={winner === 2} />
            <div className="flex min-w-[84px] flex-col items-center text-center sm:min-w-[170px]">
              {finished || live ? (
                <div className="num flex items-baseline gap-3 text-[40px] font-extrabold leading-none sm:gap-4 sm:text-[72px]">
                  <span className={cn(winner === 2 && "text-white/55")}>{s1}</span>
                  <span className="text-white/45">:</span>
                  <span className={cn(winner === 1 && "text-white/55")}>{s2}</span>
                </div>
              ) : (
                <span className="text-[26px] font-extrabold tracking-[0.12em] text-white/80 sm:text-[34px]">VS</span>
              )}
              <span className="mt-2.5 text-[14px] font-semibold text-white/85 sm:text-[15px]">
                {liveMap
                  ? `${mapName(liveMap.map_name)} · раунд ${round}${m.best_of > 1 ? ` · карты ${m.team1_score}:${m.team2_score}` : ""}`
                  : map && finished && m.best_of === 1 && map.status === "finished"
                    ? `${mapName(map.map_name)} · ${map.team1_score}:${map.team2_score}`
                    : map && (finished || m.status === "ready")
                      ? mapName(map.map_name)
                      : m.scheduled_at && !finished
                        ? formatDateTime(m.scheduled_at)
                        : null}
              </span>
            </div>
            <Side team={m.team2} align="right" winner={winner === 2} dim={winner === 1} />
          </div>
        </div>
      </section>
    </Container>
  );
}

function Side({ team, align, winner, dim }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-4", align === "left" ? "sm:text-left" : "sm:flex-row-reverse sm:text-right")}>
      {team ? (
        <span className={cn("rounded-[18px] bg-white/15 p-1", winner && "ring-[3px] ring-brand-from")}>
          <TeamLogo src={team.logo_url} tag={team.tag} size="lg" className="bg-white text-fg max-sm:!size-12" />
        </span>
      ) : (
        <span className="size-12 shrink-0 rounded-[16px] border border-dashed border-white/40 sm:size-16" />
      )}
      <div className="min-w-0 max-w-full">
        {team ? (
          <Link
            href={`/teams/${encodeURIComponent(team.tag)}`}
            className={cn("block truncate text-[15px] font-extrabold text-white hover:underline sm:text-[24px]", dim && "text-white/60")}
          >
            {team.name}
          </Link>
        ) : (
          <div className="text-[15px] font-bold text-white/60 sm:text-[22px]">Ещё не определена</div>
        )}
        {winner && <div className="mt-1 inline-block rounded-full bg-brand-from px-2.5 py-0.5 text-[12.5px] font-extrabold text-fg">Победитель</div>}
      </div>
    </div>
  );
}
