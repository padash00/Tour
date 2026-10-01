import Link from "next/link";
import { bracketLabel, formatDate, formatDateTime, tournamentStatusLabel } from "@/lib/format";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { ButtonLink, IconArrow, Pill } from "./ui";

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
    <Pill tone={statusTone[status]} dot={status === "registration" || status === "checkin"}>
      {status === "live" ? "Live" : tournamentStatusLabel[status]}
    </Pill>
  );
}

/** Абстрактная «карта» — сдержанная графика вместо стоковых картинок */
export function MapGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} fill="none" aria-hidden>
      <defs>
        <radialGradient id="mg-glow" cx="62%" cy="40%" r="60%">
          <stop offset="0" stopColor="#8bb8ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#8bb8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mg-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8bb8ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7fc4d8" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#mg-glow)" />
      <g stroke="#2a3850" strokeWidth="1">
        <path d="M40 60h110v60H90v70H40z" />
        <path d="M180 40h90v40h40v90h-60v-40h-70z" />
        <path d="M210 200h120v60H210z" />
        <path d="M60 220h100v40H60z" />
        <path d="M300 60h60v60h-60z" />
      </g>
      <g stroke="url(#mg-line)" strokeWidth="1.4" strokeDasharray="4 6">
        <path d="M95 150 C 140 150, 160 120, 210 120 S 280 150, 320 220" />
        <path d="M110 240 C 170 230, 190 200, 250 180" />
      </g>
      <g>
        <circle cx="250" cy="120" r="34" stroke="#8bb8ff" strokeOpacity="0.25" />
        <circle cx="250" cy="120" r="58" stroke="#8bb8ff" strokeOpacity="0.12" />
        <circle cx="250" cy="120" r="3" fill="#8bb8ff" />
        <path d="M250 98v10M250 132v10M228 120h10M262 120h10" stroke="#8bb8ff" strokeOpacity="0.8" strokeLinecap="round" />
      </g>
      <g fill="#a7b2c3" fillOpacity="0.55" fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="1.5">
        <text x="46" y="76">A SITE</text>
        <text x="216" y="216">B SITE</text>
        <text x="186" y="56">MID</text>
      </g>
    </svg>
  );
}

export function FeaturedTournament({ t, approved }: { t: Tournament; approved: number }) {
  const facts = [
    { label: "Игра", value: t.game },
    { label: "Формат", value: t.format },
    { label: "Сетка", value: bracketLabel[t.bracket_type] ?? t.bracket_type },
    { label: "Дата", value: formatDate(t.starts_at) },
    { label: "Площадка", value: t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн") },
    { label: "Команды", value: `${approved} / ${t.max_teams}` },
  ];

  return (
    <div className="card relative overflow-hidden">
      <div className="absolute inset-0 atmos opacity-60" />
      {t.cover_url ? (
        <TournamentCover url={t.cover_url} strong />
      ) : (
        <MapGraphic className="absolute -right-10 -top-6 w-[520px] opacity-40 hidden lg:block" />
      )}
      <div className="relative grid lg:grid-cols-[1.3fr_1fr] gap-10 p-6 sm:p-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TournamentStatusPill status={t.status} />
            {t.registration_closes_at && t.status === "registration" && (
              <span className="text-xs text-fg-3">до {formatDateTime(t.registration_closes_at)}</span>
            )}
          </div>
          <h3 className="mt-5 text-3xl sm:text-[40px] font-bold tracking-[-0.03em] leading-[1.05]">{t.name}</h3>
          {t.description && (
            <p className="mt-4 max-w-lg text-fg-2 leading-relaxed line-clamp-3">{t.description}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={`/tournaments/${t.slug}`} variant="secondary" size="lg">
              Подробнее о турнире
            </ButtonLink>
            {t.status === "registration" && (
              <ButtonLink href={`/tournaments/${t.slug}/register`} size="lg">
                Зарегистрировать команду
                <IconArrow />
              </ButtonLink>
            )}
            {t.status === "checkin" && (
              <ButtonLink href={`/tournaments/${t.slug}/checkin`} size="lg">
                Пройти check-in
                <IconArrow />
              </ButtonLink>
            )}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6">
          <div className="rounded-xl border border-line bg-bg/60 backdrop-blur p-5">
            <div className="label">Призовой фонд</div>
            <div className="mt-2 text-3xl font-bold tracking-tight">{t.prize_pool ?? "Будет объявлен"}</div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-x-6 gap-y-5">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="label">{f.label}</dt>
                <dd className="mt-1.5 text-[15px] font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export function TournamentRow({ t, approved }: { t: Tournament; approved: number }) {
  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="card card-hover group grid gap-5 p-5 sm:grid-cols-[96px_1fr_auto] sm:items-center"
    >
      <div className="relative hidden sm:block h-[72px] w-24 overflow-hidden rounded-lg border border-line bg-bg-2">
        {t.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MapGraphic className="absolute inset-0 h-full w-full opacity-70" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TournamentStatusPill status={t.status} />
          <span className="text-xs text-fg-3">
            {t.game} · {t.format} · {bracketLabel[t.bracket_type] ?? t.bracket_type}
          </span>
        </div>
        <div className="mt-2 text-lg font-semibold tracking-tight truncate">{t.name}</div>
        <div className="mt-1 text-sm text-fg-3">
          {formatDate(t.starts_at)} · {t.is_lan ? "LAN" : "Онлайн"}
          {t.location ? ` · ${t.location}` : ""} · {approved}/{t.max_teams} команд
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="label">Призовой</div>
          <div className="mt-1 font-semibold">{t.prize_pool ?? "—"}</div>
        </div>
        <span className="grid place-items-center size-9 rounded-lg border border-line text-fg-3 group-hover:text-fg group-hover:border-line-strong transition">
          <IconArrow />
        </span>
      </div>
    </Link>
  );
}

/** Обложка турнира с затемнением под текст; без обложки — сдержанная графика */
export function TournamentCover({ url, className = "", strong }: { url: string | null; className?: string; strong?: boolean }) {
  if (!url) return <MapGraphic className={className} />;
  return (
    <div className={`absolute inset-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div
        className={
          strong
            ? "absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/40"
            : "absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/20"
        }
      />
    </div>
  );
}
