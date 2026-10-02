"use client";

import Link from "next/link";
import { MobileMenu, UserMenu } from "./nav-links";
import { IconBell, IconSteam, cn } from "./ui";
import { ViewerSync, useViewer } from "./viewer";

type Item = { href: string; label: string };

/** Правая часть шапки: зависит от того, кто смотрит, поэтому рисуется на клиенте (страница — из кэша CDN) */
export function HeaderUser({ items }: { items: Item[] }) {
  const { status, player, unread } = useViewer();
  const user = player ? { nickname: player.nickname, avatar: player.avatar_url, unread, admin: player.isAdmin } : null;

  return (
    <>
      <ViewerSync />
      {status === "loading" ? (
        // место под кнопку/профиль того же размера — без прыжка вёрстки
        <span aria-hidden className="h-11 w-[132px] rounded-[8px] bg-white/[0.04] sm:w-[190px] lg:h-[52px] lg:w-[226px]" />
      ) : user ? (
        <>
          <Link
            href="/notifications"
            className="relative grid size-11 place-items-center rounded-[9px] text-fg-3 transition-colors duration-150 hover:bg-white/[0.05] hover:text-fg"
            aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
          >
            <IconBell className="size-[19px]" />
            {unread > 0 && (
              <span
                className={cn(
                  "num absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink ring-2 ring-bg",
                )}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <UserMenu user={user} />
        </>
      ) : (
        <Link
          href="/login"
          className="inline-flex h-11 items-center gap-3 rounded-[8px] border border-accent/45 bg-[#0b1420]/60 px-4 text-[14px] font-medium text-fg transition-colors duration-150 hover:border-accent/80 hover:bg-accent/[0.06] sm:px-5 lg:h-[52px] lg:px-6 lg:text-[16px]"
        >
          <IconSteam className="size-5 lg:size-6" />
          <span className="hidden sm:inline">Войти через Steam</span>
          <span className="sm:hidden">Войти</span>
        </Link>
      )}
      <MobileMenu items={items} user={user} />
    </>
  );
}
