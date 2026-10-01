import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "cyrillic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "F16 Arena — турниры по CS2", template: "%s · F16 Arena" },
  description: "Турнирная платформа F16 Arena: регистрация через Steam, команды, сетки, матчи и статистика CS2.",
  applicationName: "F16 Arena",
  openGraph: { type: "website", siteName: "F16 Arena", locale: "ru_RU" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${interTight.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
