"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ds";

/**
 * Вкладки без запроса к серверу: все панели уже в HTML (страница из кэша CDN),
 * переключение мгновенное. Панели — элементы с data-tab="<key>" внутри [data-tabs-scope={scope}].
 * Активная вкладка хранится в ?tab= (ссылки на вкладки продолжают работать).
 * Выглядит как ContextNav (F16 DS); sticky — прилипает под оболочкой сайта (--shell-h).
 */
export function ClientTabs({
  scope,
  items,
  defaultKey,
  param = "tab",
  aside,
  sticky,
}: {
  scope: string;
  items: { key: string; label: ReactNode }[];
  defaultKey: string;
  param?: string;
  aside?: ReactNode;
  sticky?: boolean;
}) {
  const [active, setActive] = useState(defaultKey);

  // вкладка из адреса — после загрузки
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(param);
    const first = fromUrl && items.some((i) => i.key === fromUrl) ? setTimeout(() => setActive(fromUrl), 0) : null;
    const onPop = () => {
      const k = new URLSearchParams(window.location.search).get(param);
      setActive(k && items.some((i) => i.key === k) ? k : defaultKey);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      if (first) clearTimeout(first);
      window.removeEventListener("popstate", onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(`[data-tabs-scope="${scope}"] > [data-tab]`).forEach((el) => {
      el.hidden = el.dataset.tab !== active;
    });
  }, [active, scope]);

  const select = (key: string) => {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === defaultKey) url.searchParams.delete(param);
    else url.searchParams.set(param, key);
    window.history.pushState(window.history.state, "", url);
  };

  return (
    <div className={cn("border-b border-line-subtle", sticky && "sticky top-[var(--shell-h)] z-30 bg-bg/90 backdrop-blur-md")}>
      <div className="flex items-end justify-between gap-4">
        <div role="tablist" className="-mb-px flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active}
              onClick={() => select(t.key)}
              className={cn(
                "inline-flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-[14px] font-medium transition-colors duration-[var(--dur-hover)]",
                t.key === active ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {aside && <div className="hidden shrink-0 sm:block">{aside}</div>}
      </div>
    </div>
  );
}

/** Панель вкладки: на сервере видна только вкладка по умолчанию, остальные скрыты до гидратации */
export function TabPanel({ tab, defaultKey, children, className }: { tab: string; defaultKey: string; children: ReactNode; className?: string }) {
  return (
    <div data-tab={tab} hidden={tab !== defaultKey} className={className}>
      {children}
    </div>
  );
}
