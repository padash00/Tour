import type { ReactNode } from "react";
import { cn } from "../ui";

/*
 * Сообщения на публичных страницах: спокойная плашка с иконкой
 * и закреплённая снизу главная кнопка на телефоне.
 */

const TONE = {
  neutral: { box: "border-white/[0.1] bg-white/[0.025] text-fg-2", icon: "text-fg-3" },
  ok: { box: "border-ok/30 bg-ok/[0.06] text-fg-2", icon: "text-ok" },
  warn: { box: "border-warn/30 bg-warn/[0.06] text-fg-2", icon: "text-warn" },
  danger: { box: "border-danger/30 bg-danger/[0.06] text-fg-2", icon: "text-danger" },
} as const;

type Tone = keyof typeof TONE;

function ToneIcon({ tone }: { tone: Tone }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (tone === "ok") {
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.6 2.5L16 9.5" />
      </svg>
    );
  }
  if (tone === "neutral") {
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.6v.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" {...common} aria-hidden>
      <path d="M12 3.5 21 19.5H3L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </svg>
  );
}

/** Плашка-сообщение: черновик, отказ, «check-in ещё не открыт» */
export function Callout({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" || tone === "warn" ? "alert" : undefined}
      className={cn("flex flex-wrap items-start gap-x-3.5 gap-y-2 rounded-[10px] border px-4 py-3.5 text-[14px] leading-relaxed lg:text-[15px]", t.box, className)}
    >
      <span className={cn("mt-[3px] shrink-0", t.icon)}>
        <ToneIcon tone={tone} />
      </span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-fg">{title}</div>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="w-full pl-8 pt-1 sm:w-auto sm:shrink-0 sm:self-center sm:pl-0 sm:pt-0 [&>*]:max-sm:w-full">{action}</div>}
    </div>
  );
}

/**
 * Главное действие, закреплённое внизу экрана на телефоне (на десктопе скрыто).
 * Под ним оставлен отступ, чтобы не перекрывать подвал.
 */
export function MobileStickyCta({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <>
      <div className="h-24 sm:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle bg-bg/90 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:hidden">
        {note && <div className="mb-2 text-center text-[12px] text-fg-3">{note}</div>}
        <div className="flex gap-3 [&>*]:flex-1 [&>*]:min-w-0">{children}</div>
      </div>
    </>
  );
}
