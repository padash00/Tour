import type { MatchStatus, RegistrationStatus, TournamentStatus } from "@/lib/types";
import { cn } from "./cn";

/*
 * Статусы F16 DS — одна система для турнира, матча, заявки и лобби.
 * Статус = подпись + точка/тон. Цвет никогда не единственный носитель смысла: подпись есть всегда.
 * Пульсирует только то, что идёт прямо сейчас (LIVE, ваш ход).
 *   neutral — нейтральное / прошедшее · accent — открыто, можно действовать · ok — готово, одобрено
 *   warn — ждёт, скоро, требует внимания · danger — отказ, ошибка · live — идёт игра
 */
export type StatusTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "live";
export type StatusInfo = { label: string; tone: StatusTone; pulse?: boolean };

const TONE: Record<StatusTone, string> = {
  neutral: "text-fg-2 bg-white/[0.05] border-line",
  accent: "text-accent bg-accent-dim border-accent/30",
  ok: "text-ok bg-ok-dim border-ok/30",
  warn: "text-warn bg-warn-dim border-warn/30",
  danger: "text-danger bg-danger-dim border-danger/30",
  live: "text-live bg-danger-dim border-live/35",
};

export function Status({ info, size = "md", className }: { info: StatusInfo; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border font-medium",
        size === "sm" ? "h-6 px-2 text-micro" : "h-7 px-2.5 text-meta",
        TONE[info.tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", info.pulse && "animate-pulse")} aria-hidden />
      {info.label}
    </span>
  );
}

export const tournamentStatus: Record<TournamentStatus, StatusInfo> = {
  draft: { label: "Черновик", tone: "neutral" },
  registration: { label: "Регистрация открыта", tone: "accent" },
  registration_closed: { label: "Регистрация закрыта", tone: "warn" },
  checkin: { label: "Check-in", tone: "warn", pulse: true },
  live: { label: "LIVE", tone: "live", pulse: true },
  finished: { label: "Завершён", tone: "neutral" },
  cancelled: { label: "Отменён", tone: "danger" },
};

/** Матч: «готов» без сервера — ждёт сервер, с сервером — «Сервер готов» */
export function matchStatus(status: MatchStatus, serverReady?: boolean, underReview?: boolean): StatusInfo {
  if (underReview && status === "finished") return { label: "На проверке", tone: "warn" };
  switch (status) {
    case "pending":
      return { label: "Ждёт соперника", tone: "neutral" };
    case "upcoming":
      return { label: "Скоро", tone: "neutral" };
    case "veto":
      return { label: "Вето", tone: "accent", pulse: true };
    case "ready":
      return serverReady ? { label: "Сервер готов", tone: "ok", pulse: true } : { label: "Готовим сервер", tone: "warn" };
    case "live":
      return { label: "LIVE", tone: "live", pulse: true };
    case "finished":
      return { label: "Завершён", tone: "neutral" };
    case "cancelled":
      return { label: "Отменён", tone: "danger" };
  }
}

export const registrationStatus: Record<RegistrationStatus, StatusInfo> = {
  pending: { label: "На рассмотрении", tone: "warn" },
  approved: { label: "Одобрена", tone: "ok" },
  rejected: { label: "Отклонена", tone: "danger" },
  withdrawn: { label: "Отозвана", tone: "neutral" },
};

export type LobbyPhase = "waiting" | "ready_check" | "draft" | "veto" | "server" | "live" | "finished" | "closed";

export const lobbyStatus: Record<LobbyPhase, StatusInfo> = {
  waiting: { label: "Набор игроков", tone: "accent" },
  ready_check: { label: "Проверка готовности", tone: "warn", pulse: true },
  draft: { label: "Драфт", tone: "accent", pulse: true },
  veto: { label: "Вето", tone: "accent", pulse: true },
  server: { label: "Сервер", tone: "warn" },
  live: { label: "LIVE", tone: "live", pulse: true },
  finished: { label: "Матч окончен", tone: "neutral" },
  closed: { label: "Закрыто", tone: "neutral" },
};
