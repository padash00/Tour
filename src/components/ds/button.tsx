import Link from "next/link";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/*
 * Кнопки F16 DS — единственная система кнопок.
 *   primary   — главное действие экрана (одно на область): «Подать заявку», «Подключиться»
 *   secondary — второстепенное действие рядом с главным
 *   ghost     — тихое действие в строке / панели инструментов
 *   danger    — необратимое: выйти из команды, распустить, остановить матч
 *   quiet     — действие-ссылка в тексте: «Все матчи →»
 * Размеры: sm 32 (плотные строки), md 40 (44 на телефоне — палец), lg 48 (главный CTA).
 * Состояния: hover · pressed (globals: scale .98) · focus (кольцо) · disabled · loading · done.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold " +
  "transition-[background-color,border-color,color,opacity] duration-[var(--dur-hover)] ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong active:bg-accent-pressed",
  secondary: "border border-line bg-white/[0.03] text-fg hover:border-line-strong hover:bg-white/[0.06]",
  ghost: "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
  danger: "border border-danger/35 bg-danger-dim text-danger hover:border-danger/60 hover:bg-danger/[0.16]",
  quiet: "text-accent hover:text-accent-strong underline-offset-4 hover:underline",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-control px-3 text-meta sm:h-8",
  md: "h-11 gap-2 rounded-control px-4 text-[14px] sm:h-10",
  lg: "h-12 gap-2.5 rounded-control px-6 text-[15px]",
};
// у quiet нет «коробки»: высота по тексту
const QUIET_SIZE: Record<ButtonSize, string> = { sm: "gap-1 text-meta", md: "gap-1.5 text-[14px]", lg: "gap-2 text-[15px]" };

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(BASE, VARIANT[variant], variant === "quiet" ? QUIET_SIZE[size] : SIZE[size], extra);
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("animate-spin", className)} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** иконка слева (lucide, класс размера ставится сам) */
  icon?: ReactNode;
  /** иконка справа — стрелка, внешняя ссылка */
  iconRight?: ReactNode;
  /** идёт действие: спиннер вместо иконки, кнопка недоступна */
  loading?: boolean;
  /** действие выполнено (на пару секунд): галочка вместо иконки */
  done?: boolean;
  /** растянуть на всю ширину */
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

function Inner({ icon, iconRight, loading, done, children }: Pick<Common, "icon" | "iconRight" | "loading" | "done" | "children">) {
  const lead = loading ? <Spinner /> : done ? <Check className="size-4" /> : icon;
  return (
    <>
      {lead && <span className="grid shrink-0 place-items-center [&>svg]:size-4">{lead}</span>}
      {children}
      {iconRight && <span className="grid shrink-0 place-items-center [&>svg]:size-4">{iconRight}</span>}
    </>
  );
}

/** Кнопка: с href — ссылка (next/link), без — <button type="button" | "submit"> */
export function Button(props: Common & ({ href: string; external?: boolean } | (Omit<ComponentProps<"button">, "children"> & { href?: undefined }))) {
  const { variant = "primary", size = "md", icon, iconRight, loading, done, block, className, children } = props;
  const cls = buttonClass(variant, size, cn(block && "w-full", className));
  const inner = <Inner icon={icon} iconRight={iconRight} loading={loading} done={done}>{children}</Inner>;
  if (props.href !== undefined) {
    const { href, external } = props as { href: string; external?: boolean };
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, size: _s, icon: _i, iconRight: _r, loading: _l, done: _d, block: _b, className: _c, children: _ch, href: _h, ...rest } = props as Common &
    ComponentProps<"button"> & { href?: undefined };
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={cls}>
      {inner}
    </button>
  );
}

/** Квадратная кнопка-иконка (панели инструментов, «⋯», закрыть). label обязателен — это aria-label */
export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: { label: string; variant?: Exclude<ButtonVariant, "quiet">; size?: ButtonSize } & ComponentProps<"button">) {
  const box = size === "sm" ? "size-9 sm:size-8" : size === "lg" ? "size-12" : "size-11 sm:size-10";
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cn(BASE, VARIANT[variant], box, "rounded-control [&>svg]:size-[18px]", className)}>
      {children}
    </button>
  );
}
