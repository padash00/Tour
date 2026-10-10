"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

/*
 * Оболочка F16 Control: узкая иконочная панель слева (раскрывается по наведению или закрепляется),
 * командная строка сверху (хлебные крошки, поиск Ctrl+K, глобальный статус).
 */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<string, ReactNode> = {
  overview: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  ),
  tournaments: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 6H4.5v1.2A3 3 0 0 0 7.5 10M16.5 6h3v1.2a3 3 0 0 1-3 3M12 13.5V17M8.5 20h7" />
    </svg>
  ),
  matches: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <path d="M4 7h6M4 17h6M10 7v10M10 12h4M14 12h6" />
    </svg>
  ),
  servers: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" strokeWidth="2.4" />
    </svg>
  ),
  teams: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="16.5" cy="9" r="2.6" />
      <path d="M17 14c2.3.3 3.7 1.9 4 4.5" />
    </svg>
  ),
  players: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="m7.5 9 3 3-3 3M12.5 15h4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className="size-[19px]" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </svg>
  ),
};

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Обзор", short: "Обзор", icon: "overview", exact: true },
  { href: "/admin/tournaments", label: "Турниры", short: "Турниры", icon: "tournaments" },
  { href: "/admin/matches", label: "Матчи", short: "Матчи", icon: "matches" },
  { href: "/admin/servers", label: "Серверы", short: "Серверы", icon: "servers" },
  { href: "/admin/teams", label: "Команды", short: "Команды", icon: "teams" },
  { href: "/admin/players", label: "Игроки", short: "Игроки", icon: "players" },
  { href: "/admin/logs", label: "Журнал", short: "Журнал", icon: "logs" },
  { href: "/admin/settings", label: "Настройки", short: "Настр.", icon: "settings" },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

// ───────────────────────── иконочная панель

