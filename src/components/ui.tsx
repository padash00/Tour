import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ───────────────────────── buttons

/*
 * Кнопки F16 Control и служебных мест. Та же система, что в primitives (btnClass):
 * primary — акцент, secondary/outline — рамка, ghost — без фона, danger — опасное действие.
 * Размеры: sm 36 · md 44 · lg 52.
 */
type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "warm";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-[0_4px_18px_-12px_var(--color-accent)] hover:bg-accent-strong hover:shadow-[0_6px_22px_-12px_var(--color-accent)] active:bg-accent-pressed",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong",
  outline: "bg-transparent text-fg border border-line-strong hover:border-line-hover hover:bg-white/[0.03]",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.05]",
  danger: "bg-danger/[0.1] text-danger border border-danger/35 hover:bg-danger/[0.16] hover:border-danger/55",
  // знак бренда — использовать крайне редко
  warm: "bg-warm text-[#1a0d03] hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-[7px] gap-1.5",
  md: "h-11 px-4.5 text-[14px] rounded-[8px] gap-2",
  lg: "h-[52px] px-6 text-[15px] rounded-[9px] gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-semibold tracking-[-0.005em] whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

/** Индикатор загрузки внутри кнопки */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("animate-[spin_.7s_linear_infinite]", className)} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ───────────────────────── статусы

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "live";

const toneText: Record<Tone, string> = {
  neutral: "text-fg-3",
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  live: "text-danger",
};

/**
 * Статус: маленькая точка и спокойная подпись, без заливки и рамки.
 * Единая система по всей платформе: LIVE — красный, готов — синий, регистрация — зелёный,
 * ожидание — серый, предупреждение — янтарный.
 */
export function Pill({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap", toneText[tone])}>
      {(dot || tone !== "neutral") && (
        <span className={cn("size-1.5 rounded-full bg-current shrink-0", tone === "live" && "animate-pulse")} />
      )}
      {tone === "live" ? <span className="font-semibold tracking-[0.08em] uppercase text-[11px]">{children}</span> : children}
    </span>
  );
}

/** Строка фактов через точку: CS2 · 5×5 · LAN */
export function Meta({ items, className }: { items: ReactNode[]; className?: string }) {
  const list = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-fg-2", className)}>
      {list.map((x, i) => (
        <span key={i} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="size-[3px] rounded-full bg-fg-3/60" />}
          {x}
        </span>
      ))}
    </div>
  );
}

// ───────────────────────── layout

const widths = {
  public: "max-w-[1320px]",
  competition: "max-w-[1280px]",
  admin: "max-w-[1480px]",
  narrow: "max-w-[820px]",
  form: "max-w-[640px]",
};

export function Container({
  children,
  className,
  size = "public",
}: {
  children: ReactNode;
  className?: string;
  size?: keyof typeof widths;
}) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-10", widths[size], className)}>{children}</div>;
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-sm text-fg-3">{label}</span>
      <span className="text-sm text-fg text-right">{children}</span>
    </div>
  );
}

/** Честное пустое состояние: платформа новая, пустота — это нормально */
export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-start", compact ? "py-8" : "py-14")}>
      {icon && <div className="mb-4 text-fg-3/70">{icon}</div>}
      <div className={cn("font-semibold tracking-[-0.01em]", compact ? "text-base" : "text-lg")}>{title}</div>
      {description && <p className="mt-1.5 max-w-md text-sm text-fg-3 leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

// ───────────────────────── avatars

export function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-cover bg-surface-2 shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-surface-3 grid place-items-center text-fg-3 font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function TeamLogo({ src, tag, size = 48 }: { src?: string | null; tag: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="object-contain shrink-0"
      style={{ width: size, height: size, borderRadius: size > 40 ? 12 : 8 }}
    />
  ) : (
    <div
      className="bg-surface-3 grid place-items-center font-bold tracking-tight text-fg-2 shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.28), borderRadius: size > 40 ? 12 : 8 }}
    >
      {tag.slice(0, 4).toUpperCase()}
    </div>
  );
}

export function FaceitLevel({ level }: { level: number | null }) {
  if (!level) return <span className="text-fg-3">—</span>;
  const color =
    level >= 10 ? "#ff5a1f" : level >= 8 ? "#ff8a3d" : level >= 4 ? "#e3b465" : level >= 2 ? "#6cc59a" : "#a7b2c3";
  return (
    <span
      className="inline-grid place-items-center size-6 rounded-full border-2 text-[11px] font-bold num"
      style={{ borderColor: color, color }}
      title={`FACEIT Level ${level}`}
    >
      {level}
    </span>
  );
}

// ───────────────────────── tabs

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div
      role="tablist"
      className="flex gap-7 border-b border-line overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          role="tab"
          aria-selected={t.key === active}
          className={cn(
            "relative h-12 inline-flex items-center text-[15px] font-medium transition-colors duration-150 whitespace-nowrap",
            t.key === active ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          <span
            className={cn(
              "absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent transition-[opacity,transform] duration-200",
              t.key === active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50",
            )}
          />
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────── forms

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-[13px] font-medium text-fg-2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger"; children: ReactNode }) {
  const t = {
    neutral: "border-fg-3/40 text-fg-2",
    ok: "border-ok text-fg-2",
    warn: "border-warn text-fg-2",
    danger: "border-danger text-fg-2",
  }[tone];
  return <div className={cn("border-l-2 bg-white/[0.02] rounded-r-lg px-4 py-3 text-sm leading-relaxed", t)}>{children}</div>;
}

// ───────────────────────── icons

export function IconSteam({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.4 3.4 0 0 1 1.92-.59l.17.01 2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.08 2.91.01.15a3.4 3.4 0 0 1-6.73.68L.44 15.32A12 12 0 1 0 11.98 0ZM7.54 18.21l-1.47-.61a2.55 2.55 0 1 0 1.4-3.37l1.52.63a1.88 1.88 0 1 1-1.45 3.35Zm11.4-9.27a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0Zm-5.28 0a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0Z" />
    </svg>
  );
}

export function IconArrow({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBell({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}
