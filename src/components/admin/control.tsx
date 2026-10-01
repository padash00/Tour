import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * F16 Control — плотные операционные примитивы админки.
 * Те же токены, что и публичный сайт, но мельче шрифт и больше данных на экране.
 */

export function AdminHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-6 border-b border-line">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-[12px] text-fg-3 hover:text-fg">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <div className={cn("text-[12px] text-fg-3", back && "mt-2")}>{eyebrow}</div>}
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em] leading-tight">{title}</h1>
        {description && <div className="mt-1.5 text-[13px] text-fg-3">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Блок рабочей области: маленький заголовок, без коробки по умолчанию */
export function Panel({
  title,
  action,
  children,
  className,
  boxed,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  boxed?: boolean;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h2 className="text-[13px] font-semibold text-fg-2">{title}</h2>}
          {action}
        </div>
      )}
      {boxed ? <div className="rounded-xl border border-line bg-surface">{children}</div> : children}
    </section>
  );
}

/** Таблица в рамке: прокрутка по горизонтали на узких экранах */
export function TableBox({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-x-auto">
      <table className="tbl tbl-dense" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

type DotTone = "ok" | "warn" | "danger" | "accent" | "muted";
const dotColor: Record<DotTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  accent: "bg-accent",
  muted: "bg-fg-3/60",
};

export function Dot({ tone, pulse }: { tone: DotTone; pulse?: boolean }) {
  return <span className={cn("inline-block size-1.5 rounded-full shrink-0", dotColor[tone], pulse && "animate-pulse")} />;
}

/** Строка-сигнал: что требует внимания оператора */
export function AlertRow({ tone, title, children }: { tone: "danger" | "warn" | "accent"; title: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 border-l-2 bg-white/[0.02] rounded-r-lg text-[13px]",
        tone === "danger" ? "border-danger" : tone === "warn" ? "border-warn" : "border-accent",
      )}
    >
      <span className={cn("font-semibold", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-accent")}>
        {title}
      </span>
      <span className="text-fg-2">{children}</span>
    </div>
  );
}

/** Значение в сводке: подпись + число/текст */
export function Metric({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: DotTone; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-fg-3">{label}</div>
      <div
        className={cn(
          "mt-1 text-[20px] font-semibold tracking-[-0.02em] num",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-fg-3 truncate">{hint}</div>}
    </div>
  );
}

/** Внутренние вкладки страницы (через ?tab=) */
export function SubTabs({ items, active }: { items: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <div className="flex gap-5 border-b border-line overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cn(
            "relative h-10 inline-flex items-center text-[13px] font-medium whitespace-nowrap transition-colors",
            t.key === active ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          {t.key === active && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
        </Link>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-line">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-7 w-56" />
      </div>
      <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="skeleton h-8" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
