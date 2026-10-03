"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Timer, Tooltip, cn } from "@/components/ds";
import { useViewer, type Activity } from "../viewer";

/*
 * Глобальная активность в шапке — одно самое срочное действие игрока (модель приоритетов — lib/activity.ts).
 * Нет активного действия — компонент не занимает места. Это не центр уведомлений.
 */

const TONE: Record<Activity["tone"], string> = {
  accent: "border-accent/45 bg-accent-dim text-accent hover:bg-accent/[0.16]",
  warn: "border-warn/45 bg-warn-dim text-warn hover:bg-warn/[0.16]",
  ok: "border-ok/45 bg-ok-dim text-ok hover:bg-ok/[0.16]",
  live: "border-live/45 bg-danger-dim text-live hover:bg-danger/[0.16]",
};

/** Короткий сигнал без файла: два тона через Web Audio (браузер пускает звук после любого клика на сайте) */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

const seenGet = (k: string) => {
  try {
    return sessionStorage.getItem(`f16-alert:${k}`) === "1";
  } catch {
    return false;
  }
};
const seenSet = (k: string) => {
  try {
    sessionStorage.setItem(`f16-alert:${k}`, "1");
  } catch {}
};

/** Срочное (приоритет 1–3) — звук и мигающий заголовок вкладки, один раз на событие */
function useAlert(a: Activity | null) {
  const last = useRef<string | null>(null);
  const key = a && a.priority <= 3 ? a.key : null;
  const label = a?.label ?? "";
  useEffect(() => {
    if (!key || last.current === key) return;
    last.current = key;
    if (seenGet(key)) return;
    seenSet(key);
    chime();
    const base = document.title;
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${label}` : base;
    }, 900);
    const stop = () => {
      if (document.visibilityState !== "visible") return;
      clearInterval(id);
      document.title = base;
    };
    document.addEventListener("visibilitychange", stop);
    const t = document.visibilityState === "visible" ? setTimeout(() => stop(), 6000) : null;
    return () => {
      clearInterval(id);
      if (t) clearTimeout(t);
      document.title = base;
      document.removeEventListener("visibilitychange", stop);
    };
  }, [key, label]);
}

/** Плашка активности (без данных) — для шапки и витрины дизайн-системы */
export function ActivityPill({ activity, more = 0, current }: { activity: Activity; more?: number; current?: boolean }) {
  const pill = (
    <Link
      href={activity.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-9 max-w-[52vw] items-center gap-2 rounded-control border px-2.5 text-meta font-semibold transition-colors duration-[var(--dur-hover)] sm:max-w-none sm:px-3",
        TONE[activity.tone],
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full bg-current", activity.priority <= 3 && "animate-pulse")} aria-hidden />
      <span className="truncate">{activity.label}</span>
      {activity.deadline && <Timer deadline={activity.deadline} urgentAt={activity.priority === 4 ? 300 : 10} className="text-current" />}
      {more > 0 && (
        <span className="num rounded-tiny bg-black/25 px-1.5 text-micro" aria-label={`и ещё ${more}`}>
          +{more}
        </span>
      )}
    </Link>
  );
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Tooltip text={activity.detail} side="bottom">
        {pill}
      </Tooltip>
      {/* сервер готов: подключение в один клик с любой страницы */}
      {activity.connect && (
        <a
          href={`steam://connect/${activity.connect}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-ok px-3 text-meta font-semibold text-ok-ink transition-opacity hover:opacity-90"
        >
          <Gamepad2 className="size-4" />
          <span className="hidden sm:inline">Подключиться</span>
          <span className="sr-only sm:hidden">Подключиться к серверу</span>
        </a>
      )}
    </div>
  );
}

export function GlobalActivity() {
  const { activity, moreActivity } = useViewer();
  const pathname = usePathname();
  useAlert(activity);
  if (!activity) return null;
  return (
    <div className="min-w-0" aria-live="polite">
      <ActivityPill activity={activity} more={moreActivity} current={pathname === activity.href.split("?")[0]} />
    </div>
  );
}
