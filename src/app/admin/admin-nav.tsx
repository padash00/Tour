"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Обзор", exact: true },
  { href: "/admin/tournaments", label: "Турниры" },
  { href: "/admin/matches", label: "Матчи" },
  { href: "/admin/servers", label: "Серверы" },
  { href: "/admin/teams", label: "Команды" },
  { href: "/admin/players", label: "Игроки" },
  { href: "/admin/logs", label: "Журнал" },
  { href: "/admin/settings", label: "Настройки" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex lg:flex-col gap-0.5 overflow-x-auto">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "relative h-9 px-3 inline-flex items-center rounded-md text-[13px] whitespace-nowrap transition",
              active ? "bg-white/[0.06] text-fg" : "text-fg-3 hover:text-fg-2 hover:bg-white/[0.03]",
            )}
          >
            {active && <span className="hidden lg:block absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent" />}
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
