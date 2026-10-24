import type { ReactNode } from "react";
import { cn } from "@/components/ds";

/*
 * Таблицы данных публичной части — уровень профессиональной статистики:
 * закреплённая шапка, заголовки разрядкой, моноширинные числа справа, тихие строки.
 */

/** Карточка-контейнер таблицы. sticky — своя прокрутка, чтобы шапка оставалась на месте */
export function tableBox(sticky?: boolean, extra?: string) {
  return cn("rounded-surface border border-line-subtle bg-surface", sticky ? "max-h-[min(78vh,960px)] overflow-auto overscroll-contain touch-pan-x" : "overflow-x-auto overscroll-x-contain touch-pan-x", extra);
}

/** Классы таблицы: строки 56 px, шапка закреплена при прокрутке контейнера */
export const DATA_TABLE = cn(
  "w-full border-collapse text-[15px]",
  "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:h-12 [&_th]:whitespace-nowrap [&_th]:bg-surface [&_th]:px-3 sm:[&_th]:px-5",
  "[&_th]:text-left [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-fg-3",
  "[&_th]:shadow-[inset_0_-1px_0_var(--color-line-subtle)]",
  "[&_td]:h-14 [&_td]:px-3 sm:[&_td]:px-5 [&_td]:text-fg-2 [&_td]:border-b [&_td]:border-line-subtle",
  "[&_tbody_tr]:transition-colors [&_tbody_tr]:duration-150 [&_tbody_tr:hover]:bg-surface-2",
  "[&_tbody_tr:last-child_td]:border-b-0",
);

/** Числовая ячейка: моноширинные цифры, выравнивание вправо */
export const NUM_CELL = "num text-right tabular-nums";

/** Заголовок колонки, по которой отсортировано */
export function SortedHead({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-2" title={title}>
      {children}
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Место в таблице: первые три — медали (золото, серебро, бронза) */
export function RankBadge({ n }: { n: number }) {
  if (n > 3) return <span className="num inline-grid size-8 place-items-center text-[14px] font-semibold text-fg-3">{n}</span>;
  return (
    <span
      className={cn(
        "num inline-grid size-8 place-items-center rounded-full text-[14px] font-extrabold",
        n === 1 ? "bg-gold/20 text-gold" : n === 2 ? "bg-silver/20 text-silver" : "bg-bronze/20 text-bronze",
      )}
      aria-label={`${n} место`}
    >
      {n}
    </span>
  );
}

/** Рейтинг с тонкой шкалой под числом: 1.00 — середина */
export function RatingBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(4, Math.min(100, (value / 1.6) * 100));
  return (
    <span className="ml-auto block h-[3px] w-14 overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
      <span className={cn("block h-full rounded-full bg-current opacity-70", className)} style={{ width: `${pct}%` }} />
    </span>
  );
}
