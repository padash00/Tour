"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../ui";

/**
 * Вкладки без запроса к серверу: все панели уже в HTML (страница из кэша CDN),
 * переключение мгновенное. Панели — элементы с data-tab="<key>" внутри [data-tabs-scope={scope}].
 * Активная вкладка хранится в ?tab= (ссылки на вкладки продолжают работать).
 */
export function ClientTabs({
  scope,
  items,
  defaultKey,
  param = "tab",
  aside,
}: {
  scope: string;
  items: { key: string; label: ReactNode }[];
  defaultKey: string;
  param?: string;
  aside?: ReactNode;
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
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line">
      <div role="tablist" className="flex gap-7 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active}
            onClick={() => select(t.key)}
            className={cn(
              "relative h-12 inline-flex items-center whitespace-nowrap text-[15px] font-medium transition-colors duration-150",
              t.key === active ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {t.label}
            <span
              className={cn(
                "absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent transition-[opacity,transform] duration-200",
                t.key === active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50",
              )}
            />
          </button>
        ))}
      </div>
      {aside}
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
