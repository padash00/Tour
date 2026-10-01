import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { tournamentStatusLabel } from "@/lib/format";
import type { MatchStatus, TournamentStatus } from "@/lib/types";
import { cn } from "../ui";

/*
 * Примитивы публичной части F16 Arena — язык утверждённой главной.
 * Единственное место, где описаны сетка, надписи разрядкой, кнопки, карточки, шапки страниц и статусы.
 */

// ───────────────────────── сетка

/** Общая сетка страниц: 1440 по центру, поля как на главной */
export const WRAP = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-16";

export function Wrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(WRAP, className)}>{children}</div>;
}

/** Тонкий разделитель */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-white/[0.06]", className)} />;
}

// ───────────────────────── типографика

/** Надпись разрядкой — «БЛИЖАЙШИЙ ТУРНИР» */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] sm:text-[12px] lg:text-[14px] font-medium uppercase tracking-[0.34em] text-[#7f93b0]", className)}>
      {children}
    </div>
  );
}

/** Заголовок раздела: надпись разрядкой и ссылка/действие справа */
export function SectionHead({
  title,
  children,
  action,
  className,
}: {
  title?: ReactNode;
  /** то же, что title — для записи <SectionHead>Текст</SectionHead> */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 lg:mb-6 flex items-end justify-between gap-4", className)}>
      <Eyebrow>{title ?? children}</Eyebrow>
      {action}
    </div>
  );
}

/** Ссылка-действие в заголовке раздела: «Все матчи →» */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[6px] text-[13px] lg:text-[14px] text-fg-3 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {children} →
    </Link>
  );
}

// ───────────────────────── кнопки

/*
 * Система кнопок: варианты primary / secondary / outline / ghost / danger,
 * размеры sm 36 · md 44 · lg 52 (60 на десктопе — как на главной) · xl 60.
 */
export type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type BtnSize = "sm" | "md" | "lg" | "xl";

const BTN_BASE =
  "relative inline-flex items-center justify-center font-semibold whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.985] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong active:bg-accent-pressed shadow-[0_1px_0_0_#ffffff40_inset]",
  secondary: "border border-white/[0.14] bg-white/[0.03] text-fg hover:border-white/[0.26] hover:bg-white/[0.06]",
  outline: "border border-white/25 text-fg hover:border-white/45 hover:bg-white/[0.03]",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.05]",
  danger: "border border-danger/40 bg-danger/[0.08] text-danger hover:border-danger/60 hover:bg-danger/[0.14]",
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-9 gap-1.5 rounded-[7px] px-3.5 text-[13px]",
  md: "h-11 gap-2 rounded-[8px] px-5 text-[14px]",
  // крупная — как на главной
  lg: "h-[52px] gap-3 rounded-[8px] px-8 text-[15px] lg:h-[60px] lg:text-[17px]",
  xl: "h-[60px] gap-3 rounded-[9px] px-9 text-[17px]",
};

/** Классы кнопки — для <button>, <a> и форм */
export function btnClass(variant: BtnVariant = "primary", size: BtnSize = "lg", extra?: string) {
  return cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra);
}

function BtnSpinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-[spin_.7s_linear_infinite]" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Универсальная кнопка: с href — ссылка, без — <button>.
 * iconLeft / iconRight — иконки по краям, loading — индикатор вместо левой иконки.
 */
