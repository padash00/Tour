import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Onest } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";
import { RouteTransition } from "@/components/route-transition";
import { NavProgress } from "@/components/nav-progress";
import { ProfileNudge } from "@/components/profile/profile-nudge";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/site";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/seo";
import "./globals.css";

// Onest — гротеск с полноценной кириллицей: интерфейс и заголовки
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// цифры: счёт, ELO, порты, время — табличные
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Турниры по CS2 в Усть-Каменогорске — F16 Arena", template: "%s · F16 Arena" },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "esports",
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ru_RU", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  // коды подтверждения Google Search Console и Яндекс.Вебмастера — переменные окружения в Vercel
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          <a
            href="#main-content"
            className="fixed left-3 top-3 z-[200] -translate-y-20 rounded-control bg-accent px-4 py-2 text-[14px] font-semibold text-accent-ink shadow-[var(--shadow-pop)] transition-transform focus:translate-y-0"
          >
            Перейти к содержимому
          </a>
          <SiteHeader />
          <ProfileNudge />
          {/* anim-in — только при первой загрузке: main не пересоздаётся ни при переходах, ни при живом обновлении */}
          <main id="main-content" tabIndex={-1} className="flex-1 anim-in">
            <RouteTransition>{children}</RouteTransition>
          </main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
