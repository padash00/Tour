import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ───────────────────────── buttons

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warm";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-[#06101f] hover:bg-accent-strong shadow-[inset_0_1px_0_#ffffff40,0_1px_2px_#0006] focus-visible:ring-2 focus-visible:ring-accent/40",
  secondary:
    "bg-white/[0.04] text-fg border border-line-strong hover:bg-white/[0.07] hover:border-[#3a4c6a] focus-visible:ring-2 focus-visible:ring-accent/30",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.05]",
  danger: "bg-danger-dim text-danger border border-[#ef7a7a33] hover:bg-[#ef7a7a26] hover:border-[#ef7a7a55]",
  warm: "bg-warm text-[#1a0d03] hover:brightness-110 shadow-[inset_0_1px_0_#ffffff55]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-[10px] gap-2",
  lg: "h-12 px-6 text-[15px] rounded-xl gap-2",
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

// ───────────────────────── pills / badges

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "live";

const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.04] text-fg-2 border-line",
  accent: "bg-accent-dim text-accent border-[#8bb8ff33]",
  ok: "bg-ok-dim text-ok border-[#6cc59a33]",
  warn: "bg-warn-dim text-warn border-[#e3b46533]",
  danger: "bg-danger-dim text-danger border-[#ef7a7a33]",
  live: "bg-danger-dim text-danger border-[#ef7a7a33]",
};

export function Pill({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[11px] font-semibold uppercase tracking-[0.08em]",
        tones[tone],
      )}
    >
      {(dot || tone === "live") && (
        <span className={cn("size-1.5 rounded-full bg-current", tone === "live" && "animate-pulse")} />
      )}
      {children}
    </span>
  );
}

// ───────────────────────── layout

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
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
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between pt-12 pb-8 md:pt-16 md:pb-10">
      <div className="max-w-2xl">
        {eyebrow && <div className="label mb-3">{eyebrow}</div>}
        <h1 className="text-3xl md:text-[44px] font-bold tracking-[-0.03em] leading-[1.05]">{title}</h1>
        {description && <p className="mt-4 text-fg-2 text-[15px] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, action, eyebrow }: { title: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h2 className="text-xl md:text-2xl font-bold tracking-[-0.02em]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={cn("card", hover && "card-hover", className)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-2 text-lg font-semibold text-fg">{value}</div>
      {hint && <div className="mt-1 text-xs text-fg-3">{hint}</div>}
    </div>
  );
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line last:border-0">
      <span className="text-sm text-fg-3">{label}</span>
      <span className="text-sm text-fg text-right">{children}</span>
    </div>
  );
}

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
    <div
      className={cn(
        "card flex flex-col items-center justify-center text-center border-dashed",
        compact ? "py-10 px-6" : "py-16 px-6",
      )}
    >
      <div className="mb-5 grid place-items-center size-12 rounded-xl border border-line bg-bg-2 text-fg-3">
        {icon ?? <IconSpark />}
      </div>
      <div className="text-base font-semibold">{title}</div>
      {description && <p className="mt-2 max-w-sm text-sm text-fg-3 leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
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
      className="rounded-lg border border-line object-cover bg-surface-2 shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-lg border border-line bg-surface-2 grid place-items-center text-fg-3 font-semibold shrink-0"
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
      className="rounded-xl border border-line object-cover bg-surface-2 shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-xl border border-line bg-gradient-to-br from-surface-3 to-bg-2 grid place-items-center font-bold tracking-tight text-fg-2 shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.28) }}
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
    <div className="flex gap-1 border-b border-line overflow-x-auto">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cn(
            "relative px-4 h-11 inline-flex items-center text-sm font-medium transition-colors whitespace-nowrap",
            t.key === active ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          {t.key === active && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent" />}
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
      <span className="block text-[13px] font-medium text-fg-2 mb-2">{label}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger"; children: ReactNode }) {
  const t = {
    neutral: "border-line bg-white/[0.02] text-fg-2",
    ok: "border-[#6cc59a33] bg-ok-dim text-ok",
    warn: "border-[#e3b46533] bg-warn-dim text-warn",
    danger: "border-[#ef7a7a33] bg-danger-dim text-danger",
  }[tone];
  return <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", t)}>{children}</div>;
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
