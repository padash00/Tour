"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, ChevronRight, CircleHelp, Copy, Crosshair, Home, Search, Shield, Trophy, User, UserRound, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "../brand";
import { Avatar, Timer, cn } from "@/components/ds";
import { SteamMark } from "@/components/ds/icons";
import { useToast } from "../toast";
import { useViewer, type Activity } from "../viewer";
import { isActive, noChrome, type NavItem } from "./nav";

/*
 * Каркас сайта: боковое меню слева (от 1024px) и нижняя панель на телефоне.
 * Вверху меню — «Мой матч»: самое срочное действие игрока (lib/activity.ts) — подключиться, ход в вето, check-in.
 */

type SideItem = NavItem & { hint: string; Icon: LucideIcon };

/** Разделы бокового меню: группы и короткое пояснение под каждым пунктом — понятно, куда ведёт */
const GROUPS: { title: string; items: SideItem[] }[] = [
  {
    title: "Играть",
    items: [
      { href: "/", label: "Главная", hint: "что идёт сейчас", match: ["/"], Icon: Home },
      { href: "/tournaments", label: "Турниры", hint: "заявки, сетка, итоги", match: ["/tournaments"], Icon: Trophy },
      { href: "/matches", label: "Матчи", hint: "счёт и расписание", match: ["/matches"], Icon: Crosshair },
      { href: "/lobbies", label: "Лобби", hint: "сыграть без турнира", match: ["/lobbies", "/lobby"], Icon: Users },
    ],
  },
  {
    title: "Сообщество",
    items: [
      { href: "/stats", label: "Рейтинг", hint: "лучшие игроки и статистика", match: ["/stats"], Icon: BarChart3 },
      { href: "/teams", label: "Команды", hint: "составы и капитаны", match: ["/teams", "/team", "/join"], Icon: Shield },
      { href: "/find", label: "Поиск команды", hint: "найти тиммейтов", match: ["/find"], Icon: Search },
      { href: "/players", label: "Игроки", hint: "все игроки сайта", match: ["/players"], Icon: UserRound },
    ],
  },
];

const HELP = [
  { href: "/help", label: "Как это работает", Icon: CircleHelp },
  { href: "/rules", label: "Правила и FAQ", Icon: BookOpen },
];

const navActive = (pathname: string, item: NavItem) => (item.href === "/" ? pathname === "/" : isActive(pathname, item));

/** Отступ под боковое меню и нижнюю панель — только на страницах с оболочкой сайта */
export function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (noChrome(pathname)) return <>{children}</>;
  return <div className="flex min-h-full flex-1 flex-col pb-[calc(68px+env(safe-area-inset-bottom,0px))] lg:pb-0 lg:pl-[var(--sidebar-w)]">{children}</div>;
}

const TONE: Record<Activity["tone"], { box: string; dot: string }> = {
  live: { box: "bg-danger-dim text-live", dot: "bg-live" },
  ok: { box: "bg-ok-dim text-ok", dot: "bg-ok" },
  accent: { box: "bg-accent-dim text-accent", dot: "bg-accent" },
  warn: { box: "bg-warn-dim text-warn", dot: "bg-warn" },
};

/** «Мой матч»: срочное действие крупно — что случилось, до когда, кнопки «Открыть» и «Скопировать адрес» */
export function MyMatchCard({ activity, more }: { activity: Activity; more: number }) {
  const toast = useToast();
  const tone = TONE[activity.tone];
  return (
    <div className={cn("flex flex-col gap-2 rounded-surface p-3.5", tone.box)}>
      <span className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-[0.04em]">
        <span className={cn("size-2 shrink-0 rounded-full", tone.dot, activity.priority <= 3 && "animate-pulse")} aria-hidden />
        {activity.label}
        {more > 0 && <span className="ml-auto rounded-full bg-ink/[0.08] px-1.5 text-[11px] text-fg-2">+{more}</span>}
      </span>
      <span className="text-[15px] font-semibold leading-snug text-fg">{activity.detail}</span>
      {activity.deadline && (
        <span className="text-meta text-fg-2">
          Осталось <Timer deadline={activity.deadline} urgentAt={activity.priority === 4 ? 300 : 10} className="font-bold text-fg" />
        </span>
      )}
      <Link href={activity.href} className="mt-1 inline-flex h-11 items-center justify-center rounded-control bg-fg text-[15px] font-bold text-white transition-opacity hover:opacity-90">
        Открыть
      </Link>
      {activity.connect && (
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(`connect ${activity.connect}`).then(
              () => toast.success(`Скопировано: connect ${activity.connect} — вставьте в консоль CS2 (~)`),
              () => toast.error(`Адрес сервера: ${activity.connect}`),
            )
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-surface text-[14px] font-semibold text-fg shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <Copy className="size-4" />
          Скопировать адрес сервера
        </button>
      )}
    </div>
  );
}

