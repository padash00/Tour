import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Onest } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";
import { RouteTransition } from "@/components/route-transition";
import { NavProgress } from "@/components/nav-progress";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/site";
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
  title: { default: "F16 Arena — турниры по CS2", template: "%s · F16 Arena" },
  description: "Турнирная платформа F16 Arena: регистрация через Steam, команды, сетки, матчи и статистика CS2.",
  applicationName: "F16 Arena",
  openGraph: { type: "website", siteName: "F16 Arena", locale: "ru_RU" },
  twitter: { card: "summary_large_image" },
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
