import type { ReactNode } from "react";
import { cn } from "../ui";
import { Eyebrow, WRAP } from "./home";

/*
 * Общие детали внутренних публичных страниц в языке утверждённой главной:
 * сетка WRAP, надписи разрядкой (Eyebrow), карточки как на главной, тёмный атмосферный hero.
 */

/** Карточка как на главной («Как это работает», «Ближайший турнир») */
export const CARD = "rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80";

export function Wrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(WRAP, className)}>{children}</div>;
}

/** Hero внутренней страницы: тёмный градиент, холодный свет справа, надпись разрядкой, крупный заголовок */
export function PageHero({
  eyebrow,
  title,
  lead,
  media,
  aside,
  children,
  compact,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** логотип команды / аватар слева от заголовка */
  media?: ReactNode;
  /** блок справа (цифры, кнопки) */
  aside?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_0%,#1a2c48b3,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_380px_at_0%_100%,#0f1b2c80,transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
      </div>
      <div className={cn(WRAP, "relative", compact ? "pt-12 pb-12 lg:pt-16 lg:pb-14" : "pt-14 pb-14 lg:pt-20 lg:pb-16")}>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end min-w-0">
            {media}
            <div className="min-w-0">
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              <h1
                className={cn(
                  "font-semibold leading-[1.02] tracking-[-0.015em] text-fg break-words",
                  !!eyebrow && "mt-5",
                  compact ? "text-[38px] sm:text-[48px] lg:text-[58px]" : "text-[42px] sm:text-[56px] lg:text-[70px]",
                )}
              >
                {title}
              </h1>
              {lead && <div className="mt-5 max-w-[680px] text-[16px] lg:text-[18px] leading-[1.6] text-fg-2">{lead}</div>}
            </div>
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Заголовок раздела: надпись разрядкой и ссылка справа */
export function SectionHead({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <Eyebrow>{title}</Eyebrow>
      {action}
    </div>
  );
}

/** Крупная цифра без рамки */
export function HeroNumber({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: string }) {
  return (
    <div>
      <div className={cn("num text-[30px] lg:text-[40px] font-semibold leading-none tracking-[-0.02em]", tone ?? "text-fg")}>{value}</div>
      <div className="mt-2.5 text-[12px] lg:text-[13px] uppercase tracking-[0.2em] text-fg-3">{label}</div>
    </div>
  );
}

/** Поиск по списку (GET-форма) */
export function SearchField({ name = "q", defaultValue, placeholder }: { name?: string; defaultValue?: string; placeholder: string }) {
  return (
    <form className="w-full sm:w-[380px]">
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-12 w-full rounded-[8px] border border-white/[0.1] bg-[#09111b] px-4 text-[15px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent"
      />
    </form>
  );
}
