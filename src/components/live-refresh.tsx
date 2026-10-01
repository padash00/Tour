"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Живое обновление страницы.
 * С `watch` (например "match:<id>") — опрашивает лёгкий /api/live (кэш CDN 2 с) и перерисовывает
 * страницу только когда данные действительно изменились. Без `watch` — просто перерисовка по таймеру
 * (оставлено для админки: там пара человек).
 */
export function LiveRefresh({ intervalMs = 3000, watch }: { intervalMs?: number; watch?: string }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!watch) {
        router.refresh();
        return;
      }
      try {
        const res = await fetch(`/api/live?k=${encodeURIComponent(watch)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (stop) return;
        if (last.current !== null && last.current !== v) router.refresh();
        last.current = v;
      } catch {
        // сеть моргнула — попробуем на следующем тике
      }
    };
    const id = setInterval(tick, intervalMs);
    // вернулись на вкладку — проверить сразу
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs, watch]);
  return null;
}

export function Countdown({ deadline, long }: { deadline: string; long?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <span className={left <= (long ? 120 : 10) ? "text-danger" : "text-fg"}>
      {mm}:{ss}
    </span>
  );
}