/** Боковое меню (от 1024px): логотип · «Мой матч» · разделы · второстепенное · игрок или вход */
export function SiteSidebar() {
  const pathname = usePathname();
  const { status, player, activity, moreActivity } = useViewer();
  if (noChrome(pathname)) return null;
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col gap-4 overflow-y-auto border-r border-line-subtle bg-shell px-3.5 py-4 lg:flex" aria-label="Меню сайта">
      <Link href="/" className="mx-2 mb-1 mt-1 block w-fit rounded-control" aria-label="F16 Arena — главная">
        <BrandLogo height={30} />
      </Link>

      {activity && <MyMatchCard activity={activity} more={moreActivity} />}

      {GROUPS.map((g) => (
        <nav key={g.title} className="flex flex-col gap-0.5" aria-label={g.title}>
          <div className="px-3 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-fg-4">{g.title}</div>
          {g.items.map((item) => {
            const active = navActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-control px-3 py-2 transition-colors duration-[var(--dur-hover)]",
                  active ? "bg-accent-dim text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <item.Icon className={cn("size-[22px] shrink-0", active ? "text-accent" : "text-fg-3")} />
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-semibold leading-tight">{item.label}</span>
                  <span className="block truncate text-[12.5px] leading-snug text-fg-3">{item.hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      ))}

      <div className="flex-1" />

      <div className="rounded-surface bg-surface-2 p-1.5">
        {HELP.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[14px] font-semibold text-fg-2 transition-colors hover:bg-surface hover:text-fg">
            <Icon className="size-[18px] text-fg-3" />
            {label}
            <ChevronRight className="ml-auto size-4 text-fg-4" />
          </Link>
        ))}
        <div className="flex flex-wrap gap-x-3 px-2.5 pb-1 pt-1.5 text-[12.5px] text-fg-3">
          <Link href="/about" className="hover:text-fg">
            О платформе
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            Персональные данные
          </Link>
        </div>
      </div>

      {status === "loading" ? (
        <span aria-hidden className="h-[60px] rounded-surface bg-ink/[0.04]" />
      ) : player ? (
        <Link
          href="/me"
          aria-current={pathname === "/me" ? "page" : undefined}
          className="flex items-center gap-3 rounded-surface p-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-surface-2 aria-[current=page]:bg-accent-dim aria-[current=page]:shadow-none"
        >
          <Avatar src={player.avatar_url} name={player.nickname} size="md" className="!rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold">{player.nickname}</span>
            <span className="block text-[12.5px] text-fg-3">Моя игра</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-fg-4" />
        </Link>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-fg text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <SteamMark className="size-5" />
          Войти через Steam
        </Link>
      )}
    </aside>
  );
}

/** Нижняя панель на телефоне: пять разделов крупно, с подписями */
export function MobileTabBar() {
  const pathname = usePathname();
  const { player } = useViewer();
  if (noChrome(pathname)) return null;
  const items = [
    { href: "/", label: "Главная", Icon: Home, active: pathname === "/" },
    { href: "/tournaments", label: "Турниры", Icon: Trophy, active: pathname.startsWith("/tournaments") },
    { href: "/matches", label: "Матчи", Icon: Crosshair, active: pathname.startsWith("/matches") },
    { href: "/lobbies", label: "Лобби", Icon: Users, active: pathname.startsWith("/lobb") },
    player
      ? { href: "/me", label: "Профиль", Icon: User, active: pathname === "/me" || pathname.startsWith("/team") }
      : { href: `/login?next=${encodeURIComponent(pathname)}`, label: "Войти", Icon: User, active: pathname === "/login" },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line-subtle bg-shell/95 px-1 pb-[env(safe-area-inset-bottom,0px)] pt-1.5 backdrop-blur-xl lg:hidden"
      aria-label="Разделы"
    >
      {items.map(({ href, label, Icon, active }) => (
        <Link
          key={label}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn("flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-control text-[12px] font-bold", active ? "text-accent" : "text-fg-3")}
        >
          <Icon className="size-6" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
