import type { ReactNode } from "react";
import { cn } from "./cn";

/*
 * Роли текста F16 DS. У каждой одна задача — не подменять одну другой.
 *   PageTitle       — название страницы (одно на страницу), 28–34
 *   SectionTitle    — заголовок раздела обычным регистром: «Формат турнира», 20–23
 *   SubsectionTitle — заголовок внутри раздела / объекта, 17
 *   Label           — подпись к значению: «Начало», «Формат»
 *   Meta            — второстепенная информация: дата, счётчик, автор
 *   Eyebrow         — короткая служебная метка капсом: LIVE, КАРТА 2, СЕРВЕР, РАУНД. Не заголовок раздела.
 */

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("text-page text-fg text-balance", className)}>{children}</h1>;
}

/** Заголовок раздела: название, необязательное пояснение и действие справа («Все матчи →») */
export function SectionTitle({
  children,
  description,
  action,
  as: Tag = "h2",
  className,
}: {
  children: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        <Tag className="text-heading text-fg">{children}</Tag>
        {description && <p className="mt-1.5 max-w-read text-meta text-fg-3">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SubsectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-4", className)}>
      <h3 className="text-title text-fg">{children}</h3>
      {action}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-meta font-medium text-fg-3", className)}>{children}</span>;
}

export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-meta text-fg-3", className)}>{children}</span>;
}

export function Eyebrow({ children, className, tone = "muted" }: { children: ReactNode; className?: string; tone?: "muted" | "accent" | "live" | "ok" | "warn" }) {
  const color = { muted: "text-fg-3", accent: "text-accent", live: "text-live", ok: "text-ok", warn: "text-warn" }[tone];
  return <span className={cn("text-micro font-semibold uppercase tracking-[0.14em]", color, className)}>{children}</span>;
}
