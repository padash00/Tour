import type { ReactNode } from "react";
import { cn } from "../ui";
import { Eyebrow } from "./home";

/*
 * Сфокусированный сценарий (регистрация на турнир, check-in) в языке утверждённой главной.
 * API совпадает с competition/step: Step({n,title,done,muted}), FlowHeader({back,title,description}).
 */

export function Flow({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_-10%,#16253d80,transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-[860px] px-5 sm:px-8 pb-6">{children}</div>
    </div>
  );
}

export function FlowHeader({ back, title, description }: { back?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="pt-12 pb-10 lg:pt-16">
      {back && <div className="mb-8 text-[14px] text-fg-2">{back}</div>}
      <Eyebrow>Турнир F16 Arena</Eyebrow>
      <h1 className="mt-4 text-[34px] sm:text-[44px] lg:text-[52px] font-semibold leading-[1.05] tracking-[-0.015em]">{title}</h1>
      {description && <p className="mt-5 text-[16px] lg:text-[18px] leading-[1.6] text-fg-2">{description}</p>}
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
    <section
      className={cn(
        "mb-4 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-7 lg:p-9",
        muted && "opacity-45",
        done && "border-ok/25",
      )}
    >
      <div className="flex items-baseline gap-5">
        <span className={cn("num text-[13px] lg:text-[15px]", done ? "text-ok" : "text-fg-3")}>
          {done ? "✓" : String(n).padStart(2, "0")}
        </span>
        <h2 className="text-[20px] lg:text-[24px] font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
