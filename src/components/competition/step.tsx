import type { ReactNode } from "react";
import { cn } from "../ui";

/** Шаг пошагового сценария (регистрация, создание команды): номер слева, содержимое справа */
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
    <section className={cn("grid grid-cols-[32px_1fr] gap-x-5 py-8 border-b border-line last:border-0", muted && "opacity-50")}>
      <span
        className={cn(
          "grid place-items-center size-7 rounded-full text-[12px] font-semibold num",
          done ? "bg-ok/15 text-ok" : "bg-white/[0.06] text-fg-2",
        )}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.015em] leading-7">{title}</h2>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}

/** Шапка сфокусированного сценария: без лишней навигации */
export function FlowHeader({ back, title, description }: { back?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="pt-12 pb-6 md:pt-16">
      {back && <div className="text-sm text-fg-3 mb-6">{back}</div>}
      <h1 className="text-[32px] md:text-[40px] font-bold tracking-[-0.035em] leading-[1.05]">{title}</h1>
      {description && <p className="mt-3 text-fg-2 leading-relaxed">{description}</p>}
    </div>
  );
}
