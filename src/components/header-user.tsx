"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SteamMark } from "@/components/ds/icons";
import { ActivityAnnouncer, GlobalActivity } from "./shell/activity";
import { SearchTrigger } from "./shell/search";
import { MessagesIcon, MobileMenu, NotificationsBell, UserMenu } from "./nav-links";
import { ViewerSync, useViewer } from "./viewer";
import { LangSwitch } from "./lang-switch";
import { useT } from "@/lib/i18n/client";

/**
 * Правая часть шапки: поиск · глобальная активность · уведомления · профиль (на телефоне — меню).
 * Зависит от того, кто смотрит, поэтому рисуется на клиенте (страница — из кэша CDN).
 */
export function HeaderUser() {
  const { status, player, unread, dmUnread } = useViewer();
  const pathname = usePathname();
  const t = useT();
  const user = player ? { nickname: player.nickname, avatar: player.avatar_url, steamId: player.steam_id, unread, dmUnread, admin: player.isAdmin } : null;

  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
      <ViewerSync />
      <ActivityAnnouncer />
      <GlobalActivity />
      <SearchTrigger />
      <LangSwitch className="lg:hidden" />
      {status === "loading" ? (
        // место под профиль того же размера — без прыжка вёрстки
        <span aria-hidden className="hidden h-10 w-[150px] rounded-control bg-ink/[0.04] lg:block" />
      ) : user ? (
        <>
          <MessagesIcon unread={dmUnread} />
          <NotificationsBell unread={unread} />
          <UserMenu user={user} />
        </>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="hidden h-10 items-center gap-2 rounded-control border border-line bg-ink/[0.03] px-3.5 text-[14px] font-semibold text-fg transition-colors duration-[var(--dur-hover)] hover:border-line-strong hover:bg-ink/[0.06] sm:inline-flex lg:hidden"
        >
          <SteamMark className="size-4" />
          {t("Войти через Steam")}
        </Link>
      )}
      <MobileMenu user={user} />
    </div>
  );
}