export function AdminRail({ logo, profile }: { logo: ReactNode; profile: ReactNode }) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("f16-control-rail") === "1";
      if (v) queueMicrotask(() => setPinned(true));
    } catch {}
  }, []);
  const toggle = () => {
    setPinned((v) => {
      try {
        localStorage.setItem("f16-control-rail", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  return (
    <>
      {/* десктоп: рельс */}
      <aside
        className={cn(
          "group/rail hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-[#16222f] bg-[#060a11] transition-[width] duration-200",
          pinned ? "w-[232px]" : "w-[76px] hover:w-[232px] hover:shadow-[24px_0_48px_-24px_#000]",
        )}
        data-pinned={pinned}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-[#16222f] px-[22px]">{logo}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Разделы F16 Control">
          {ADMIN_SECTIONS.map((s) => {
            const active = isActive(pathname, s.href, "exact" in s && s.exact);
            return (
              <Link
                key={s.href}
                href={s.href}
                title={s.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3.5 overflow-hidden rounded-[8px] px-[15px] text-[13px] transition-colors",
                  active ? "bg-accent/[0.1] text-fg" : "text-fg-3 hover:bg-white/[0.04] hover:text-fg",
                )}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
                <span className={cn("shrink-0", active && "text-accent")}>{ICONS[s.icon]}</span>
                <span
                  className={cn(
                    "whitespace-nowrap transition-opacity duration-150",
                    pinned ? "opacity-100" : "opacity-0 group-hover/rail:opacity-100",
                  )}
                >
                  {s.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-[#16222f] p-3">
          {profile}
          <button
            type="button"
            onClick={toggle}
            className="flex h-9 w-full items-center gap-3.5 overflow-hidden rounded-[8px] px-[15px] text-[12px] text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg"
            aria-pressed={pinned}
          >
            <svg viewBox="0 0 24 24" className={cn("size-[19px] shrink-0 transition-transform", pinned && "rotate-180")} {...stroke}>
              <path d="m10 7 5 5-5 5" />
            </svg>
            <span className={cn("whitespace-nowrap", pinned ? "opacity-100" : "opacity-0 group-hover/rail:opacity-100")}>
              {pinned ? "Свернуть панель" : "Закрепить панель"}
            </span>
          </button>
        </div>
      </aside>
      {/* отступ под рельс */}
      <div className={cn("hidden lg:block shrink-0 transition-[width] duration-200", pinned ? "w-[232px]" : "w-[76px]")} aria-hidden />
    </>
  );
}

/** Мобильная навигация F16 Control — лента иконок под командной строкой */
export function AdminMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden flex gap-1 overflow-x-auto border-b border-[#16222f] bg-[#060a11] px-3 py-2 [scrollbar-width:none]" aria-label="Разделы F16 Control">
      {ADMIN_SECTIONS.map((s) => {
        const active = isActive(pathname, s.href, "exact" in s && s.exact);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-[8px] px-2 py-2 text-[10px]",
              active ? "bg-accent/[0.1] text-accent" : "text-fg-3",
            )}
          >
            {ICONS[s.icon]}
            {s.short}
          </Link>
        );
      })}
    </nav>
  );
}

// ───────────────────────── командная строка

const SEGMENT_LABEL: Record<string, string> = {
  tournaments: "Турниры",
  matches: "Матчи",
  servers: "Серверы",
  teams: "Команды",
  players: "Игроки",
  logs: "Журнал",
  settings: "Настройки",
  new: "Новый",
};

export function AdminCrumbs({ names }: { names: Record<string, string> }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(1);
  const crumbs = [{ href: "/admin", label: "Control" }];
  let acc = "/admin";
  for (const p of parts) {
    acc += `/${p}`;
    crumbs.push({ href: acc, label: SEGMENT_LABEL[p] ?? names[p] ?? (p.length > 12 ? `${p.slice(0, 8)}…` : p) });
  }
  return (
    <nav aria-label="Путь" className="flex min-w-0 items-center gap-2 text-[13px]">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span className="text-fg-3/60">/</span>}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-fg">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-fg-3 hover:text-fg">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export type PaletteItem = { href: string; label: string; hint?: string; group: string };

/** Быстрый переход: Ctrl+K / ⌘K — разделы, турниры, матчи по номеру */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo(
    (): PaletteItem[] => [...ADMIN_SECTIONS.map((s) => ({ href: s.href, label: s.label, group: "Разделы" })), ...items],
    [items],
  );
  const results = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    if (!s) return all.slice(0, 12);
    return all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(s)).slice(0, 14);
  }, [q, all]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setQ("");
        setIdx(0);
        input.current?.focus();
      });
    }
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex h-9 w-[260px] items-center gap-2.5 rounded-control border border-line-strong bg-shell px-3 text-[13px] text-fg-3 transition-colors hover:border-line-hover hover:text-fg-2"
      >
        <svg viewBox="0 0 24 24" className="size-4" {...stroke}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        Перейти к…
        <span className="ml-auto flex gap-1">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden grid size-9 place-items-center rounded-[8px] border border-[#1a2838] text-fg-3"
        aria-label="Поиск"
      >
        <svg viewBox="0 0 24 24" className="size-4" {...stroke}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Быстрый переход"
            className="w-full max-w-[600px] overflow-hidden rounded-surface border border-line bg-surface shadow-[0_30px_80px_-20px_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[#1a2838] px-4">
              <svg viewBox="0 0 24 24" className="size-[18px] text-fg-3" {...stroke}>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results[idx]) {
                    go(results[idx].href);
                  }
                }}
                placeholder="Раздел, турнир или матч #12…"
                className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
              />
              <kbd className="kbd">Esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-2">
              {results.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-fg-3">Ничего не найдено</li>}
              {results.map((r, i) => (
                <li key={`${r.group}${r.href}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => go(r.href)}
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px]", i === idx ? "bg-accent/[0.1] text-fg" : "text-fg-2")}
                  >
                    <span className="w-20 shrink-0 text-[12px] font-medium text-fg-3">{r.group}</span>
                    <span className="truncate">{r.label}</span>
                    {r.hint && <span className="ml-auto shrink-0 font-mono text-[12px] text-fg-3">{r.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
