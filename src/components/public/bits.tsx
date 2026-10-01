import Link from "next/link";
import { bracketLabel, formatDate, formatDateTime, formatTime, tournamentStatusLabel } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import type { MatchWithTeams } from "@/lib/matches";
import type { MatchStatus, Tournament, TournamentStatus } from "@/lib/types";
import { F16Mark } from "../site-header";
import { ButtonLink, IconArrow, Meta, Pill, TeamLogo, cn } from "../ui";

// ───────────────────────── статусы

const tStatusTone: Record<TournamentStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "live"> = {
  draft: "neutral",
  registration: "ok",
  registration_closed: "neutral",
  checkin: "warn",
  live: "live",
  finished: "neutral",
  cancelled: "danger",
};

export function TStatus({ status }: { status: TournamentStatus }) {
  return <Pill tone={tStatusTone[status]}>{status === "live" ? "Live" : tournamentStatusLabel[status]}</Pill>;
}

const mStatusTone: Record<MatchStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "live"> = {
  pending: "neutral",
  upcoming: "neutral",
  veto: "warn",
  ready: "accent",
  live: "live",
  finished: "neutral",
  cancelled: "neutral",
};

const mStatusLabel: Record<MatchStatus, string> = {
  pending: "Ожидает",
  upcoming: "Скоро",
  veto: "Вето",
  ready: "Сервер готов",
  live: "Live",
  finished: "Завершён",
  cancelled: "Отменён",
};

export function MStatus({ status }: { status: MatchStatus }) {
  return <Pill tone={mStatusTone[status]}>{mStatusLabel[status]}</Pill>;
}

// ───────────────────────── факты турнира

export function tournamentFacts(t: Tournament, approved?: number) {
  const mode = modeOf(t.format);
  return [
    t.game,
    mode.size === 5 ? "5v5" : mode.size === 2 ? "2v2" : "1v1",
    bracketLabel[t.bracket_type] ?? t.bracket_type,
    approved !== undefined ? `${approved} / ${t.max_teams} ${mode.size === 1 ? "игроков" : "команд"}` : `${t.max_teams} ${mode.size === 1 ? "игроков" : "команд"}`,
    t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"),
  ];
}

/** Сдержанная фирменная композиция — вместо стоковых картинок, когда у турнира нет обложки */
export function BrandVisual({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-bg-2", className)} aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(600px_380px_at_70%_30%,#14233b,transparent_70%)]" />
      <F16Mark className="absolute -right-[12%] -bottom-[18%] w-[95%] h-auto text-white/[0.045]" />
      <F16Mark className="absolute right-[18%] top-[22%] w-[16%] h-auto text-white/[0.12]" />
      <div className="absolute left-0 right-0 bottom-0 h-1/2 bg-gradient-to-t from-bg/80 to-transparent" />
    </div>
  );
}

