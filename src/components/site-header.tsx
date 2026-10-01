import Link from "next/link";
import { BrandLogo } from "./brand";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { IconBell, IconSteam, cn } from "./ui";
import { HeaderShell, MobileMenu, NavLinks, PublicOnly, UserMenu } from "./nav-links";

/** Логотип-ссылка на главную: утверждённый горизонтальный логотип */
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Link href="/" className="flex shrink-0 items-center rounded-[8px]" aria-label="F16 Arena — главная">
      <BrandLogo height={height} priority />
    </Link>
  );
}

/** Меню как в утверждённом макете главной */
export const NAV = [
  { href: "/tournaments", label: "Турниры" },
  { href: "/teams", label: "Команды" },
  { href: "/about", label: "О платформе" },
  { href: "/rules#faq", label: "FAQ" },
];

/** Второстепенные разделы — в «Ещё» на десктопе и в мобильном меню */
export const NAV_MORE = [
  { href: "/matches", label: "Матчи" },
  { href: "/stats", label: "Статистика" },
  { href: "/players", label: "Игроки" },
];

export async function SiteHeader() {
  const player = await getCurrentPlayer();
  const unread = player ? await getUnreadCount(player.id) : 0;
  const admin = isAdmin(player);
  const user = player ? { nickname: player.nickname, avatar: player.avatar_url, unread, admin } : null;

  return (
    <HeaderShell>
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center px-5 sm:px-8 lg:h-[96px] lg:px-16">
        <Logo height={58} />
        <NavLinks items={NAV} more={NAV_MORE} />
        <div className="ml-auto flex items-center gap-2">
          {user ? (
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
          <MobileMenu items={[...NAV, ...NAV_MORE]} user={user} />
        </div>
      </div>
    </HeaderShell>
  );
}

/** Подвал: логотип и копирайт, основное и второстепенное меню */
export function SiteFooter() {
  return (
    <PublicOnly>
      <footer className="mt-24">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-16">
          <div className="flex flex-col gap-8 border-t border-white/[0.08] py-10 md:flex-row md:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <Logo height={46} />
              <span className="text-[13px] text-fg-3 lg:text-[14px]">© {new Date().getFullYear()} F16 Arena. Все права защищены.</span>
            </div>
            <nav className="flex flex-wrap gap-x-9 gap-y-3 text-[13px] text-fg-2 md:ml-auto lg:gap-x-12 lg:text-[14px]" aria-label="Подвал">
              {[...NAV, ...NAV_MORE].map((i) => (
                <Link key={i.href} href={i.href} className="transition-colors duration-150 hover:text-fg">
                  {i.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </PublicOnly>
  );
}
