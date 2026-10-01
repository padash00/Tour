import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ───────────────────────── buttons

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warm";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-[#06101f] hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent/40",
  secondary:
    "bg-transparent text-fg border border-line-strong hover:bg-white/[0.04] hover:border-white/20 focus-visible:ring-2 focus-visible:ring-accent/30",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.04]",
  danger: "bg-danger-dim text-danger border border-[#e66f7433] hover:bg-[#e66f7424]",
  // знак бренда — использовать крайне редко
  warm: "bg-warm text-[#1a0d03] hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-[9px] gap-2",
  lg: "h-12 px-5 text-[15px] rounded-[10px] gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-semibold tracking-[-0.005em] whitespace-nowrap outline-none transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
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

/** Метка-факт без статуса: формат, режим. Используется редко */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-md bg-white/[0.04] text-[12px] text-fg-2 whitespace-nowrap">
      {children}
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

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between pt-14 pb-10 md:pt-20 md:pb-12">
      <div className="max-w-3xl">
        {eyebrow && <div className="text-sm text-fg-3 mb-4">{eyebrow}</div>}
        <h1 className="text-[36px] md:text-[48px] font-bold tracking-[-0.035em] leading-[1.02]">{title}</h1>
        {description && <p className="mt-4 text-fg-2 text-base md:text-[17px] leading-relaxed max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, action, eyebrow }: { title: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="text-sm text-fg-3 mb-2">{eyebrow}</div>}
        <h2 className="text-[22px] md:text-[28px] font-bold tracking-[-0.025em] leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={cn("card", hover && "card-hover", className)}>{children}</div>;
}

/** Цифра с подписью — без рамки */
export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-fg">{value}</div>
      {hint && <div className="mt-1 text-xs text-fg-3">{hint}</div>}
    </div>
  );
}

/** Крупная цифра — для ключевой статистики профиля и матча */
export function BigStat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: "ok" | "danger" | "accent" }) {
  return (
    <div>
      <div
        className={cn(
          "num text-[32px] md:text-[40px] font-semibold tracking-[-0.03em] leading-none",
          tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-fg",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[13px] text-fg-3">{label}</div>
    </div>
  );
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
    <div className="flex gap-6 border-b border-line overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cn(
            "relative h-12 inline-flex items-center text-[15px] font-medium transition-colors whitespace-nowrap",
            t.key === active ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          {t.key === active && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-fg" />}
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

export function IconSpark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" strokeLinecap="round" />
    </svg>
  );
}

export function IconUsers({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" strokeLinecap="round" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrophy({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v3M8 20h8M9 17h6v3H9z" strokeLinecap="round" />
    </svg>
  );
}

export function IconChart({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

export function IconServer({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" strokeLinecap="round" strokeWidth="2.4" />
    </svg>
  );
}

export function IconShield({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBracket({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden>
      <path d="M3 5h5v6H3M3 13h5v6H3M8 8h4v8H8M12 12h9" strokeLinecap="round" strokeLinejoin="round" />
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
