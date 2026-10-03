"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SteamMark } from "@/components/ds/icons";
import { ActivityAnnouncer, GlobalActivity } from "./shell/activity";
import { SearchTrigger } from "./shell/search";
import { MobileMenu, NotificationsBell, UserMenu } from "./nav-links";
import { ViewerSync, useViewer } from "./viewer";

/**
 * Правая часть шапки: поиск · глобальная активность · уведомления · профиль (на телефоне — меню).
 * Зависит от того, кто смотрит, поэтому рисуется на клиенте (страница — из кэша CDN).
 */
export function HeaderUser() {
  const { status, player, unread } = useViewer();
  const pathname = usePathname();
  const user = player ? { nickname: player.nickname, avatar: player.avatar_url, steamId: player.steam_id, unread, admin: player.isAdmin } : null;

  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
      <ViewerSync />
      <ActivityAnnouncer />
      <GlobalActivity />
      <SearchTrigger />
      {status === "loading" ? (
        // место под профиль того же размера — без прыжка вёрстки
        <span aria-hidden className="hidden h-10 w-[150px] rounded-control bg-white/[0.04] lg:block" />
      ) : user ? (
        <>
          <NotificationsBell unread={unread} />
          <UserMenu user={user} />
        </>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="hidden h-10 items-center gap-2 rounded-control border border-line bg-white/[0.03] px-3.5 text-[14px] font-semibold text-fg transition-colors duration-[var(--dur-hover)] hover:border-line-strong hover:bg-white/[0.06] sm:inline-flex"
        >
          <SteamMark className="size-4" />
          Войти через Steam
        </Link>
      )}
      <MobileMenu user={user} />
    </div>
  );
}
