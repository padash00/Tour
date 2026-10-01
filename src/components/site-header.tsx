import Link from "next/link";
import { F16Logo, F16Symbol } from "./brand";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { Avatar, ButtonLink, Container, IconBell, IconSteam } from "./ui";
import { HeaderShell, MobileMenu, NavLinks, PublicOnly } from "./nav-links";

/** Знак F16 одним цветом (для фоновых композиций) */
export function F16Mark({ className = "size-6" }: { className?: string }) {
  return <F16Symbol className={className} mono />;
}

export function Logo({ href = "/", suffix, size = 28 }: { href?: string; suffix?: string; size?: number }) {
  return (
    <Link href={href} className="flex items-center" aria-label="F16 Arena — главная">
      <F16Logo size={size} suffix={suffix} />
    </Link>
  );
}

export const NAV = [
  { href: "/tournaments", label: "Турниры" },
  { href: "/teams", label: "Команды" },
  { href: "/matches", label: "Матчи" },
  { href: "/stats", label: "Статистика" },
];

export async function SiteHeader() {
  const player = await getCurrentPlayer();
  const unread = player ? await getUnreadCount(player.id) : 0;
  const admin = isAdmin(player);
  const mobileItems = [
    ...NAV,
    { href: "/players", label: "Игроки" },
    { href: "/rules", label: "Правила" },
    ...(admin ? [{ href: "/admin", label: "F16 Control" }] : []),
  ];

  return (
    <HeaderShell>
      <Container className="flex h-[68px] items-center gap-10">
        <Logo />
        <NavLinks items={NAV} />
        <div className="ml-auto flex items-center gap-1.5">
          {admin && (
            <Link
              href="/admin"
              className="hidden md:inline-flex h-9 px-3 items-center rounded-lg text-[13px] text-fg-3 hover:text-fg transition"
            >
              Control
            </Link>
          )}
          {player ? (
            <>
              <Link
                href="/notifications"
                className="relative grid place-items-center size-9 rounded-lg text-fg-3 hover:text-fg hover:bg-white/[0.04] transition"
                aria-label="Уведомления"
              >
                <IconBell className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" />
                )}
              </Link>
              <Link href="/me" className="flex items-center gap-2.5 h-9 pl-1 pr-2.5 rounded-full hover:bg-white/[0.04] transition">
                <Avatar src={player.avatar_url} name={player.nickname} size={28} />
                <span className="hidden sm:block text-sm font-medium max-w-[140px] truncate">{player.nickname}</span>
              </Link>
            </>
          ) : (
            <ButtonLink href="/login" variant="secondary" size="sm" className="h-9 px-3.5">
              <IconSteam />
              Войти
            </ButtonLink>
          )}
          <MobileMenu items={mobileItems} />
        </div>
      </Container>
    </HeaderShell>
  );
}

export function SiteFooter() {
  return (
    <PublicOnly>
      <footer className="mt-20 border-t border-line">
        <Container className="py-12 flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-fg-3 leading-relaxed">Соревновательная платформа для CS2.</p>
          </div>
          <nav className="grid grid-cols-2 sm:grid-cols-3 gap-x-14 gap-y-3 text-sm text-fg-2">
            <Link href="/tournaments" className="hover:text-fg">Турниры</Link>
            <Link href="/teams" className="hover:text-fg">Команды</Link>
            <Link href="/matches" className="hover:text-fg">Матчи</Link>
            <Link href="/players" className="hover:text-fg">Игроки</Link>
            <Link href="/stats" className="hover:text-fg">Статистика</Link>
            <Link href="/rules" className="hover:text-fg">Правила</Link>
            <Link href="/about" className="hover:text-fg">О платформе</Link>
            <a href="https://f16-arena.kz" className="hover:text-fg">f16-arena.kz</a>
          </nav>
        </Container>
        <Container className="pb-10 text-xs text-fg-3 flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} F16 Arena</span>
          <span>Не аффилировано с Valve Corporation</span>
        </Container>
      </footer>
    </PublicOnly>
  );
}
