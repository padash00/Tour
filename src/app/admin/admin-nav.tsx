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
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "h-9 px-3 inline-flex items-center rounded-lg text-sm whitespace-nowrap transition",
              active ? "bg-white/[0.05] text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
