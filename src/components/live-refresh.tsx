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
    let refreshEpoch = 0;
    let requestId = 0;
    let appliedRequestId = 0;
    let hadPendingAction = false;
    let afterAction: ReturnType<typeof setTimeout> | undefined;
    const hasPendingAction = () => !!document.querySelector('[data-f16-action-pending="true"]');
    const tick = async () => {
      if (document.visibilityState !== "visible" || hasPendingAction()) return;
      const epoch = refreshEpoch;
      const currentRequestId = ++requestId;
      if (!watch) {
        if (epoch !== refreshEpoch || hasPendingAction()) return;
        router.refresh();
        return;
      }
      try {
        const res = await fetch(`/api/live?k=${encodeURIComponent(watch)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (stop || hasPendingAction() || epoch !== refreshEpoch || currentRequestId < appliedRequestId) return;
        appliedRequestId = currentRequestId;
        if (last.current !== null && last.current !== v) router.refresh();
        last.current = v;
      } catch {
        // сеть моргнула — попробуем на следующем тике
      }
    };
    const observer = new MutationObserver(() => {
      refreshEpoch += 1;
      const pending = hasPendingAction();
      if (pending) {
        hadPendingAction = true;
        if (afterAction) clearTimeout(afterAction);
      } else if (hadPendingAction) {
        hadPendingAction = false;
        // Let the Server Action's revalidated payload settle before the next live refresh.
        afterAction = setTimeout(() => void tick(), 350);
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-f16-action-pending"] });
    const id = setInterval(tick, intervalMs);
    // вернулись на вкладку — проверить сразу
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stop = true;
      clearInterval(id);
      observer.disconnect();
      if (afterAction) clearTimeout(afterAction);
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
