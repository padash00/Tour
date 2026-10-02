"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const locKey = (path: string, search: string) => `${path}?${new URLSearchParams(search).toString()}`;

/**
 * Мгновенный отклик на клик по ссылке: тонкая полоса прогресса вверху экрана и лёгкое
 * затемнение содержимого, пока Next.js готовит новую страницу (0,3–0,7 с с сервера).
 * Срабатывает только на клик по внутренней ссылке; router.refresh() (живое обновление)
 * и переключение вкладок без перехода её не запускают. Заканчивается, когда сменился адрес.
 */
export function NavProgress() {
  const loc = locKey(usePathname(), useSearchParams().toString());
  // адрес, с которого ушли по клику; null — переходов нет
  const [from, setFrom] = useState<string | null>(null);
  const loading = from !== null && from === loc;
  const arrived = from !== null && from !== loc;

  useEffect(() => {
    if (!loading) return;
    document.documentElement.dataset.navigating = "1";
    // страховка: если перехода так и не случилось (ошибка, отмена) — убрать полосу
    const t = setTimeout(() => setFrom(null), 8000);
    return () => {
      clearTimeout(t);
      delete document.documentElement.dataset.navigating;
    };
  }, [loading]);

  useEffect(() => {
    if (!arrived) return;
    const t = setTimeout(() => setFrom(null), 320); // дать полосе доехать и погаснуть
    return () => clearTimeout(t);
  }, [arrived]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // та же страница (или только якорь) — перехода не будет
      if (url.pathname === location.pathname && url.search === location.search) return;
      setFrom(locKey(location.pathname, location.search));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (from === null) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px]">
      <div className={loading ? "nav-progress-run" : "nav-progress-done"} />
    </div>
  );
}
