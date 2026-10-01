import Link from "next/link";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { Avatar, ButtonLink, Container, IconBell, IconSteam } from "./ui";
import { NavLinks, MobileMenu } from "./nav-links";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="F16 Arena — главная">
      <span className="relative grid place-items-center h-8 px-2 rounded-lg bg-fg text-bg font-black tracking-[-0.04em] text-[15px] leading-none">
        F16
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warm ring-2 ring-bg" />
      </span>
      <span className="font-semibold tracking-[0.18em] text-[12px] text-fg-2 group-hover:text-fg transition-colors">
        ARENA
      </span>
    </Link>
  );
}

export const NAV = [
  { href: "/tournaments", label: "Турниры" },
  { href: "/teams", label: "Команды" },
  { href: "/players", label: "Игроки" },
  { href: "/stats", label: "Статистика" },
  { href: "/rules", label: "Правила" },
];

export async function SiteHeader() {
  const player = await getCurrentPlayer();
  const unread = player ? await getUnreadCount(player.id) : 0;
  const admin = isAdmin(player);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <Container className="flex h-16 items-center gap-8">
        <Logo />
        <NavLinks items={admin ? [...NAV, { href: "/admin", label: "Админ" }] : NAV} />
        <div className="ml-auto flex items-center gap-2">
          {player ? (
            <>
              <Link
                href="/me#notifications"
                className="relative grid place-items-center size-9 rounded-lg text-fg-3 hover:text-fg hover:bg-white/[0.04] transition"
                aria-label="Уведомления"
              >
                <IconBell className="size-[18px]" />
                {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-bg" />}
              </Link>
              <Link
                href="/me"
                className="flex items-center gap-2.5 h-9 pl-1 pr-3 rounded-lg hover:bg-white/[0.04] transition"
              >
                <Avatar src={player.avatar_url} name={player.nickname} size={28} />
                <span className="hidden sm:block text-sm font-medium max-w-[140px] truncate">{player.nickname}</span>
              </Link>
            </>
          ) : (
            <ButtonLink href="/login" variant="secondary" size="sm" className="h-9 px-3.5">
              <IconSteam />
              Войти через Steam
            </ButtonLink>
          )}
          <MobileMenu items={admin ? [...NAV, { href: "/admin", label: "Админ" }] : NAV} />
        </div>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-fg-3 leading-relaxed">
            Турнирная платформа F16 Arena для соревнований по CS2. Реальные серверы, честная статистика.
          </p>
        </div>
        <div>
          <div className="label mb-4">Платформа</div>
          <ul className="space-y-2.5 text-sm text-fg-2">
            <li><Link href="/tournaments" className="hover:text-fg">Турниры</Link></li>
            <li><Link href="/teams" className="hover:text-fg">Команды</Link></li>
            <li><Link href="/players" className="hover:text-fg">Игроки</Link></li>
            <li><Link href="/stats" className="hover:text-fg">Статистика</Link></li>
          </ul>
        </div>
        <div>
          <div className="label mb-4">Участникам</div>
          <ul className="space-y-2.5 text-sm text-fg-2">
            <li><Link href="/team/create" className="hover:text-fg">Создать команду</Link></li>
            <li><Link href="/rules" className="hover:text-fg">Правила и FAQ</Link></li>
            <li><Link href="/about" className="hover:text-fg">О платформе</Link></li>
          </ul>
        </div>
        <div>
          <div className="label mb-4">F16</div>
          <ul className="space-y-2.5 text-sm text-fg-2">
            <li><a href="https://f16-arena.kz" className="hover:text-fg">f16-arena.kz</a></li>
          </ul>
        </div>
      </Container>
      <Container className="py-6 border-t border-line text-xs text-fg-3 flex flex-wrap justify-between gap-2">
        <span>© {new Date().getFullYear()} F16 Arena</span>
        <span>Не аффилировано с Valve Corporation</span>
      </Container>
    </footer>
  );
}
