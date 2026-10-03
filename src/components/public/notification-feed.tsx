import Link from "next/link";
import { Bell, ChevronRight, CircleCheck, Server, ShieldCheck, Swords, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Notification } from "@/lib/types";
import { cn } from "@/components/ds";
import { UnreadNotificationLink } from "@/components/notifications/actions";

/*
 * Уведомления — строками (не карточками). У строки: иконка, заголовок, контекст, время, действие, прочитано или нет.
 * Цвет — по смыслу, а не по срочности: сервер готов — зелёный (можно подключаться), вето — акцент (ваше действие),
 * check-in — внимание, команда / заявки / решения — нейтрально. Срочное отличается весом: обводка иконки.
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

type Kind = "server" | "veto" | "check" | "team" | "admin" | "other";

/** Тип уведомления по тексту — для иконки и цвета */
function kind(n: Notification): Kind {
  const t = `${n.title} ${n.body ?? ""}`.toLowerCase();
  if (t.includes("сервер")) return "server";
  if (t.includes("вето") || t.includes("карт")) return "veto";
  if (t.includes("check-in")) return "check";
  if (t.includes("команд") || t.includes("приглаш") || t.includes("капитан")) return "team";
  if (t.includes("заявк") || t.includes("спор") || t.includes("решени")) return "admin";
  return "other";
}

const TONE_ICON = {
  ok: "bg-ok-dim text-ok border-ok/30",
  accent: "bg-accent-dim text-accent border-accent/30",
  warn: "bg-warn-dim text-warn border-warn/30",
  neutral: "bg-white/[0.05] text-fg-2 border-line",
};

const KIND: Record<Kind, { icon: ReactNode; tone: keyof typeof TONE_ICON; urgent?: boolean }> = {
  server: { icon: <Server />, tone: "ok", urgent: true },
  veto: { icon: <Swords />, tone: "accent", urgent: true },
  check: { icon: <CircleCheck />, tone: "warn" },
  team: { icon: <Users />, tone: "neutral" },
  admin: { icon: <ShieldCheck />, tone: "neutral" },
  other: { icon: <Bell />, tone: "neutral" },
};

export function NotificationItem({ n, compact }: { n: Notification; compact?: boolean }) {
  const unread = !n.read_at;
  const k = KIND[kind(n)];
  const inner = (
    <div className={cn("flex items-start gap-3", compact ? "py-3" : "px-4 py-3.5 sm:px-5")}>
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-control border [&>svg]:size-[18px]",
          unread ? cn(TONE_ICON[k.tone], k.urgent && "ring-2 ring-current/20") : "border-line-subtle bg-white/[0.02] text-fg-3",
        )}
        aria-hidden
      >
        {k.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[14px] leading-snug", unread ? "font-semibold text-fg" : "text-fg-2")}>{n.title}</div>
        {n.body && <div className={cn("mt-0.5 text-meta leading-relaxed text-fg-3", compact && "line-clamp-2")}>{n.body}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span className="num text-micro text-fg-3">{time(n.created_at)}</span>
        {unread && <span className="size-2 rounded-full bg-accent" aria-label="Не прочитано" />}
        {n.link && !compact && <ChevronRight className="size-4 text-fg-4" aria-hidden />}
      </div>
    </div>
  );
  const cls = cn(
    "block",
    !compact && unread && "bg-accent/[0.03]",
    n.link && "transition-colors duration-[var(--dur-hover)] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
  );
  if (n.link && unread) {
    // переход отмечает это уведомление прочитанным и сразу обновляет колокольчик
    return (
      <UnreadNotificationLink id={n.id} href={n.link} className={cls}>
        {inner}
      </UnreadNotificationLink>
    );
  }
  return n.link ? (
    <Link href={n.link} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Полная лента: группы по дням, в группе — список строк с разделителями */
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
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-3 text-meta font-medium text-fg-2">{g.label}</h2>
          <div className="divide-y divide-line-subtle overflow-hidden rounded-surface border border-line-subtle bg-surface">
            {g.items.map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
