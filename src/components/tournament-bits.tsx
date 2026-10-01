import Link from "next/link";
import { bracketLabel, formatDate, formatDateTime, tournamentStatusLabel } from "@/lib/format";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { ButtonLink, IconArrow, Meta, Pill } from "./ui";

const statusTone: Record<TournamentStatus, "neutral" | "accent" | "ok" | "warn" | "danger" | "live"> = {
  draft: "neutral",
  registration: "ok",
  registration_closed: "neutral",
  checkin: "warn",
  live: "live",
  finished: "neutral",
  cancelled: "danger",
};

export function TournamentStatusPill({ status }: { status: TournamentStatus }) {
  return (
    <Pill tone={statusTone[status]} dot>
      {status === "live" ? "Live" : tournamentStatusLabel[status]}
    </Pill>
  );
}

/** Сдержанная графика вместо стоковых картинок: план карты тонкими линиями */
export function MapGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} fill="none" aria-hidden>
      <g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1">
        <path d="M40 60h110v60H90v70H40z" />
        <path d="M180 40h90v40h40v90h-60v-40h-70z" />
        <path d="M210 200h120v60H210z" />
        <path d="M60 220h100v40H60z" />
        <path d="M300 60h60v60h-60z" />
      </g>
      <g stroke="#8ab8ff" strokeOpacity="0.18" strokeWidth="1.2" strokeDasharray="3 6">
        <path d="M95 150 C 140 150, 160 120, 210 120 S 280 150, 320 220" />
      </g>
    </svg>
  );
}

export function tournamentFacts(t: Tournament, approved?: number) {
  return [
    t.game,
    t.format,
    bracketLabel[t.bracket_type] ?? t.bracket_type,
    t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"),
    approved !== undefined ? `${approved} / ${t.max_teams} команд` : null,
  ];
}

/** Главный турнир: одна большая открытая секция, а не карточка */
export function FeaturedTournament({ t, approved }: { t: Tournament; approved: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface">
      {t.cover_url && <TournamentCover url={t.cover_url} strong />}
      <div className="relative grid lg:grid-cols-[1.4fr_1fr] gap-10 p-6 sm:p-12">
        <div>
          <TournamentStatusPill status={t.status} />
          <h3 className="mt-5 text-[36px] sm:text-[52px] font-bold tracking-[-0.04em] leading-[0.98]">{t.name}</h3>
          <Meta className="mt-5" items={[formatDate(t.starts_at), ...tournamentFacts(t)]} />
          {t.description && <p className="mt-6 max-w-lg text-fg-2 leading-relaxed line-clamp-3">{t.description}</p>}
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {t.status === "registration" ? (
              <ButtonLink href={`/tournaments/${t.slug}/register`} size="lg">
                Зарегистрировать команду
              </ButtonLink>
            ) : t.status === "checkin" ? (
              <ButtonLink href={`/tournaments/${t.slug}/checkin`} size="lg">
                Пройти check-in
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/tournaments/${t.slug}`} variant="ghost" size="lg">
              Подробнее
              <IconArrow />
            </ButtonLink>
          </div>
        </div>
        <dl className="self-end grid grid-cols-2 gap-x-8 gap-y-6">
          <div className="col-span-2">
            <dt className="label">Призовой фонд</dt>
            <dd className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em]">{t.prize_pool ?? "Будет объявлен"}</dd>
          </div>
          <div>
            <dt className="label">Команды</dt>
            <dd className="mt-1 num text-lg">
              {approved}
              <span className="text-fg-3"> / {t.max_teams}</span>
            </dd>
          </div>
          <div>
            <dt className="label">Регистрация</dt>
            <dd className="mt-1 text-[15px]">
              {t.status === "registration" && t.registration_closes_at
                ? `до ${formatDateTime(t.registration_closes_at)}`
                : t.status === "registration"
                  ? "Открыта"
                  : "Закрыта"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Строка турнира в списке */
export function TournamentRow({ t, approved }: { t: Tournament; approved: number }) {
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group grid gap-4 py-6 border-b border-white/[0.06] sm:grid-cols-[1fr_auto] sm:items-center hover:bg-white/[0.015] transition-colors"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <TournamentStatusPill status={t.status} />
          <span className="text-sm text-fg-3">{formatDate(t.starts_at)}</span>
        </div>
        <div className="mt-2 text-xl font-semibold tracking-[-0.02em] truncate group-hover:text-accent-strong transition-colors">
          {t.name}
        </div>
        <Meta className="mt-2 text-fg-3" items={tournamentFacts(t, approved)} />
      </div>
      <div className="flex items-center gap-6">
        {t.prize_pool && <div className="text-right font-semibold">{t.prize_pool}</div>}
        <IconArrow className="size-4 text-fg-3 group-hover:text-fg transition-colors" />
      </div>
    </Link>
  );
}

/** Обложка турнира с затемнением под текст; без обложки — ничего лишнего */
export function TournamentCover({ url, className = "", strong }: { url: string | null; className?: string; strong?: boolean }) {
  if (!url) return null;
  return (
    <div className={`absolute inset-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.7]" />
      <div
        className={
          strong
            ? "absolute inset-0 bg-gradient-to-r from-bg via-bg/90 to-bg/50"
            : "absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/30"
        }
      />
    </div>
  );
}
