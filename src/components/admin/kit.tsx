import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { ADMIN_CARD, AdminLabel } from "./control";

/*
 * F16 Control — композиционные блоки «пульта»: полоса статуса, секции, жизненный цикл, хронология.
 * Цвета — токены сайта; плотность выше, чем на публичных страницах.
 */

export type KitTone = "ok" | "warn" | "danger" | "accent" | "muted";

export const toneText: Record<KitTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  accent: "text-accent",
  muted: "text-fg-3",
};

export const toneBar: Record<KitTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  accent: "bg-accent",
  muted: "bg-white/15",
};

// ───────────────────────── полоса статуса

/** Верхняя полоса пульта: ячейки в одну строку, разделены тонкими линиями */
export function Strip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(ADMIN_CARD, "overflow-hidden")}>
      <div className={cn("grid divide-white/[0.06] max-lg:divide-y lg:divide-x", className)}>{children}</div>
    </div>
  );
}

export function StripCell({
  label,
  value,
  hint,
  tone,
  href,
  pulse,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: KitTone;
  href?: string;
  pulse?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {tone && <span className={cn("size-1.5 shrink-0 rounded-full", toneBar[tone], pulse && "animate-pulse")} />}
        <AdminLabel className="text-[10px] tracking-[0.22em] truncate">{label}</AdminLabel>
      </div>
      <div className={cn("mt-2.5 num text-[24px] font-semibold leading-none tracking-[-0.02em]", tone ? toneText[tone] : "text-fg")}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-fg-3 truncate">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block px-5 py-4 min-w-0 transition-colors hover:bg-white/[0.025]">
      {body}
    </Link>
  ) : (
    <div className="px-5 py-4 min-w-0">{body}</div>
  );
}

// ───────────────────────── секция

/** Секция рабочей области: подпись разрядкой, счётчик, ссылка справа */
export function Section({
  title,
  count,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-6", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <AdminLabel>
          {title}
          {count != null && <span className="ml-2 num text-fg-3 tracking-normal">{count}</span>}
        </AdminLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12px] text-fg-3 hover:text-fg transition-colors">
      {children} →
    </Link>
  );
}

/** Пустая полоса-подсказка внутри секции */
export function Quiet({ children }: { children: ReactNode }) {
  return <div className={cn(ADMIN_CARD, "px-4 py-5 text-[13px] text-fg-3")}>{children}</div>;
}

// ───────────────────────── жизненный цикл

export type LifeStep = { key: string; label: string; hint?: string; at?: string | null };

/**
 * Степпер этапов: пройденные — акцент, текущий — подсвечен, будущие — приглушены.
 * current — индекс текущего этапа; -1 — ни один (например, отменён).
 */
export function Lifecycle({ steps, current, cancelled }: { steps: LifeStep[]; current: number; cancelled?: boolean }) {
  return (
    <ol className="grid grid-flow-col auto-cols-[minmax(118px,1fr)] overflow-x-auto [scrollbar-width:none] pb-1">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative min-w-[118px] pr-2">
            {/* линия до следующего этапа */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[30px] right-0 top-[13px] h-[2px] rounded-full",
                  cancelled ? "bg-danger/25" : done ? "bg-accent/70" : "bg-white/[0.08]",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-[1] grid size-7 place-items-center rounded-full border text-[12px] font-semibold num",
                cancelled
                  ? "border-danger/40 bg-[#1a0f12] text-danger/80"
                  : done
                    ? "border-accent bg-accent text-[#07101b]"
                    : now
                      ? "border-accent bg-[#0d1a2c] text-accent ring-4 ring-accent/15"
                      : "border-line-strong bg-shell text-fg-3",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <div className={cn("mt-2.5 text-[13px] font-semibold leading-tight", now ? "text-fg" : done ? "text-fg-2" : "text-fg-3")}>
              {s.label}
            </div>
            {now && <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-accent">сейчас</div>}
            {s.hint && <div className="mt-1 text-[11px] leading-snug text-fg-3">{s.hint}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** Компактная лента прогресса для строки таблицы */
export function MiniLifecycle({ total, current, cancelled }: { total: number; current: number; cancelled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-5 rounded-full",
            cancelled ? "bg-danger/40" : i < current ? "bg-accent" : i === current ? "bg-accent/55" : "bg-white/[0.1]",
          )}
        />
      ))}
    </span>
  );
}

