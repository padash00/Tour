import { formatDate, formatDateTime } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { cn } from "@/components/ds";
import { getT } from "@/lib/i18n/server";
import { makeT, type T } from "@/lib/i18n/core";

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
export function nextStepText(t: Tournament, tx: T = makeT("ru")) {
  switch (t.status) {
    case "draft":
      return tx("Турнир ещё не опубликован.");
    case "registration":
      return t.registration_closes_at ? tx("Регистрация открыта до {date}.", { date: formatDateTime(t.registration_closes_at, tx.lang) }) : tx("Регистрация открыта.");
    case "registration_closed":
      return t.checkin_opens_at ? tx("Регистрация закрыта. Check-in откроется {date}.", { date: formatDateTime(t.checkin_opens_at, tx.lang) }) : tx("Регистрация закрыта. Ждём check-in.");
    case "checkin":
      return t.checkin_closes_at ? tx("Идёт check-in — до {date}.", { date: formatDateTime(t.checkin_closes_at, tx.lang) }) : tx("Идёт check-in.");
    case "live":
      return tx("Турнир идёт — следите за сеткой и матчами.");
    case "finished":
      return tx("Турнир завершён. Итоги — в сетке и статистике.");
    case "cancelled":
      return tx("Турнир отменён.");
  }
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}

export async function TournamentLifecycle({
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
  const tx = await getT();
  const idx = stageIndex(t.status);
  if (idx === -2) return null;
  const solo = t.format === "1v1";
  const regRange = t.registration_opens_at || t.registration_closes_at ? `${formatDate(t.registration_opens_at, tx.lang)} — ${formatDate(t.registration_closes_at, tx.lang)}` : tx("даты уточняются");
  const steps = [
    {
      label: tx("Регистрация"),
      done:
        approvedCount != null
          ? (solo
              ? tx.plural(approvedCount, "{n} участник допущен", "{n} участника допущено", "{n} участников допущено")
              : tx.plural(approvedCount, "{n} команда допущена", "{n} команды допущены", "{n} команд допущены")
            ).replace("{n}", String(approvedCount))
          : regRange,
      now: t.registration_closes_at ? tx("до {date}", { date: formatDateTime(t.registration_closes_at, tx.lang) }) : tx("открыта"),
      next: regRange,
    },
    {
      label: "Check-in",
      done: tx("пройден"),
      now: t.checkin_closes_at ? tx("до {date}", { date: formatDateTime(t.checkin_closes_at, tx.lang) }) : tx("идёт сейчас"),
      next: t.checkin_opens_at ? formatDateTime(t.checkin_opens_at, tx.lang) : tx("перед стартом"),
    },
    {
      label: t.status === "live" ? tx("Игры идут") : tx("Игры"),
      done: tx("сыграны"),
      now: total ? tx("сыграно {a} из {b} матчей", { a: played ?? 0, b: total }) : tx("идут сейчас"),
      next: t.starts_at ? tx("начало {date}", { date: formatDateTime(t.starts_at, tx.lang) }) : tx("после check-in"),
    },
    { label: tx("Финал"), done: tx("сыгран"), now: tx("идёт сейчас"), next: tx("в конце турнира") },
  ];
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label={tx("Этапы турнира")}>
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
              {done && <span className="sr-only">{tx("пройдено")}</span>}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[15.5px] font-bold", done || now ? "text-fg" : "text-fg-2")}>
                {s.label}
                {now && <span className="sr-only"> — {tx("сейчас")}</span>}
              </span>
              <span className="block truncate text-meta text-fg-3">{done ? s.done : now ? s.now : s.next}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
