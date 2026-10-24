"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu as MenuIcon, Shield, User, Users, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar, Menu, MenuItem, MenuSeparator, cn, useModal } from "@/components/ds";
import { SteamMark } from "@/components/ds/icons";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, noChrome } from "./shell/nav";

/** Публичная обёртка не нужна в F16 Control и ТВ — там своя оболочка */
export function PublicOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (noChrome(pathname)) return null;
  return <>{children}</>;
}

/** Верхняя строка: белая, прилипает к верху при прокрутке */
export function HeaderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (noChrome(pathname)) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-line-subtle bg-shell/92 backdrop-blur-xl backdrop-saturate-150">
      {children}
    </header>
  );
}

/** Основное меню (десктоп, от 1024px): разделы продукта */
export function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav className="ml-8 hidden h-full items-center gap-1 lg:flex xl:ml-10" aria-label="Основное меню">
      {PRIMARY_NAV.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-full items-center px-3 text-[14px] font-medium transition-colors duration-[var(--dur-hover)]",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {item.label}
            <span className={cn("absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent transition-opacity duration-[var(--dur-hover)]", active ? "opacity-100" : "opacity-0")} />
          </Link>
        );
      })}
    </nav>
  );
}

export type UserInfo = { nickname: string; avatar: string | null; steamId: string; unread: number; admin: boolean };

function userLinks(u: UserInfo) {
  return [
    { href: "/me", label: "Моя игра", hint: "матчи, заявки, что делать дальше", icon: <LayoutDashboard /> },
    { href: "/team", label: "Моя команда", hint: "состав и приглашения", icon: <Users /> },
    { href: "/notifications", label: "Уведомления", hint: u.unread ? "есть непрочитанные" : "всё прочитано", icon: <Bell />, count: u.unread },
    { href: `/players/${u.steamId}`, label: "Мой профиль", hint: "как вас видят другие", icon: <User /> },
  ];
}

const countLabel = (n: number) => (n > 99 ? "99+" : String(n));

/** Выход — POST-форма (logout принимает только POST со своего сайта) */
function useLogout() {
  const form = useRef<HTMLFormElement>(null);
  const node = <form ref={form} action="/api/auth/logout" method="post" className="hidden" aria-hidden />;
  return { node, logout: () => form.current?.requestSubmit() };
}

/** Аватар в шапке → меню: моя игра, профиль, команда, уведомления, F16 Control, выход (десктоп) */
export function UserMenu({ user }: { user: UserInfo }) {
  const router = useRouter();
  const { node, logout } = useLogout();
  return (
    <div className="hidden lg:block">
      {node}
      <Menu
        label="Меню игрока"
        trigger={
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-full bg-surface pl-1 pr-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-[var(--dur-hover)] hover:bg-surface-2 aria-expanded:bg-surface-2 aria-expanded:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
          >
            <Avatar src={user.avatar} name={user.nickname} size="xs" className="!size-9 !rounded-full" />
            <span className="max-w-[130px] truncate text-[15px] font-semibold">{user.nickname}</span>
            <ChevronDown className="size-4 text-fg-3" />
          </button>
        }
      >
        <div className="w-[300px]">
          <div className="mb-1.5 flex items-center gap-3 rounded-surface bg-surface-2 p-3">
            <Avatar src={user.avatar} name={user.nickname} size="md" className="!rounded-full" />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold text-fg">{user.nickname}</div>
              <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[12px] font-bold", user.admin ? "bg-accent-dim text-accent" : "bg-ink/[0.06] text-fg-2")}>
                {user.admin ? "Администратор" : "Игрок F16 Arena"}
              </span>
            </div>
          </div>
          {userLinks(user).map((l) => (
            <MenuItem
              key={l.href}
              icon={l.icon}
              hint={l.hint}
              badge={l.count ? <span className="rounded-full bg-live px-2 py-0.5 text-[12px] font-bold text-white">{countLabel(l.count)}</span> : undefined}
              onSelect={() => router.push(l.href)}
            >
              {l.label}
            </MenuItem>
          ))}
          {user.admin && (
            <>
              <MenuSeparator />
              <button
                type="button"
                role="menuitem"
                onClick={() => router.push("/admin")}
                className="flex w-full items-center gap-3 rounded-control bg-fg px-2.5 py-2.5 text-left text-white outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white/15 [&>svg]:size-[18px]">
                  <Shield />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-tight">Пульт организатора</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-white/70">F16 Control: турниры, матчи, серверы</span>
                </span>
              </button>
            </>
          )}
          <MenuSeparator />
          <MenuItem icon={<LogOut />} danger onSelect={logout}>
            Выйти из аккаунта
          </MenuItem>
        </div>
      </Menu>
    </div>
  );
}

/** Мобильное меню (до 1024px): панель под шапкой с крупными пунктами */
export function MobileMenu({ user }: { user?: UserInfo | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { node, logout } = useLogout();

  const panel = useModal(open, () => setOpen(false));

  const row = "flex h-12 items-center gap-3 rounded-control px-3 text-[16px] transition-colors";
  return (
    <div className="lg:hidden">
      {node}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-control text-fg-2 hover:bg-ink/[0.06] hover:text-fg"
        aria-label={open ? "Закрыть меню" : "Меню"}
        aria-expanded={open}
        aria-controls="mobile-menu"
      >
        {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panel}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Меню сайта"
          className="fixed inset-x-0 bottom-0 top-[var(--shell-h)] z-50 overflow-y-auto border-t border-line-subtle bg-bg animate-[sheet-in-y_var(--dur-modal)_cubic-bezier(.2,.8,.2,1)]"
        >
          <nav className="px-3 py-3" aria-label="Мобильное меню">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn(row, "font-medium", active ? "bg-ink/[0.06] text-fg" : "text-fg-2 hover:text-fg")}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {user ? (
            <div className="mx-3 border-t border-line-subtle py-3">
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar src={user.avatar} name={user.nickname} size="md" />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold">{user.nickname}</div>
                  <div className="text-meta text-fg-3">{user.admin ? "Администратор" : "Игрок F16 Arena"}</div>
                </div>
              </div>
              {[...userLinks(user), ...(user.admin ? [{ href: "/admin", label: "Пульт организатора", hint: "F16 Control", icon: <Shield />, count: 0 }] : [])].map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={cn(row, "text-fg-2 hover:text-fg [&>svg]:size-5 [&>svg]:text-fg-3")}>
                  {l.icon}
                  {l.label}
                  {l.count ? <span className="ml-auto rounded-full bg-live px-2 py-0.5 text-[12px] font-bold text-white">{countLabel(l.count)}</span> : null}
                </Link>
              ))}
              <button type="button" onClick={logout} className={cn(row, "w-full text-left text-danger [&>svg]:size-5")}>
                <LogOut />
                Выйти
              </button>
            </div>
          ) : (
            <div className="mx-6 border-t border-line-subtle py-4">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} onClick={() => setOpen(false)} className="flex h-12 items-center justify-center gap-2 rounded-control bg-accent text-[16px] font-semibold text-accent-ink">
                <SteamMark className="size-5" />
                Войти через Steam
              </Link>
            </div>
          )}
          <div className="mx-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line-subtle px-3 py-4 text-[14px] text-fg-3">
            {SECONDARY_NAV.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center hover:text-fg">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      ,
        document.body,
      )}
    </div>
  );
}

/** Колокольчик: непрочитанные уведомления */
export function NotificationsBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      className="relative grid size-10 place-items-center rounded-control text-fg-2 transition-colors duration-[var(--dur-hover)] hover:bg-ink/[0.06] hover:text-fg"
      aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink ring-2 ring-shell">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

