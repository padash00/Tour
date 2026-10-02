"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * Вкладки страниц пульта (переход по ?tab=). Подчёркивание переезжает на нажатую вкладку сразу,
 * не дожидаясь ответа сервера, — клик чувствуется мгновенно.
 */
export function SubTabs({ items, active }: { items: { key: string; label: ReactNode; href: string }[]; active: string }) {
  // нажатая вкладка, пока сервер не прислал новую; запоминаем, с какой ушли — потом сбрасывается само
  const [pending, setPending] = useState<{ key: string; from: string } | null>(null);
  const current = pending && pending.from === active ? pending.key : active;
  return (
    <div className="flex gap-6 border-b border-white/[0.06] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          onClick={() => t.key !== active && setPending({ key: t.key, from: active })}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "relative h-11 inline-flex items-center rounded-sm text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            t.key === current ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {t.label}
          <span
            className={cn(
              "absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent transition-[opacity,transform] duration-200",
              t.key === current ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50",
            )}
          />
        </Link>
      ))}
    </div>
  );
}