export function CoverImage({ url, className }: { url: string | null; className?: string }) {
  if (!url) return <BrandVisual className={className} />;
  return (
    <div className={cn("relative overflow-hidden bg-bg-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.8]" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/70 via-bg/10 to-transparent" />
    </div>
  );
}

/** Главная секция текущего турнира: одна, крупная, без карточки-коробки */
export function CurrentTournament({ t, approved }: { t: Tournament; approved: number }) {
  const mode = modeOf(t.format);
  const cta =
    t.status === "registration"
      ? { href: `/tournaments/${t.slug}/register`, label: mode.size === 1 ? "Зарегистрироваться" : "Зарегистрировать команду" }
      : t.status === "checkin"
        ? { href: `/tournaments/${t.slug}/checkin`, label: "Пройти check-in" }
        : t.status === "live"
          ? { href: `/tournaments/${t.slug}?tab=bracket`, label: "Смотреть сетку" }
          : null;
  const prize = t.prize_pool && !/^\s*0+\s*$/.test(t.prize_pool) ? t.prize_pool : null;
  const facts: { label: string; value: string }[] = [
    { label: mode.size === 1 ? "Участники" : "Команды", value: `${approved} / ${t.max_teams}` },
    { label: "Режим", value: mode.size === 5 ? "5×5" : mode.size === 2 ? "2×2" : "1×1" },
    { label: "Формат", value: bracketLabel[t.bracket_type] ?? t.bracket_type },
    { label: "Старт", value: formatDate(t.starts_at) },
    ...(prize ? [{ label: "Призовой фонд", value: prize }] : []),
    ...(t.status === "registration" && t.registration_closes_at
      ? [{ label: "Регистрация до", value: formatDateTime(t.registration_closes_at) }]
      : []),
  ];

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-10 lg:gap-16 items-stretch">
      <div className="flex flex-col">
        <TStatus status={t.status} />
        <h2 className="mt-5 text-[40px] sm:text-[56px] font-bold tracking-[-0.04em] leading-[0.98]">{t.name}</h2>
        <Meta className="mt-5 text-[15px]" items={[t.game, t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн")]} />
        {t.description && <p className="mt-6 max-w-xl text-fg-2 leading-relaxed line-clamp-3">{t.description}</p>}
        <div className="mt-10 lg:mt-auto lg:pt-10 flex flex-wrap gap-3">
          {cta && (
            <ButtonLink href={cta.href} size="lg">
              {cta.label}
            </ButtonLink>
          )}
          <ButtonLink href={`/tournaments/${t.slug}`} variant={cta ? "secondary" : "primary"} size="lg">
            Подробнее
            <IconArrow />
          </ButtonLink>
        </div>
      </div>

      {t.cover_url ? (
        <div className="flex flex-col gap-4">
          <CoverImage url={t.cover_url} className="min-h-[240px] lg:min-h-[300px] rounded-[16px]" />
          <FactsGrid facts={facts} />
        </div>
      ) : (
        <FactsGrid facts={facts} />
      )}
    </div>
  );
}

function FactsGrid({ facts }: { facts: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 rounded-[16px] border border-line bg-surface overflow-hidden self-start w-full">
      {facts.map((f, i) => (
        <div
          key={f.label}
          className={cn(
            "px-6 py-5",
            i % 2 === 1 && "border-l border-line",
            i >= 2 && "border-t border-line",
          )}
        >
          <dt className="text-[13px] text-fg-3">{f.label}</dt>
          <dd className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] truncate">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Строка турнира в списке — без карточки */
export function TournamentLine({ t, approved }: { t: Tournament; approved: number }) {
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group grid gap-4 py-6 border-b border-white/[0.06] sm:grid-cols-[120px_1fr_auto] sm:items-center"
    >
      <CoverImage url={t.cover_url} className="hidden sm:block h-[76px] w-[120px] rounded-lg" />
      <div className="min-w-0">
        <TStatus status={t.status} />
        <div className="mt-1.5 text-xl font-semibold tracking-[-0.02em] truncate group-hover:text-accent transition-colors">
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
      className="group grid grid-cols-[1fr_auto_1fr] sm:grid-cols-[140px_1fr_auto_1fr_120px] items-center gap-4 py-4 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
    >
      <div className="hidden sm:block min-w-0">
        <MStatus status={m.status} />
      </div>
      <div className="flex items-center justify-end gap-3 min-w-0">
        <span className={cn("truncate font-medium text-right", lost(m.team1_id) && "text-fg-3")}>{m.team1?.name ?? "TBD"}</span>
        {m.team1 ? <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={28} /> : <span className="size-7" />}
      </div>
      <div className="w-[72px] text-center">
        {scored ? (
          <span className="num text-lg font-semibold">
            {m.team1_score}
            <span className="text-fg-3 mx-1">:</span>
            {m.team2_score}
          </span>
        ) : (
          <span className="text-[13px] text-fg-3">{m.scheduled_at ? formatTime(m.scheduled_at) : "vs"}</span>
        )}
      </div>
      <div className="flex items-center gap-3 min-w-0">
        {m.team2 ? <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={28} /> : <span className="size-7" />}
        <span className={cn("truncate font-medium", lost(m.team2_id) && "text-fg-3")}>{m.team2?.name ?? "TBD"}</span>
      </div>
      <div className="hidden sm:block text-right text-[12px] text-fg-3 truncate">
        {showTournament && m.tournament ? m.tournament.name : `BO${m.best_of}`}
      </div>
    </Link>
  );
}
