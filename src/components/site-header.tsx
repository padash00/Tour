import Link from "next/link";
import { BrandLogo } from "./brand";
import { HeaderUser } from "./header-user";
import { HeaderShell, PrimaryNav, PublicOnly } from "./nav-links";
import { PRIMARY_NAV, SECONDARY_NAV } from "./shell/nav";

/** Логотип-ссылка на главную: утверждённый горизонтальный логотип */
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Link href="/" className="flex shrink-0 items-center rounded-control" aria-label="F16 Arena — главная">
      <BrandLogo height={height} priority />
    </Link>
  );
}

/**
 * Шапка продукта: 56 px на телефоне, 64 px на десктопе (--header-h).
 * Логотип · основное меню · [поиск · глобальная активность · уведомления · профиль].
 * Одинакова для всех (страницы кэшируются CDN) — персональная правая часть подгружается на клиенте.
 */
export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="mx-auto flex h-[var(--header-h)] w-full max-w-product items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Logo height={34} />
        <PrimaryNav />
        <HeaderUser />
      </div>
    </HeaderShell>
  );
}

/** Подвал: разделы продукта и второстепенное — о платформе, правила, FAQ */
export function SiteFooter() {
  return (
    <PublicOnly>
      <footer className="mt-24 border-t border-line-subtle bg-shell">
        <div className="mx-auto grid w-full max-w-product gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto_auto] md:gap-16 lg:px-8">
          <div className="flex flex-col gap-4">
            <Logo height={40} />
            <p className="max-w-xs text-meta text-fg-3">Турниры и лобби по CS2 на серверах клуба F16 Arena.</p>
            <span className="text-micro text-fg-4">© {new Date().getFullYear()} F16 Arena</span>
          </div>
          <nav aria-label="Разделы">
            <div className="mb-3 text-meta font-medium text-fg-2">Разделы</div>
            <ul className="space-y-1">
              {PRIMARY_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="inline-flex min-h-9 items-center text-[14px] text-fg-3 transition-colors hover:text-fg">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Помощь">
            <div className="mb-3 text-meta font-medium text-fg-2">Ещё</div>
            <ul className="space-y-1">
              {SECONDARY_NAV.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="inline-flex min-h-9 items-center text-[14px] text-fg-3 transition-colors hover:text-fg">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </PublicOnly>
  );
}