export function Button({
  href,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  loading,
  className,
  children,
  ...rest
}: {
  href?: string;
  variant?: BtnVariant;
  size?: BtnSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentProps<"button">, "className" | "children">) {
  const inner = (
    <>
      {loading ? <BtnSpinner /> : iconLeft}
      {children}
      {iconRight}
    </>
  );
  const cls = btnClass(variant, size, className);
  if (href) {
    return (
      <Link href={href} className={cls} aria-disabled={rest.disabled || loading || undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={cls}>
      {inner}
    </button>
  );
}

export function PrimaryBtn({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={btnClass("primary", "lg", cn("min-w-[230px] lg:min-w-[300px]", className))}>
      {children}
    </Link>
  );
}

export function OutlineBtn({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={btnClass("outline", "lg", cn("min-w-[200px] lg:min-w-[250px]", className))}>
      {children}
    </Link>
  );
}

export function GhostBtn({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={btnClass("ghost", "md", className)}>
      {children}
    </Link>
  );
}

// ───────────────────────── карточки

/** Карточка как на главной («Как это работает», «Ближайший турнир») */
export const CARD = "rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80";

/** Карточка-ссылка: мягкая реакция на наведение */
export const CARD_LINK =
  "transition-[border-color,background-color] duration-200 hover:border-white/[0.16] hover:bg-[#0d1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function cardClass(extra?: string, interactive?: boolean) {
  return cn(CARD, interactive && CARD_LINK, extra);
}

/** Честное пустое состояние в карточке */
export function EmptyCard({
  title,
  text,
  action,
  dashed,
  className,
}: {
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border px-7 py-8 lg:px-10 lg:py-10",
        dashed ? "border-dashed border-white/[0.12] bg-white/[0.012]" : "border-white/[0.08] bg-[#0b1420]/80",
        className,
      )}
    >
      <div className="text-[16px] lg:text-[18px] font-semibold text-fg">{title}</div>
      {text && <p className="mt-2 max-w-xl text-[14px] lg:text-[16px] leading-relaxed text-fg-3">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ───────────────────────── шапка страницы

/**
 * Шапка внутренней страницы: тёмный холодный свет, надпись разрядкой, крупный заголовок.
 * media — логотип/аватар слева от заголовка; aside/actions — блок справа.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  description,
  media,
  aside,
  actions,
  children,
  compact,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** синоним lead */
  description?: ReactNode;
  media?: ReactNode;
  aside?: ReactNode;
  /** синоним aside — кнопки справа */
  actions?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const text = lead ?? description;
  const right = aside ?? (actions ? <div className="flex flex-wrap gap-4">{actions}</div> : null);
  return (
    <section className={cn("relative overflow-hidden", className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_0%,#1a2c48b3,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_380px_at_0%_100%,#0f1b2c80,transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
      </div>
      <div className={cn(WRAP, "relative", compact ? "pt-12 pb-12 lg:pt-16 lg:pb-14" : "pt-14 pb-14 lg:pt-20 lg:pb-16")}>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-8 sm:flex-row sm:items-end">
            {media && <div className="shrink-0 self-start sm:self-end">{media}</div>}
            <div className="min-w-0">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              <h1
                className={cn(
                  "break-words font-semibold leading-[1.03] tracking-[-0.015em] text-fg",
                  !!eyebrow && "mt-5",
                  compact ? "text-[36px] sm:text-[48px] lg:text-[58px]" : "text-[40px] sm:text-[56px] lg:text-[68px]",
                )}
              >
                {title}
              </h1>
              {text && <div className="mt-5 max-w-[680px] text-[16px] leading-[1.6] text-fg-2 lg:text-[18px]">{text}</div>}
            </div>
          </div>
          {right}
        </div>
        {children}
      </div>
    </section>
  );
}

// ───────────────────────── цифры

/** Крупная цифра без рамки */
export function HeroNumber({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: string }) {
  return (
    <div>
      <div className={cn("num text-[30px] font-semibold leading-none tracking-[-0.02em] lg:text-[40px]", tone ?? "text-fg")}>{value}</div>
      <div className="mt-2.5 text-[12px] uppercase tracking-[0.2em] text-fg-3 lg:text-[13px]">{label}</div>
    </div>
  );
}

/** Факт с подписью — дата, место, формат */
export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.2em] text-fg-3">{label}</div>
      <div className="mt-2 text-[16px] text-fg lg:text-[18px]">{value}</div>
      {sub && <div className="mt-1 text-[13px] text-fg-3">{sub}</div>}
    </div>
  );
}

// ───────────────────────── поиск

/** Поиск по списку (GET-форма) */
export function SearchField({ name = "q", defaultValue, placeholder }: { name?: string; defaultValue?: string; placeholder: string }) {
  return (
    <form className="w-full sm:w-[380px]" role="search">
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-12 w-full rounded-[8px] border border-white/[0.1] bg-[#09111b] px-4 text-[15px] text-fg outline-none transition-colors duration-150 placeholder:text-fg-3 hover:border-white/[0.18] focus:border-accent"
      />
    </form>
  );
}

// ───────────────────────── статусы

type Tone = "ok" | "warn" | "live" | "accent" | "muted" | "danger";

const TONE: Record<Tone, string> = {
  ok: "text-ok border-ok/40 bg-ok/[0.08]",
  warn: "text-warn border-warn/40 bg-warn/[0.08]",
  live: "text-danger border-danger/40 bg-danger/[0.08]",
  danger: "text-danger border-danger/40 bg-danger/[0.08]",
  accent: "text-accent border-accent/40 bg-accent/[0.08]",
  muted: "text-fg-2 border-white/15 bg-white/[0.03]",
};

/** Статус как на карточке главной: рамка, точка, подпись */
export function StatusChip({ tone = "muted", children, size = "md" }: { tone?: Tone; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-[6px] border",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px] lg:h-10 lg:px-4 lg:text-[15px]",
        TONE[tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", tone === "live" && "animate-pulse")} />
      {children}
    </span>
  );
}

export const tournamentTone: Record<TournamentStatus, Tone> = {
  draft: "muted",
  registration: "ok",
  registration_closed: "muted",
  checkin: "warn",
  live: "live",
  finished: "muted",
  cancelled: "danger",
};

export function TournamentStatusChip({ status, size }: { status: TournamentStatus; size?: "sm" | "md" }) {
  return (
    <StatusChip tone={tournamentTone[status]} size={size}>
      {status === "live" ? "Live" : tournamentStatusLabel[status]}
    </StatusChip>
  );
}

const matchTone: Record<MatchStatus, Tone> = {
  pending: "muted",
  upcoming: "muted",
  veto: "warn",
  ready: "accent",
  live: "live",
  finished: "muted",
  cancelled: "muted",
};

export const matchStatusLabel: Record<MatchStatus, string> = {
  pending: "Ожидает",
  upcoming: "Скоро",
  veto: "Вето",
  ready: "Сервер готов",
  live: "Live",
  finished: "Завершён",
  cancelled: "Отменён",
};

export function MatchStatusChip({ status, size = "sm" }: { status: MatchStatus; size?: "sm" | "md" }) {
  return (
    <StatusChip tone={matchTone[status]} size={size}>
      {matchStatusLabel[status]}
    </StatusChip>
  );
}

// ───────────────────────── поля ввода

/** Классы поля: .field из globals.css (44px, фокус — акцентная рамка) */
export function fieldClass(extra?: string) {
  return cn("field", extra);
}

/** Подпись над полем, подсказка и ошибка под ним */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.2em] text-fg-3">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] leading-snug text-fg-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={fieldClass(className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={fieldClass(className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={fieldClass(cn("resize-y", className))} />;
}

// ───────────────────────── мелочи

/** Клавиша: <Kbd>Esc</Kbd> */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Подсказка при наведении/фокусе — без JS */
export function Tooltip({ text, children, side = "top" }: { text: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-[7px] border border-white/[0.1] bg-surface-4 px-2.5 py-1.5",
          "text-[12px] leading-snug text-fg opacity-0 shadow-[var(--shadow-pop)] transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {text}
      </span>
    </span>
  );
}

/** Скелетон загрузки */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** Размеры аватаров и логотипов — единая шкала */
export const AVATAR_SIZE = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96, hero: 128 } as const;

// ───────────────────────── сфокусированный сценарий (регистрация, check-in)

export function Flow({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_-10%,#16253d80,transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-[860px] px-5 pb-6 sm:px-8">{children}</div>
    </div>
  );
}

export function FlowHeader({ back, title, description }: { back?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="pt-12 pb-10 lg:pt-16">
      {back && <div className="mb-8 text-[14px] text-fg-2">{back}</div>}
      <Eyebrow>Турнир F16 Arena</Eyebrow>
      <h1 className="mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-[44px] lg:text-[52px]">{title}</h1>
      {description && <p className="mt-5 text-[16px] leading-[1.6] text-fg-2 lg:text-[18px]">{description}</p>}
    </div>
  );
}

export function Step({
  n,
  title,
  done,
  muted,
  children,
}: {
  n: number;
  title: ReactNode;
  done?: boolean;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={cn(CARD, "mb-4 p-7 transition-opacity duration-200 lg:p-9", muted && "opacity-45", done && "border-ok/25")}>
      <div className="flex items-baseline gap-5">
        <span className={cn("num text-[13px] lg:text-[15px]", done ? "text-ok" : "text-fg-3")}>{done ? "✓" : String(n).padStart(2, "0")}</span>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] lg:text-[24px]">{title}</h2>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
