"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

/**
 * Обратный отсчёт до deadline: 00:24 · 12:48 · 1:02:15.
 * urgentAt — с какого остатка (секунд) цифры становятся красными. offsetMs — ручная поправка часов; serverNow — автоматическая.
 * Пока страница не отрисована в браузере, показывает «—:—» (без расхождения разметки сервера и браузера).
 * Тиканье только визуальное: role="timer" не озвучивается. Смену состояния объявляет тот, кто показывает таймер,
 * один раз (см. ActivityAnnouncer) — правило для всех таймеров продукта.
 */
export function Timer({
  deadline,
  urgentAt = 10,
  offsetMs = 0,
  serverNow,
  className,
}: {
  deadline: string;
  urgentAt?: number;
  offsetMs?: number;
  /** Время сервера на SSR. Если задано, Timer сам вычисляет поправку к часам браузера. */
  serverNow?: number;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const offset = serverNow == null ? offsetMs : serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [offsetMs, serverNow]);
  if (now == null) return <span className={cn("num", className)}>—:—</span>;
  const left = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = String(left % 60).padStart(2, "0");
  const text = h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
  return (
    <span className={cn("num tabular-nums", left <= urgentAt ? "text-danger" : "text-fg", className)} role="timer">
      {text}
    </span>
  );
}
