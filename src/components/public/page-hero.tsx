import type { ReactNode } from "react";
import { cn } from "../ui";
import { Eyebrow, WRAP } from "./home";

/**
 * Шапка публичной страницы в языке утверждённой главной: тёмный холодный свет сверху,
 * надпись разрядкой, крупный заголовок, короткое описание. Без декоративных панелей.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_80%_-10%,#16253d80,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
      <div className={cn(WRAP, "relative pt-14 pb-12 lg:pt-20 lg:pb-16")}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[860px]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="mt-5 text-[40px] sm:text-[52px] lg:text-[64px] font-semibold leading-[1.04] tracking-[-0.015em] text-fg">
              {title}
            </h1>
            {description && <p className="mt-6 max-w-[640px] text-[16px] lg:text-[19px] leading-[1.6] text-fg-2">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-4">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

/** Заголовок раздела внутри страницы — как «Ближайший турнир» на главной */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <Eyebrow>{children}</Eyebrow>
      {action}
    </div>
  );
}

/** Карточка в языке главной */
export const CARD = "rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80";
