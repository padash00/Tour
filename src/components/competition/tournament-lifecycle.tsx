import { formatDate, formatDateTime } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { cn } from "@/components/ds";

/*
 * Жизненный цикл турнира (статус турнира, не участника): Регистрация → Check-in → Игры → Финал.
 * Четыре карточки: пройденные — с галочкой, текущий этап — в зелёной рамке, под каждым — что это значит сейчас.
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 100;
  const b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many;
};

export function TournamentLifecycle({
  t,
  approvedCount,
  played,
  total,
}: {
  t: Tournament;
  /** допущенные команды — подпись под пройденной регистрацией */
  approvedCount?: number;
  /** сыграно / всего матчей — подпись под этапом игр */
  played?: number;
  total?: number;
}) {
  const idx = stageIndex(t.status);
  if (idx === -2) return null;
  const solo = t.format === "1v1";
  const regRange = t.registration_opens_at || t.registration_closes_at ? `${formatDate(t.registration_opens_at)} — ${formatDate(t.registration_closes_at)}` : "даты уточняются";
  const steps = [
    {
      label: "Регистрация",
      done: approvedCount != null ? `${approvedCount} ${solo ? plural(approvedCount, "участник", "участника", "участников") : plural(approvedCount, "команда", "команды", "команд")} ${solo ? "допущено" : "допущены"}` : regRange,
      now: t.registration_closes_at ? `до ${formatDateTime(t.registration_closes_at)}` : "открыта",
      next: regRange,
    },
    {
      label: "Check-in",
      done: "пройден",
      now: t.checkin_closes_at ? `до ${formatDateTime(t.checkin_closes_at)}` : "идёт сейчас",
      next: t.checkin_opens_at ? formatDateTime(t.checkin_opens_at) : "перед стартом",
    },
    {
      label: t.status === "live" ? "Игры идут" : "Игры",
      done: "сыграны",
      now: total ? `сыграно ${played ?? 0} из ${total} матчей` : "идут сейчас",
      next: t.starts_at ? `начало ${formatDateTime(t.starts_at)}` : "после check-in",
    },
    { label: "Финал", done: "сыгран", now: "идёт сейчас", next: "в конце турнира" },
  ];
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Этапы турнира">
      {steps.map((s, i) => {
        const done = i < idx;
        const now = i === Math.floor(idx) && idx % 1 === 0 && t.status !== "finished";
        return (
          <li
            key={s.label}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-surface border bg-surface px-4 py-3.5",
              now ? "border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]" : "border-line-subtle",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-extrabold",
                done ? "bg-accent-dim text-accent" : now ? "bg-accent text-accent-ink" : "bg-ink/[0.06] text-fg-3",
              )}
            >
              {done ? <CheckIcon /> : i + 1}
              {done && <span className="sr-only">пройдено</span>}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[15.5px] font-bold", done || now ? "text-fg" : "text-fg-2")}>
                {s.label}
                {now && <span className="sr-only"> — сейчас</span>}
              </span>
              <span className="block truncate text-meta text-fg-3">{done ? s.done : now ? s.now : s.next}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
