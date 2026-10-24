"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Gauge, LayoutGrid, MonitorPlay, ScrollText, Search, Server, Settings, Shield, Swords, Trophy, User, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";


/*
 * Оболочка F16 Control в стиле сайта: боковое меню с подписями и группами («Сейчас идёт», «Подготовка», «Система»),
 * сверху — путь, поиск (Ctrl+K) и состояние площадки словами.
 */

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  tournaments: Trophy,
  matches: Swords,
  board: MonitorPlay,
  servers: Server,
  teams: Shield,
  players: User,
  logs: ScrollText,
  settings: Settings,
};

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Главная пульта", short: "Главная", icon: "overview", hint: "что происходит сейчас", group: "Сейчас идёт", exact: true },
  { href: "/admin/matches", label: "Матчи", short: "Матчи", icon: "matches", hint: "счёт, вето, серверы", group: "Сейчас идёт" },
  { href: "/admin/servers", label: "Серверы", short: "Серверы", icon: "servers", hint: "включить, перезапустить", group: "Сейчас идёт" },
  { href: "/admin/board", label: "Табло турнира", short: "Табло", icon: "board", hint: "для экрана в клубе", group: "Сейчас идёт" },
  { href: "/admin/tournaments", label: "Турниры", short: "Турниры", icon: "tournaments", hint: "создать, заявки, сетка", group: "Подготовка" },
  { href: "/admin/teams", label: "Команды", short: "Команды", icon: "teams", hint: "составы и капитаны", group: "Подготовка" },
  { href: "/admin/players", label: "Игроки", short: "Игроки", icon: "players", hint: "поиск, права, баны", group: "Подготовка" },
  { href: "/admin/logs", label: "Журнал", short: "Журнал", icon: "logs", hint: "кто что сделал, ошибки", group: "Система" },
  { href: "/admin/settings", label: "Настройки", short: "Настройки", icon: "settings", hint: "сайт, карты, правила", group: "Система" },
] as const;

const GROUPS = ["Сейчас идёт", "Подготовка", "Система"] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

// ───────────────────────── боковое меню

export function AdminRail({ logo, profile }: { logo: ReactNode; profile: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col gap-5 overflow-y-auto border-r border-line-subtle bg-shell px-3.5 py-4 lg:flex" aria-label="Разделы пульта">
        <div className="px-2 pt-1">{logo}</div>
        {GROUPS.map((g) => (
          <nav key={g} className="flex flex-col gap-0.5" aria-label={g}>
            <div className="px-3 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-fg-4">{g}</div>
            {ADMIN_SECTIONS.filter((s) => s.group === g).map((s) => {
              const active = isActive(pathname, s.href, "exact" in s && s.exact);
              const Icon = ICONS[s.icon] ?? Gauge;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-[var(--dur-hover)]",
                    active ? "bg-accent-dim text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-[22px] shrink-0", active ? "text-accent" : "text-fg-3")} />
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-semibold leading-tight">{s.label}</span>
                    <span className="block truncate text-[12.5px] leading-snug text-fg-3">{s.hint}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        ))}
        <div className="flex-1" />
        <div className="space-y-2">
          {profile}
          <Link
            href="/"
            className="flex h-11 items-center justify-center gap-2 rounded-control bg-surface-2 text-[14px] font-semibold text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-subtle)] transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-4" />
            Вернуться на сайт
          </Link>
        </div>
      </aside>
      <div className="hidden w-[264px] shrink-0 lg:block" aria-hidden />
    </>
  );
}

/** Мобильная навигация пульта — лента разделов с подписями под шапкой */
export function AdminMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-line-subtle bg-shell px-3 py-2 [scrollbar-width:none] lg:hidden" aria-label="Разделы пульта">
      {ADMIN_SECTIONS.map((s) => {
        const active = isActive(pathname, s.href, "exact" in s && s.exact);
        const Icon = ICONS[s.icon] ?? Gauge;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-w-[76px] shrink-0 flex-col items-center gap-1 rounded-control px-2 py-2 text-[12px] font-bold", active ? "bg-accent-dim text-accent" : "text-fg-3")}
          >
            <Icon className="size-5" />
            {s.short}
          </Link>
        );
      })}
    </nav>
  );
}

/** Состояние площадки словами — в шапке каждой страницы пульта */
export function VenueStatus({ online, lastSync, busy, total, live }: { online: boolean; lastSync: number | null; busy: number; total: number; live: number }) {
  const chip = "inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold whitespace-nowrap";
  return (
    <Link href="/admin/servers" className="flex items-center gap-2" title="Открыть серверы">
      <span className={cn(chip, online ? "bg-ok-dim text-ok" : "bg-danger-dim text-danger")}>
        <span className={cn("size-2 rounded-full", online ? "bg-ok" : "animate-pulse bg-danger")} />
        {online ? "Серверный ПК на связи" : "Серверный ПК не отвечает"}
        {online && lastSync != null && lastSync > 30 && <span className="font-normal opacity-75">· {lastSync < 120 ? `${lastSync} с` : `${Math.round(lastSync / 60)} мин`}</span>}
      </span>
      <span className={cn(chip, "hidden bg-ink/[0.05] text-fg-2 xl:inline-flex")}>
        <Server className="size-4 text-fg-3" />
        Занято серверов: {busy} из {total}
      </span>
      <span className={cn(chip, live ? "bg-danger-dim text-live" : "hidden bg-ink/[0.05] text-fg-3 sm:inline-flex")}>
        <Activity className="size-4" />
        {live ? `Идёт матчей: ${live}` : "Матчей нет"}
      </span>
    </Link>
  );
}

// ───────────────────────── командная строка

const SEGMENT_LABEL: Record<string, string> = {
  tournaments: "Турниры",
  matches: "Матчи",
  board: "Табло",
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
  const crumbs = [{ href: "/admin", label: "Пульт" }];
  let acc = "/admin";
  for (const p of parts) {
    acc += `/${p}`;
    crumbs.push({ href: acc, label: SEGMENT_LABEL[p] ?? names[p] ?? (p.length > 12 ? `${p.slice(0, 8)}…` : p) });
  }
  return (
    <nav aria-label="Путь" className="flex min-w-0 items-center gap-2 text-[14.5px]">
      {crumbs.map((c, i) => (
        <span key={c.href} className={cn("flex items-center gap-2", i === crumbs.length - 1 ? "min-w-0" : "shrink-0")}>
          {i > 0 && <span className="text-fg-3/60">/</span>}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-semibold text-fg">{c.label}</span>
          ) : (
            <Link href={c.href} className="whitespace-nowrap text-fg-3 hover:text-fg">
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
        className="hidden h-10 w-[240px] items-center gap-2.5 rounded-control border border-line bg-surface px-3 text-[14px] text-fg-3 transition-colors hover:border-line-hover hover:text-fg-2 md:flex"
      >
        <Search className="size-4" />
        Поиск
        <span className="ml-auto flex gap-1">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-control border border-line text-fg-3 md:hidden"
        aria-label="Поиск"
      >
        <Search className="size-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-overlay px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Быстрый переход"
            className="w-full max-w-[600px] overflow-hidden rounded-surface bg-elevated shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-surface-3 px-4">
              <Search className="size-[18px] text-fg-3" />
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
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px]", i === idx ? "bg-accent-dim text-fg" : "text-fg-2")}
                  >
                    <span className="w-20 shrink-0 text-[12px] font-medium text-fg-3">{r.group}</span>
                    <span className="truncate">{r.label}</span>
                    {r.hint && <span className="ml-auto shrink-0 text-[13px] text-fg-3">{r.hint}</span>}
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
