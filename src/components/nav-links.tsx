"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./ui";

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
  const overHero = pathname === "/" && !scrolled;
  // на главной шапка лежит поверх фото hero
  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-200",
        overHero ? "bg-transparent border-b border-transparent" : "bg-bg/85 backdrop-blur-xl border-b border-line",
      )}
    >
      {children}
    </header>
  );
}

export function NavLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-9 lg:gap-11 ml-14 lg:ml-[150px]">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "relative h-[72px] lg:h-[96px] inline-flex items-center text-[14px] lg:text-[16px] transition-colors",
            isActive(pathname, item.href) ? "text-fg" : "text-fg/80 hover:text-fg",
          )}
        >
          {item.label}
          {isActive(pathname, item.href) && <span className="absolute inset-x-0 bottom-0 h-px bg-fg" />}
        </Link>
      ))}
    </nav>
  );
}

export function MobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center size-11 rounded-lg text-fg-2 hover:bg-white/[0.04]"
        aria-label="Меню"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          {open ? <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /> : <path d="M4 8h16M4 16h16" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[72px] border-b border-line bg-bg px-4 py-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-12 items-center px-2 text-[17px] border-b border-white/[0.05] last:border-0",
                isActive(pathname, item.href) ? "text-fg" : "text-fg-2",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
