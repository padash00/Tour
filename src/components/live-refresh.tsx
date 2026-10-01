"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Периодически перезапрашивает серверные данные страницы (вето, live-счёт). */
export function LiveRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

export function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  return (
    <span className={left <= 10 ? "text-danger" : "text-fg"}>
      0:{String(left).padStart(2, "0")}
    </span>
  );
}
