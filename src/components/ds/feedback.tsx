import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/*
 * Обратная связь F16 DS.
 *   EmptyState — отвечает на три вопроса: что здесь будет, почему пусто, что сделать (и когда «дальше»)
 *   Skeleton   — загрузка содержимого (не полноэкранный спиннер)
 *   Callout    — сообщение В КОНТЕКСТЕ: ошибка сервера — в блоке сервера, проблема состава — у состава
 *   Steps      — процесс из шагов (регистрация, путь матча): ✓ пройдено · ● сейчас · ○ впереди
 */

export function EmptyState({
  icon,
  title,
  text,
  action,
  next,
  compact,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** почему пусто */
  text?: ReactNode;
  /** что можно сделать */
  action?: ReactNode;
  /** что будет дальше: «Сетка — 10 октября, 11:00» */
  next?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start rounded-surface border border-dashed border-line", compact ? "gap-2 p-5" : "gap-3 p-8 sm:p-10", className)}>
      {icon && <span className="mb-1 grid size-10 place-items-center rounded-control bg-white/[0.04] text-fg-3 [&>svg]:size-5">{icon}</span>}
      <h3 className="text-title text-fg">{title}</h3>
      {text && <p className="max-w-read text-[14px] leading-relaxed text-fg-2">{text}</p>}
      {next && (
        <p className="text-meta text-fg-3">
          Дальше: <span className="text-fg-2">{next}</span>
        </p>
      )}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-control", className)} />;
}

/** Строки-скелетоны списка */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line-subtle overflow-hidden rounded-surface border border-line-subtle" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

type CalloutTone = "info" | "ok" | "warn" | "danger";
const CALLOUT: Record<CalloutTone, { cls: string; icon: ReactNode }> = {
  info: { cls: "border-line bg-white/[0.03] text-fg-2 [&_[data-ic]]:text-accent", icon: <Info /> },
  ok: { cls: "border-ok/30 bg-ok-dim text-fg-2 [&_[data-ic]]:text-ok", icon: <Check /> },
  warn: { cls: "border-warn/30 bg-warn-dim text-fg-2 [&_[data-ic]]:text-warn", icon: <TriangleAlert /> },
  danger: { cls: "border-danger/35 bg-danger-dim text-fg-2 [&_[data-ic]]:text-danger", icon: <CircleAlert /> },
};

/** Сообщение в контексте блока. title — суть, children — пояснение, action — что сделать */
export function Callout({ tone = "info", title, children, action, className }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = CALLOUT[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-control border px-4 py-3 text-[14px] leading-relaxed", t.cls, className)}>
      <span data-ic className="mt-0.5 shrink-0 [&>svg]:size-4">
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-fg">{title}</div>}
        {children && <div className={cn(!!title && "mt-0.5")}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export type StepState = "done" | "current" | "todo" | "error";

/** Процесс по шагам: вертикально (регистрация) или горизонтально (путь матча) */
export function Steps({ steps, direction = "vertical", className }: { steps: { title: ReactNode; meta?: ReactNode; state: StepState }[]; direction?: "vertical" | "horizontal"; className?: string }) {
  const dot = (s: StepState, i: number) => (
    <span
      className={cn(
        "num grid size-7 shrink-0 place-items-center rounded-full border text-micro font-semibold",
        s === "done" && "border-ok/40 bg-ok-dim text-ok",
        s === "current" && "border-accent bg-accent text-accent-ink",
        s === "todo" && "border-line text-fg-3",
        s === "error" && "border-danger/50 bg-danger-dim text-danger",
      )}
      aria-hidden
    >
      {s === "done" ? <Check className="size-3.5" /> : s === "error" ? "!" : String(i + 1).padStart(2, "0")}
    </span>
  );
  const label = (s: StepState) => ({ done: "пройдено", current: "сейчас", todo: "впереди", error: "ошибка" })[s];
  if (direction === "horizontal") {
    return (
      <ol className={cn("flex items-start", className)}>
        {steps.map((s, i) => (
          <li key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center" aria-current={s.state === "current" ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : steps[i - 1].state === "done" ? "bg-ok/40" : "bg-line")} />
              {dot(s.state, i)}
              <span className={cn("h-px flex-1", i === steps.length - 1 ? "bg-transparent" : s.state === "done" ? "bg-ok/40" : "bg-line")} />
            </div>
            <span className={cn("px-1 text-meta", s.state === "current" ? "font-medium text-fg" : "text-fg-3")}>
              {s.title}
              <span className="sr-only"> — {label(s.state)}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn("flex flex-col", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3" aria-current={s.state === "current" ? "step" : undefined}>
          <div className="flex flex-col items-center">
            {dot(s.state, i)}
            {i < steps.length - 1 && <span className={cn("my-1 w-px flex-1 min-h-5", s.state === "done" ? "bg-ok/40" : "bg-line")} />}
          </div>
          <div className="pb-5 pt-0.5">
            <div className={cn("text-[14px]", s.state === "current" ? "font-semibold text-fg" : s.state === "todo" ? "text-fg-3" : "text-fg-2")}>
              {s.title}
              <span className="sr-only"> — {label(s.state)}</span>
            </div>
            {s.meta && <div className="mt-0.5 text-meta text-fg-3">{s.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
