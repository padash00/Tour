import { formatDate, formatDateTime } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { cn } from "@/components/ds";

/*
 * Жизненный цикл турнира (статус турнира, не участника): Регистрация → Check-in → Сетка → Финал.
 * Текущий этап подсвечен, под каждым — даты из базы.
 */

function stageIndex(status: Tournament["status"]) {
  switch (status) {
    case "draft":
      return -1;
    case "registration":
      return 0;
    case "registration_closed":
      return 0.5; // регистрация закрыта, check-in ещё не открыт
    case "checkin":
      return 1;
    case "live":
      return 2;
    case "finished":
      return 4;
    case "cancelled":
      return -2;
  }
}

/** Что делать дальше — одна короткая фраза по этапу */
export function nextStepText(t: Tournament) {
  switch (t.status) {
    case "draft":
      return "Турнир ещё не опубликован.";
    case "registration":
      return t.registration_closes_at ? `Регистрация открыта до ${formatDateTime(t.registration_closes_at)}.` : "Регистрация открыта.";
    case "registration_closed":
      return t.checkin_opens_at ? `Регистрация закрыта. Check-in откроется ${formatDateTime(t.checkin_opens_at)}.` : "Регистрация закрыта. Ждём check-in.";
    case "checkin":
      return t.checkin_closes_at ? `Идёт check-in — до ${formatDateTime(t.checkin_closes_at)}.` : "Идёт check-in.";
    case "live":
      return "Турнир идёт — следите за сеткой и матчами.";
    case "finished":
      return "Турнир завершён. Итоги — в сетке и статистике.";
    case "cancelled":
      return "Турнир отменён.";
  }
}

export function TournamentLifecycle({ t }: { t: Tournament }) {
  const idx = stageIndex(t.status);
  if (idx === -2) return null;
  const steps = [
    {
      label: "Регистрация",
      date: t.registration_opens_at || t.registration_closes_at ? `${formatDate(t.registration_opens_at)} — ${formatDate(t.registration_closes_at)}` : "даты уточняются",
    },
    { label: "Check-in", date: t.checkin_opens_at ? formatDateTime(t.checkin_opens_at) : "перед стартом" },
    { label: "Сетка", date: t.starts_at ? formatDateTime(t.starts_at) : "после check-in" },
    { label: "Финал", date: t.status === "finished" ? "сыгран" : "в конце турнира" },
  ];
  return (
    <ol className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4" aria-label="Этапы турнира">
      {steps.map((s, i) => {
        const done = i < idx;
        const now = i === Math.floor(idx) && idx % 1 === 0 && t.status !== "finished";
        const live = now && t.status === "live";
        return (
          <li key={s.label} aria-current={now ? "step" : undefined} className="min-w-0">
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div className={cn("h-full rounded-full", done ? "w-full bg-accent/60" : now ? (live ? "w-1/2 animate-pulse bg-live" : "w-1/2 animate-pulse bg-accent") : "w-0")} />
            </div>
            <div className={cn("mt-2.5 flex items-center gap-2 text-meta font-medium", now ? (live ? "text-live" : "text-fg") : done ? "text-fg-2" : "text-fg-3")}>
              <span className="num text-micro text-fg-4">0{i + 1}</span>
              {s.label}
              {now && <span className="sr-only">— сейчас</span>}
            </div>
            <div className={cn("mt-0.5 truncate text-micro", now ? "text-fg-2" : "text-fg-3")}>{s.date}</div>
          </li>
        );
      })}
    </ol>
  );
}
