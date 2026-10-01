"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, cn } from "./ui";

type Item = { href: string; label: string };

function isActive(pathname: string, href: string) {
  const path = href.split("#")[0];
  return pathname === path || pathname.startsWith(path + "/");
}

/** Публичная обёртка не нужна в F16 Control — там своя оболочка */
export function PublicOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <>{children}</>;
}

/** Шапка: прозрачная поверх hero на главной, плотная после прокрутки и на остальных страницах */
export function HeaderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (pathname.startsWith("/admin")) return null;
  // на главной шапка лежит поверх фото hero
  const overHero = pathname === "/" && !scrolled;
  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-200",
        overHero ? "bg-transparent border-b border-transparent" : "bg-bg/80 backdrop-blur-xl backdrop-saturate-150 border-b border-line",
      )}
    >
      {children}
    </header>
  );
}

// ───────────────────────── выпадающие меню

/** Закрытие по клику снаружи и по Esc */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MENU_PANEL =
  "absolute right-0 top-full mt-2 min-w-[240px] overflow-hidden rounded-[12px] border border-white/[0.1] bg-surface-2/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-xl animate-[menu-in_.16s_cubic-bezier(.2,.8,.2,1)] origin-top-right";

const MENU_ITEM =
  "flex h-10 items-center gap-3 rounded-[8px] px-3 text-[14px] text-fg-2 transition-colors duration-100 hover:bg-white/[0.06] hover:text-fg";

export function NavLinks({ items, more = [] }: { items: Item[]; more?: Item[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const moreActive = more.some((m) => isActive(pathname, m.href));

  return (
    <nav className="hidden md:flex items-center gap-8 lg:gap-10 ml-12 lg:ml-[120px]" aria-label="Основное меню">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative h-[72px] lg:h-[96px] inline-flex items-center text-[14px] lg:text-[16px] transition-colors duration-150",
              active ? "text-fg" : "text-fg/75 hover:text-fg",
            )}
          >
            {item.label}
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent transition-[opacity,transform] duration-200",
                active ? "opacity-100" : "opacity-0 scale-x-50 group-hover:opacity-40 group-hover:scale-x-100",
              )}
            />
          </Link>
        );
      })}

      {more.length > 0 && (
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-[8px] px-2 text-[14px] lg:text-[16px] transition-colors duration-150",
              open || moreActive ? "text-fg" : "text-fg/75 hover:text-fg",
            )}
          >
            Ещё
            <Chevron open={open} />
          </button>
          {open && (
            <div role="menu" className={cn(MENU_PANEL, "left-0 right-auto origin-top-left min-w-[200px]")}>
              {more.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(MENU_ITEM, isActive(pathname, m.href) && "bg-white/[0.04] text-fg")}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

type UserInfo = { nickname: string; avatar: string | null; unread: number; admin: boolean };

const USER_LINKS = (u: UserInfo) => [
  { href: "/me", label: "Профиль" },
  { href: "/team", label: "Моя команда" },
  { href: "/notifications", label: "Уведомления", badge: u.unread },
  ...(u.admin ? [{ href: "/admin", label: "F16 Control" }] : []),
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink num">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Аватар в шапке → меню: профиль, команда, уведомления, F16 Control, выход */
export function UserMenu({ user }: { user: UserInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-[9px] border pl-1.5 pr-2.5 transition-colors duration-150",
          open ? "border-white/30 bg-white/[0.05]" : "border-white/[0.14] bg-white/[0.02] hover:border-white/30",
        )}
      >
        <span className="relative">
          <Avatar src={user.avatar} name={user.nickname} size={30} />
          {user.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-bg" />}
        </span>
        <span className="max-w-[140px] truncate text-[14px] font-medium">{user.nickname}</span>
        <span className="text-fg-3">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div role="menu" className={MENU_PANEL}>
          <div className="px-3 pb-2 pt-1.5">
            <div className="truncate text-[14px] font-semibold text-fg">{user.nickname}</div>
            <div className="text-[12px] text-fg-3">{user.admin ? "Администратор" : "Игрок F16 Arena"}</div>
          </div>
          <div className="my-1 h-px bg-white/[0.06]" />
          {USER_LINKS(user).map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className={MENU_ITEM}>
              {l.label}
              {"badge" in l && <Badge n={l.badge ?? 0} />}
            </Link>
          ))}
          <div className="my-1 h-px bg-white/[0.06]" />
          <form action="/api/auth/logout" method="post">
            <button type="submit" role="menuitem" className={cn(MENU_ITEM, "w-full text-left hover:text-danger")}>
              Выйти
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Мобильное меню: полноэкранная панель с крупными пунктами */
export function MobileMenu({ items, user }: { items: Item[]; user?: UserInfo | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-11 place-items-center rounded-[9px] text-fg-2 hover:bg-white/[0.05]"
        aria-label={open ? "Закрыть меню" : "Меню"}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /> : <path d="M4 8h16M4 16h16" strokeLinecap="round" />}
        </svg>
        {!open && user && user.unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-accent ring-2 ring-bg" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[72px] z-50 overflow-y-auto border-t border-line bg-bg/[0.98] backdrop-blur-xl animate-[drawer-in_.2s_cubic-bezier(.2,.8,.2,1)]">
          <nav className="px-5 py-4" aria-label="Мобильное меню">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 items-center justify-between border-b border-white/[0.06] text-[20px] font-medium tracking-[-0.01em]",
                    active ? "text-fg" : "text-fg-2",
                  )}
                >
                  {item.label}
                  {active && <span className="size-1.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </nav>
          {user ? (
            <div className="mx-5 mb-8 mt-2 overflow-hidden rounded-[12px] border border-white/[0.08] bg-surface">
              <div className="flex items-center gap-3 px-4 py-4">
                <Avatar src={user.avatar} name={user.nickname} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold">{user.nickname}</div>
                  <div className="text-[12px] text-fg-3">{user.admin ? "Администратор" : "Игрок F16 Arena"}</div>
                </div>
              </div>
              {USER_LINKS(user).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center gap-3 border-t border-white/[0.06] px-4 text-[16px] text-fg-2"
                >
                  {l.label}
                  {"badge" in l && <Badge n={l.badge ?? 0} />}
                </Link>
              ))}
              <form action="/api/auth/logout" method="post" className="border-t border-white/[0.06]">
                <button type="submit" className="flex h-12 w-full items-center px-4 text-left text-[16px] text-fg-2 transition-colors hover:text-danger">
                  Выйти
                </button>
              </form>
            </div>
          ) : (
            <div className="mx-5 mb-8 mt-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex h-14 items-center justify-center rounded-[10px] bg-accent text-[16px] font-semibold text-accent-ink"
              >
                Войти через Steam
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
