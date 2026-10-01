import type { MatchStatus } from "@/lib/types";
import { cn } from "../ui";

/*
 * Путь матча: Расписание → Вето → Сервер → Live → Итог.
 * Видно, на каком этапе матч и что будет дальше.
 */

const STEPS = [
  { key: "schedule", label: "Расписание" },
  { key: "veto", label: "Вето" },
  { key: "server", label: "Сервер" },
  { key: "live", label: "Live" },
  { key: "done", label: "Итог" },
] as const;

function stepIndex(status: MatchStatus) {
  switch (status) {
    case "pending":
    case "upcoming":
      return 0;
    case "veto":
      return 1;
    case "ready":
      return 2;
    case "live":
      return 3;
    case "finished":
    case "cancelled":
      return 4;
  }
}

export function MatchProgress({ status, singleMap }: { status: MatchStatus; singleMap?: boolean }) {
  const current = stepIndex(status);
  const steps = singleMap ? STEPS.filter((s) => s.key !== "veto") : STEPS;
  const idx = singleMap && current >= 1 ? current - 1 : current;
  if (status === "cancelled") return null;
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Этапы матча">
      {steps.map((s, i) => {
        const done = i < idx || status === "finished";
        const now = i === idx && status !== "finished";
        return (
          <li key={s.key} className="min-w-0" aria-current={now ? "step" : undefined}>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color] duration-500",
                  done ? "w-full bg-accent/70" : now ? "w-1/2 bg-accent animate-pulse" : "w-0",
                  now && s.key === "live" && "bg-live",
                )}
              />
            </div>
            <div
              className={cn(
                "mt-2.5 truncate text-[10px] font-medium uppercase tracking-[0.08em] sm:text-[12px] sm:tracking-[0.2em]",
                now ? (s.key === "live" ? "text-live" : "text-fg") : done ? "text-fg-2" : "text-fg-4",
              )}
            >
              {s.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
