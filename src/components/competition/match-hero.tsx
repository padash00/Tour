import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { Container, TeamLogo, cn } from "@/components/ds";
import { tr, type T } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";

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
  pending: { label: tr("Ждём соперника"), cls: "bg-white/90 text-fg-2" },
  upcoming: { label: tr("Матч назначен"), cls: "bg-white/90 text-fg-2" },
  veto: { label: tr("Выбор карт"), cls: "bg-white text-accent" },
  ready: { label: tr("Ждём сервер"), cls: "bg-white text-warn" },
  live: { label: tr("Идёт игра"), cls: "bg-white text-live" },
  finished: { label: tr("Матч окончен"), cls: "bg-white/90 text-fg" },
  cancelled: { label: tr("Матч отменён"), cls: "bg-white/90 text-danger" },
};

export async function MatchHero({
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
  const t = await getT();
  const finished = m.status === "finished";
  const live = m.status === "live";
  const map = heroMap(m);
  const liveMap = live ? m.maps.find((x) => x.status === "live") : undefined;
  const image = (map && mapImages[map.map_name]) || "/home/tournament.jpg";
  const status = m.status === "ready" && m.server_state === "ready" ? { label: tr("Сервер готов"), cls: "bg-white text-ok" } : STATUS[m.status];
  // BO1 в игре — счёт раундов текущей карты; иначе — счёт серии по картам
  const roundsMain = live && m.best_of === 1 && !!liveMap;
  const s1 = roundsMain ? liveMap.team1_score : m.team1_score;
  const s2 = roundsMain ? liveMap.team2_score : m.team2_score;
  const winner = finished ? (m.winner_id === m.team1_id ? 1 : m.winner_id === m.team2_id ? 2 : null) : null;
  const round = liveMap ? liveMap.team1_score + liveMap.team2_score + 1 : null;
  const meta = [m.best_of === 1 ? t("до 1 победы") : t("до {n} побед", { n: Math.ceil(m.best_of / 2) }), m.is_walkover && finished ? t("техническая победа") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Container width="match" className="pt-5 sm:pt-6">
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

      <section className="relative isolate overflow-hidden rounded-feature text-white" aria-label={t("Табло матча")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- картинка карты из настроек (Supabase Storage) */}
        <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        {/* по краям, где команды, темнее — названия читаются; в центре карта видна */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(18_20_23/0.92)_0%,rgb(18_20_23/0.62)_50%,rgb(18_20_23/0.92)_100%)]" aria-hidden />
        <div className={cn("absolute inset-x-0 top-0 h-1", live ? "bg-live" : "bg-[linear-gradient(90deg,var(--color-brand-from),var(--color-brand-to))]")} aria-hidden />

        <div className="px-5 pb-8 pt-6 sm:px-10 sm:pb-12 sm:pt-8 lg:px-12 lg:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="rounded-full border border-white/30 px-3 py-1 text-[13px] font-bold uppercase tracking-[0.08em] text-white">{stage}</span>
              <span className="text-[15px] font-semibold text-white/75">{meta}</span>
            </span>
            <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold", status.cls)}>
              {(live || m.status === "veto" || m.status === "ready") && <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />}
              {t(status.label)}
            </span>
          </div>

          <div className="mt-7 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:mt-10 sm:gap-8 lg:gap-12">
            <Side team={m.team1} align="left" winner={winner === 1} dim={winner === 2} t={t} />
            <div className="flex min-w-[84px] flex-col items-center text-center sm:min-w-[170px]">
              {finished || live ? (
                <div className="num flex items-baseline gap-3 text-[40px] font-extrabold leading-none sm:gap-4 sm:text-[72px]">
                  <span className={cn(winner === 2 && "text-white/55")}>{s1}</span>
                  <span className="text-white/45">:</span>
                  <span className={cn(winner === 1 && "text-white/55")}>{s2}</span>
                </div>
              ) : (
                <span className="flex items-center gap-4">
                  <span className="h-px w-10 bg-white/30 max-sm:hidden lg:w-16" aria-hidden />
                  <span className="text-[26px] font-extrabold tracking-[0.12em] text-white/85 sm:text-[38px]">VS</span>
                  <span className="h-px w-10 bg-white/30 max-sm:hidden lg:w-16" aria-hidden />
                </span>
              )}
              <span className="mt-2.5 text-[14px] font-semibold text-white/85 sm:text-[15px]">
                {liveMap
                  ? m.best_of > 1
                    ? t("{map} · раунд {n} · карты {a}:{b}", { map: mapName(liveMap.map_name), n: round, a: m.team1_score, b: m.team2_score })
                    : t("{map} · раунд {n}", { map: mapName(liveMap.map_name), n: round })
                  : map && finished && m.best_of === 1 && map.status === "finished"
                    ? `${mapName(map.map_name)} · ${map.team1_score}:${map.team2_score}`
                    : map && (finished || m.status === "ready")
                      ? mapName(map.map_name)
                      : m.scheduled_at && !finished
                        ? formatDateTime(m.scheduled_at, t.lang)
                        : null}
              </span>
            </div>
            <Side team={m.team2} align="right" winner={winner === 2} dim={winner === 1} t={t} />
          </div>
        </div>
      </section>
    </Container>
  );
}

function Side({ team, align, winner, dim, t }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean; t: T }) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-5", align === "left" ? "sm:text-left" : "sm:flex-row-reverse sm:text-right")}>
      {team ? (
        <span className={cn("rounded-[18px] bg-white/15 p-1", winner && "ring-[3px] ring-brand-from")}>
          <TeamLogo src={team.logo_url} tag={team.tag} size="lg" className="bg-white text-fg max-sm:!size-12 lg:!size-20" />
        </span>
      ) : (
        <span className="size-12 shrink-0 rounded-[16px] border border-dashed border-white/40 sm:size-16" />
      )}
      <div className="min-w-0 max-w-full">
        {team?.private_tournament_id ? (
          // пара закрытого турнира — своей страницы команды нет
          <div className={cn("block truncate text-[15px] font-extrabold text-white sm:text-[24px] lg:text-[32px] lg:leading-tight", dim && "text-white/60")}>{team.name}</div>
        ) : team ? (
          <Link
            href={`/teams/${encodeURIComponent(team.tag)}`}
            className={cn("block truncate text-[15px] font-extrabold text-white hover:underline sm:text-[24px] lg:text-[32px] lg:leading-tight", dim && "text-white/60")}
          >
            {team.name}
          </Link>
        ) : (
          <div className="text-[15px] font-bold text-white/60 sm:text-[22px]">{t("Ещё не определена")}</div>
        )}
        {team && !team.private_tournament_id && <div className={cn("mt-0.5 text-[13px] font-bold tracking-[0.14em] text-white/55 max-sm:hidden", dim && "text-white/40")}>{team.tag}</div>}
        {winner && <div className="mt-1 inline-block rounded-full bg-brand-from px-2.5 py-0.5 text-[12.5px] font-extrabold text-fg">{t("Победитель")}</div>}
      </div>
    </div>
  );
}
