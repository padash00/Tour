import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { SectionTitle } from "./heading";

/*
 * Поверхности F16 DS: OBJECTS ≠ SECTIONS.
 *   Container       — ширина страницы: product 1360 · wide 1500 (матч, сетка, лобби, статистика) · read 740
 *   Region          — область страницы на своём фоне (bg-section) во всю ширину — отделяет крупные части
 *   Section         — раздел: заголовок + отступ + содержимое, БЕЗ рамки и фона. Между разделами 48–64
 *   Panel           — объект: матч, команда, сервер, уведомление. Рамка + surface
 *   InteractivePanel — объект-ссылка: наведение поднимает фон, а не саму карточку
 *   RowList / DataRow — список строк с разделителями (вместо стопки карточек)
 *   FeatureSurface  — главный объект экрана: состояние матча, сервер готов
 *   CriticalSurface — требует действия сейчас: ваш ход, check-in, сервер готов, ошибка
 *   Facts           — метаданные «подпись — значение» сеткой, без карточки на каждое значение
 * Вопрос для каждой рамки: «почему это карточка?» Если не объект — это Section.
 */

export function Container({ children, width = "product", className }: { children: ReactNode; width?: "product" | "wide" | "read"; className?: string }) {
  const max = { product: "max-w-product", wide: "max-w-wide", read: "max-w-read" }[width];
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", max, className)}>{children}</div>;
}

export function Region({ children, tone = "section", className }: { children: ReactNode; tone?: "section" | "shell"; className?: string }) {
  return (
    <div className={cn(tone === "section" ? "bg-section" : "bg-shell", "border-y border-line-subtle py-12 lg:py-16", className)}>{children}</div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      {title && (
        <SectionTitle description={description} action={action}>
          {title}
        </SectionTitle>
      )}
      {children}
    </section>
  );
}

/** Вертикальный ритм между разделами страницы: 48 на телефоне, 64 на десктопе */
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-12 lg:gap-16", className)}>{children}</div>;
}

export function Panel({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn("rounded-surface border border-line-subtle bg-surface", padded && "p-4 sm:p-5", className)}>{children}</div>;
}

export function InteractivePanel({ href, children, className, padded = true }: { href: string; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-surface border border-line-subtle bg-surface transition-[background-color,border-color] duration-[var(--dur-hover)] ease-out",
        "hover:border-line-strong hover:bg-surface-2 focus-visible:border-accent/60",
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Список строк: рамка одна на весь список, строки разделены линией */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-line-subtle overflow-hidden rounded-surface border border-line-subtle bg-surface", className)}>{children}</div>;
}

/** Строка данных. С href — вся строка ссылка; leading — аватар / логотип / иконка; trailing — статус / действие */
export function DataRow({
  leading,
  title,
  meta,
  trailing,
  href,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg">{title}</div>
        {meta && <div className="mt-0.5 truncate text-meta text-fg-3">{meta}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
    </>
  );
  const cls = cn("flex min-h-14 items-center gap-3 px-4 py-2.5", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors duration-[var(--dur-hover)] hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function FeatureSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-feature border border-line bg-surface p-5 sm:p-7", className)}>{children}</div>;
}

export type Tone = "accent" | "ok" | "warn" | "danger" | "live";

const CRITICAL: Record<Tone, string> = {
  accent: "border-accent/35 bg-accent-dim before:bg-accent",
  ok: "border-ok/35 bg-ok-dim before:bg-ok",
  warn: "border-warn/35 bg-warn-dim before:bg-warn",
  danger: "border-danger/40 bg-danger-dim before:bg-danger",
  live: "border-live/40 bg-danger-dim before:bg-live",
};

/** Требует внимания сейчас: тонированный фон + полоса слева. Не для украшения — только по смыслу */
export function CriticalSurface({ tone = "accent", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "relative overflow-hidden rounded-surface border p-4 pl-5 sm:p-5 sm:pl-6",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        CRITICAL[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Метаданные сеткой: «Начало — 10 октября, 11:00». Без карточки на каждое значение */
export function Facts({ items, columns = 3, className }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 2 | 3 | 4; className?: string }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-5", cols, className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-meta text-fg-3">{it.label}</dt>
          <dd className="mt-1 text-[15px] font-medium text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Тонкий разделитель внутри раздела */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line-subtle", className)} />;
}
