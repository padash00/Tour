"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./cn";

/*
 * Локальная навигация объекта (турнир, команда, матч): Обзор · Состав · Матчи …
 * Не путать с главным меню сайта. На телефоне прокручивается по горизонтали.
 * Активный пункт: по пути (match="path") или по ?tab= (match="tab").
 */
export type NavItem = { key: string; label: ReactNode; href: string; count?: number };

export function ContextNav({ items, match = "path", sticky, className }: { items: NavItem[]; match?: "path" | "tab"; sticky?: boolean; className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab");
  const isActive = (it: NavItem, i: number) => (match === "tab" ? (tab ? tab === it.key : i === 0) : pathname === it.href.split("?")[0]);
  return (
    <nav className={cn("border-b border-line-subtle", sticky && "sticky top-[var(--header-h)] z-30 bg-bg/90 backdrop-blur-md", className)}>
      <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => {
          const active = isActive(it, i);
          return (
            <Link
              key={it.key}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors duration-[var(--dur-hover)]",
                active ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {it.label}
              {it.count != null && <span className="num rounded-chip bg-white/[0.06] px-1.5 py-px text-micro text-fg-2">{it.count}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
