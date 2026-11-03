import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { MobileTabBar, ShellFrame, SiteSidebar } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/toast";
import { RouteTransition } from "@/components/route-transition";
import { NavProgress } from "@/components/nav-progress";
import { ProfileNudge } from "@/components/profile/profile-nudge";
import { RulesAckModal } from "@/components/rules-gate";
import { TelegramChatGate } from "@/components/telegram-chat-gate";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/site";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/seo";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n/core";
import "./globals.css";

// Inter Tight — чёткий гротеск с кириллицей: весь интерфейс
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// адреса серверов и коды
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// заголовок вкладки — на языке страницы; описания для поисковиков остаются русскими
export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLang());
  return { ...BASE_METADATA, title: { default: t("Турниры по CS2 в Усть-Каменогорске — F16 Arena"), template: "%s · F16 Arena" } };
}

const BASE_METADATA: Metadata = {
  metadataBase: new URL(SITE_URL),
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "esports",
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ru_RU", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
  // автоперевод браузера ломает React-страницы (insertBefore/removeChild); у сайта свой переключатель ҚАЗ/РУС
  other: { google: "notranslate" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  // коды подтверждения Google Search Console и Яндекс.Вебмастера — переменные окружения в Vercel
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

/** Обычный ES5 без зависимостей: должен выполниться даже там, где основной код сайта не запускается */
const OLD_BROWSER_NOTICE = `(function(){try{
var ok=window.CSS&&CSS.supports&&CSS.supports("color","color-mix(in srgb, red, blue)");
if(ok)return;
var d=document.createElement("div");
d.setAttribute("role","alert");
d.style.cssText="position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#5f9a00;color:#fff;font:600 16px/1.4 -apple-system,system-ui,sans-serif;padding:14px 16px;text-align:center";
d.innerHTML="Ваш браузер устарел — сайт может работать неправильно.<br>Обновите iPhone: Настройки → Основные → Обновление ПО, или откройте сайт в Chrome.";
(document.body||document.documentElement).appendChild(d);
}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  const t = makeT(lang);
  return (
    <html lang={lang} translate="no" className={`notranslate ${interTight.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {/* Очень старый браузер (iOS < 16.2): стили сайта ему не по силам — сразу говорим, что делать */}
        <script dangerouslySetInnerHTML={{ __html: OLD_BROWSER_NOTICE }} />
        <LangProvider lang={lang}>
        <ToastProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          <a
            href="#main-content"
            className="fixed left-3 top-3 z-[200] -translate-y-20 rounded-control bg-accent px-4 py-2 text-[14px] font-semibold text-accent-ink shadow-[var(--shadow-pop)] transition-transform focus:translate-y-0"
          >
            {t("Перейти к содержимому")}
          </a>
          <SiteSidebar />
          <ShellFrame>
            <SiteHeader />
            <ProfileNudge />
            <RulesAckModal />
            <TelegramChatGate />
            {/* anim-in — только при первой загрузке: main не пересоздаётся ни при переходах, ни при живом обновлении */}
            <main id="main-content" tabIndex={-1} className="flex-1 anim-in">
              <RouteTransition>{children}</RouteTransition>
            </main>
            <SiteFooter />
          </ShellFrame>
          <MobileTabBar />
        </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
