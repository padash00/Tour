import Link from "next/link";
import { BrandLogo } from "./brand";
import { HeaderUser } from "./header-user";
import { HeaderShell, NavLinks, PublicOnly } from "./nav-links";

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
  { href: "/find", label: "Поиск команды" },
];

/** Шапка одинакова для всех (страницы кэшируются CDN); профиль справа подгружается на клиенте */
export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center px-5 sm:px-8 lg:h-[96px] lg:px-16">
        <Logo height={58} />
        <NavLinks items={NAV} more={NAV_MORE} />
        <div className="ml-auto flex items-center gap-2">
          <HeaderUser items={[...NAV, ...NAV_MORE]} />
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
            <nav className="flex flex-wrap gap-x-9 gap-y-0 text-[13px] text-fg-2 md:ml-auto md:gap-y-3 lg:gap-x-12 lg:text-[14px]" aria-label="Подвал">
              {[...NAV, ...NAV_MORE].map((i) => (
                <Link key={i.href} href={i.href} className="inline-flex min-h-11 items-center transition-colors duration-150 hover:text-fg md:min-h-0">
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