// ───────────────────────── хронология

export type TimelineItem = { label: string; at: string | null; state: "done" | "active" | "todo" | "error"; note?: string };

/** Горизонтальная хронология состояния (вето → сервер → готов → live → итог) */
export function Timeline({ items, format }: { items: TimelineItem[]; format: (iso: string | null) => string }) {
  return (
    <ol className="grid grid-cols-2 sm:grid-cols-5 gap-px overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.06]">
      {items.map((it) => (
        <li key={it.label} className="relative bg-surface px-4 py-3 min-w-0">
          <span
            className={cn(
              "absolute left-0 top-0 h-[2px] w-full",
              it.state === "done" ? "bg-accent" : it.state === "active" ? "bg-warn animate-pulse" : it.state === "error" ? "bg-danger" : "bg-transparent",
            )}
          />
          <div
            className={cn(
              "text-[11px] font-medium uppercase tracking-[0.18em]",
              it.state === "done" ? "text-accent" : it.state === "active" ? "text-warn" : it.state === "error" ? "text-danger" : "text-fg-3",
            )}
          >
            {it.label}
          </div>
          <div className="mt-1 num text-[13px] text-fg truncate">{it.at ? format(it.at) : it.state === "active" ? "сейчас" : "—"}</div>
          {it.note && <div className="mt-0.5 text-[11px] text-fg-3 truncate">{it.note}</div>}
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────── колонка действий

/** Группа действий в правой колонке пульта */
export function RailGroup({ title, children, tone }: { title: string; children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("p-4 space-y-2.5", tone === "danger" && "bg-danger/[0.04]")}>
      <div className={cn("text-[10px] font-medium uppercase tracking-[0.24em]", tone === "danger" ? "text-danger" : "text-[#7f93b0]")}>
        {title}
      </div>
      {children}
    </div>
  );
}

/** Сетка «подпись — значение» в одну строку с разделителями */
export function FactRow({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <div className={cn(ADMIN_CARD, "grid divide-white/[0.06] max-md:divide-y md:grid-flow-col md:auto-cols-fr md:divide-x", className)}>
      {items.map((it, i) => (
        <div key={i} className="px-4 py-3 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-3">{it.label}</div>
          <div className="mt-1 text-[13px] text-fg truncate">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Время запроса: серверный компонент рендерится один раз на запрос */
export function serverNow() {
  return Date.now();
}

export function minutesSince(iso: string | null | undefined, now: number) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : null;
}

/** Состояние инстанса CS2 по данным агента */
export const INSTANCE_STATE: Record<string, { text: string; tone: KitTone }> = {
  none: { text: "Свободен", tone: "ok" },
  pre_veto: { text: "Подготовка", tone: "accent" },
  veto: { text: "Подготовка", tone: "accent" },
  warmup: { text: "Разминка", tone: "warn" },
  knife: { text: "Нож", tone: "warn" },
  waiting_for_knife_decision: { text: "Нож", tone: "warn" },
  going_live: { text: "Старт", tone: "danger" },
  live: { text: "LIVE", tone: "danger" },
  pending_restore: { text: "Восстановление", tone: "warn" },
  post_game: { text: "Завершение", tone: "muted" },
};

export function instanceState(i: { running: boolean; role: string; gamestate: string | null }, online: boolean) {
  if (!online) return { text: "Агент офлайн", tone: "muted" as KitTone };
  if (!i.running) return i.role === "reserve" ? { text: "Резерв", tone: "muted" as KitTone } : { text: "Выключен", tone: "danger" as KitTone };
  return INSTANCE_STATE[i.gamestate ?? "none"] ?? { text: i.gamestate ?? "?", tone: "muted" as KitTone };
}
