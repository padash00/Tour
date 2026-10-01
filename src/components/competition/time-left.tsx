"use client";

import { useEffect, useState } from "react";

/** Обратный отсчёт до дедлайна в формате ч:мм:сс (для check-in и расписания) */
export function TimeLeft({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <span className={left <= 300 ? "text-danger" : undefined}>
      {h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}
    </span>
  );
}
