import Link from "next/link";
import { BrandLogo } from "./brand";
import { HeaderUser } from "./header-user";
import { HeaderShell, PublicOnly } from "./nav-links";
import { SECONDARY_NAV } from "./shell/nav";
import { MobileActivityBar } from "./shell/activity";

/** Логотип-ссылка на главную: утверждённый горизонтальный логотип */
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Link href="/" className="flex shrink-0 items-center rounded-control" aria-label="F16 Arena — главная">
      <BrandLogo height={height} priority />
    </Link>
  );
}

/**
 * Верхняя строка (64 px, --header-h): поиск · уведомления · профиль. Разделы — в боковом меню (shell/sidebar),
 * на телефоне — в нижней панели; там же в строке логотип.
 * Одинакова для всех (страницы кэшируются CDN) — персональная правая часть подгружается на клиенте.
 */
export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="flex h-[var(--header-h)] w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        <span className="lg:hidden">
          <Logo height={26} />
        </span>
        <HeaderUser />
      </div>
      {/* на телефоне срочное действие — отдельной строкой под шапкой (на десктопе — внутри шапки) */}
      <MobileActivityBar />
    </HeaderShell>
  );
}

/** Подвал: одна строка — логотип, кто мы, год и второстепенные ссылки (разделы — в боковом меню и нижней панели) */
export function SiteFooter() {
  return (
    <PublicOnly>
      <footer className="mt-12 border-t border-line-subtle bg-shell">
        <div className="flex flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Logo height={22} />
            <span className="text-meta text-fg-3">Турниры и лобби по CS2 на серверах клуба F16 Arena · © {new Date().getFullYear()}</span>
          </div>
          <nav aria-label="Помощь" className="flex flex-wrap gap-x-5 gap-y-1">
            {SECONDARY_NAV.map((i) => (
              <Link key={i.href} href={i.href} className="inline-flex min-h-9 items-center text-[14px] text-fg-3 transition-colors hover:text-fg">
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </PublicOnly>
  );
}
