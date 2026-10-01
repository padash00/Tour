import Link from "next/link";
import type { Notification } from "@/lib/types";
import { cn } from "../ui";

/*
 * Лента уведомлений: непрочитанные — с акцентной полосой и подсветкой,
 * прочитанные — тише. В полной ленте строки сгруппированы по дням.
 */

const tz = "Asia/Almaty";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { timeZone: tz });
const time = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string, now: Date) {
  const k = dayKey(iso);
  if (k === dayKey(now.toISOString())) return "Сегодня";
  if (k === dayKey(new Date(now.getTime() - 86_400_000).toISOString())) return "Вчера";
  return new Date(iso).toLocaleDateString("ru-RU", { timeZone: tz, day: "numeric", month: "long" });
}

/** Тип уведомления по тексту — для иконки */
function kind(n: Notification): "server" | "veto" | "team" | "check" | "admin" | "other" {
  const t = `${n.title} ${n.body ?? ""}`.toLowerCase();
  if (t.includes("сервер")) return "server";
  if (t.includes("вето") || t.includes("карт")) return "veto";
  if (t.includes("check-in")) return "check";
  if (t.includes("команд") || t.includes("приглаш") || t.includes("капитан")) return "team";
  if (t.includes("заявк") || t.includes("спор") || t.includes("решени")) return "admin";
  return "other";
}

const ICON: Record<ReturnType<typeof kind>, string> = {
  server: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  veto: "M4 6h16M4 12h16M4 18h10",
  team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.5.7 2.4 2.4 2.8 5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  admin: "M12 3 5 6v5.5c0 4.4 3 8.1 7 9.5 4-1.4 7-5.1 7-9.5V6l-7-3Z",
  other: "M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2 2 0 0 0 4 0",
};

export function NotificationItem({ n, compact }: { n: Notification; compact?: boolean }) {
  const unread = !n.read_at;
  const k = kind(n);
  const inner = (
    <div className={cn("relative flex items-start gap-4", compact ? "py-3.5" : "px-5 py-4 lg:px-6")}>
      {!compact && <span className={cn("absolute inset-y-3 left-0 w-[2px] rounded-full", unread ? "bg-accent" : "bg-transparent")} />}
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-[8px] border",
          unread ? "border-accent/30 bg-accent/[0.08] text-accent" : "border-white/[0.08] bg-white/[0.02] text-fg-3",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={ICON[k]} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[15px] leading-snug", unread ? "font-semibold text-fg" : "text-fg-2")}>{n.title}</div>
        {n.body && <div className="mt-1 text-[14px] leading-relaxed text-fg-3">{n.body}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
        <span className="num text-[12px] text-fg-3">{time(n.created_at)}</span>
        {unread && <span className="size-2 rounded-full bg-accent" aria-label="Не прочитано" />}
      </div>
    </div>
  );
  const cls = cn(
    "block border-b border-white/[0.05] last:border-0",
    !compact && unread && "bg-accent/[0.03]",
    n.link && "transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
  );
  return n.link ? (
    <Link href={n.link} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Полная лента с разбивкой по дням */
export function NotificationFeed({ items, now }: { items: Notification[]; now: Date }) {
  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.created_at, now);
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.label}>
          <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-fg-3">{g.label}</div>
          <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80">
            {g.items.map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
