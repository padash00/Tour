import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * F16 Control — плотные операционные примитивы админки.
 * Язык публичного сайта (подписи разрядкой, карточки #0b1420, акцент #8AB8FF),
 * но мельче шрифт и больше данных на экране.
 */

/** Карточка админки — как на публичном сайте */
export const ADMIN_CARD = "rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80";

/** Заголовки колонок таблиц: капс с разрядкой, как подписи сайта */
export const TH =
  "[&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-[0.2em] [&_th]:font-medium [&_th]:text-[#7f93b0] [&_th]:h-10";

/** Подпись раздела: капс с разрядкой, холодный серо-синий */
export function AdminLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-medium uppercase tracking-[0.28em] text-[#7f93b0]", className)}>{children}</div>
  );
}

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
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-7 border-b border-white/[0.06]">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-[12px] text-fg-3 hover:text-fg">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <AdminLabel className={cn(back && "mt-3")}>{eyebrow}</AdminLabel>}
        <h1 className="mt-2.5 text-[30px] font-semibold tracking-[-0.015em] leading-tight">{title}</h1>
        {description && <div className="mt-2 text-[13px] text-fg-3">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Блок рабочей области: подпись разрядкой, без коробки по умолчанию */
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
        <div className="flex items-center justify-between gap-3 mb-3.5">
          {title && <AdminLabel>{title}</AdminLabel>}
          {action}
        </div>
      )}
      {boxed ? <div className={ADMIN_CARD}>{children}</div> : children}
    </section>
  );
}

/** Числовая ячейка: моноширинно, по правому краю */
export const NUM = "num text-right whitespace-nowrap";

/**
 * Таблица в карточке: прокрутка по горизонтали на узких экранах.
 * maxHeight — длинные списки прокручиваются внутри, шапка закреплена.
 */
export function TableBox({ children, minWidth = 760, maxHeight }: { children: ReactNode; minWidth?: number; maxHeight?: number }) {
  return (
    <div
      className={cn(
        ADMIN_CARD,
        "overflow-x-auto",
        !!maxHeight && "overflow-y-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1] [&_thead_th]:bg-[#0b1420]",
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={`tbl tbl-dense ${TH}`} style={{ minWidth }}>
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
export function AlertRow({
  tone,
  title,
  children,
  action,
}: {
  tone: "danger" | "warn" | "accent";
  title: ReactNode;
  children: ReactNode;
  /** главная ссылка-действие справа */
  action?: { href: string; label: string };
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-[10px] border text-[13px]",
        tone === "danger"
          ? "border-danger/30 bg-danger/[0.06]"
          : tone === "warn"
            ? "border-warn/30 bg-warn/[0.06]"
            : "border-accent/30 bg-accent/[0.06]",
      )}
    >
      <span className={cn("font-semibold", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-accent")}>
        {title}
      </span>
      <span className="text-fg-2 min-w-0 flex-1">{children}</span>
      {action && (
        <Link
          href={action.href}
          className={cn(
            "ml-auto inline-flex h-8 items-center rounded-[8px] border px-3 text-[12px] font-medium whitespace-nowrap transition-colors",
            tone === "danger"
              ? "border-danger/40 text-danger hover:bg-danger/[0.1]"
              : tone === "warn"
                ? "border-warn/40 text-warn hover:bg-warn/[0.1]"
                : "border-accent/40 text-accent hover:bg-accent/[0.1]",
          )}
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/** Значение в сводке: подпись разрядкой + число/текст */
export function Metric({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: DotTone; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <AdminLabel className="text-[10px] tracking-[0.22em]">{label}</AdminLabel>
      <div
        className={cn(
          "mt-2 text-[22px] font-semibold tracking-[-0.02em] num",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent" : "text-fg",
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
    <div className="flex gap-6 border-b border-white/[0.06] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cn(
            "relative h-11 inline-flex items-center text-[13px] font-medium whitespace-nowrap transition-colors",
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
      <div className="pb-7 border-b border-white/[0.06]">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-8 w-56" />
      </div>
      <div className={cn(ADMIN_CARD, "p-3 space-y-2")}>
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
