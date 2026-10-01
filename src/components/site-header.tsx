import Link from "next/link";
import { BrandLogo } from "./brand";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { Avatar, IconBell, IconSteam } from "./ui";
import { HeaderShell, MobileMenu, NavLinks, PublicOnly } from "./nav-links";

/** Логотип-ссылка на главную: утверждённый горизонтальный PNG */
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Link href="/" className="flex items-center shrink-0" aria-label="F16 Arena — главная">
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

export async function SiteHeader() {
  const player = await getCurrentPlayer();
  const unread = player ? await getUnreadCount(player.id) : 0;
  const admin = isAdmin(player);
  const mobileItems = [
    ...NAV,
    { href: "/matches", label: "Матчи" },
    { href: "/stats", label: "Статистика" },
    { href: "/players", label: "Игроки" },
    ...(admin ? [{ href: "/admin", label: "F16 Control" }] : []),
  ];

  return (
    <HeaderShell>
      <div className="mx-auto flex h-[72px] lg:h-[96px] w-full max-w-[1440px] items-center px-5 sm:px-8 lg:px-16">
        <Logo height={58} />
        <NavLinks items={NAV} />
        <div className="ml-auto flex items-center gap-1.5">
          {admin && (
            <Link href="/admin" className="hidden md:inline-flex h-9 px-3 items-center rounded-md text-[13px] text-fg-3 hover:text-fg transition">
              Control
            </Link>
          )}
          {player ? (
            <>
              <Link
                href="/notifications"
                className="relative grid place-items-center size-11 rounded-md text-fg-3 hover:text-fg hover:bg-white/[0.04] transition"
                aria-label="Уведомления"
              >
                <IconBell className="size-[18px]" />
                {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-bg" />}
              </Link>
              <Link
                href="/me"
                className="flex h-11 items-center gap-2.5 rounded-[7px] border border-white/[0.14] bg-white/[0.02] pl-1.5 pr-3.5 hover:border-white/30 transition"
              >
                <Avatar src={player.avatar_url} name={player.nickname} size={30} />
                <span className="hidden sm:block max-w-[140px] truncate text-[14px] font-medium">{player.nickname}</span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-11 lg:h-[52px] items-center gap-3 rounded-[8px] border border-accent/45 bg-[#0b1420]/60 px-4 sm:px-5 lg:px-6 text-[14px] lg:text-[16px] font-medium text-fg transition-colors hover:border-accent/80 hover:bg-accent/[0.06]"
            >
              <IconSteam className="size-5 lg:size-6" />
              <span className="hidden sm:inline">Войти через Steam</span>
              <span className="sm:hidden">Войти</span>
            </Link>
          )}
          <MobileMenu items={mobileItems} />
        </div>
      </div>
    </HeaderShell>
  );
}

/** Подвал как в макете: одна строка — логотип, копирайт, меню */
export function SiteFooter() {
  return (
    <PublicOnly>
      <footer className="mt-24">
        <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-16">
          <div className="flex flex-col gap-6 border-t border-white/[0.08] py-9 md:flex-row md:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <Logo height={46} />
              <span className="text-[13px] lg:text-[14px] text-fg-3">© {new Date().getFullYear()} F16 Arena. Все права защищены.</span>
            </div>
            <nav className="flex flex-wrap gap-x-10 lg:gap-x-14 gap-y-3 text-[13px] lg:text-[14px] text-fg-2 md:ml-auto">
              {NAV.map((i) => (
                <Link key={i.href} href={i.href} className="hover:text-fg transition-colors">
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
