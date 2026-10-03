"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

/** «Подключиться» — сервер готов: подключение в один клик с любой страницы */
function ConnectButton({ connect, compact }: { connect: string; compact?: boolean }) {
  return (
    <a
      href={`steam://connect/${connect}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-control bg-ok font-semibold text-ok-ink transition-opacity hover:opacity-90",
        compact ? "h-7 px-2.5 text-micro" : "h-9 px-3 text-meta",
      )}
    >
      <Gamepad2 className="size-4" />
      Подключиться
    </a>
  );
}

function More({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="num shrink-0 rounded-tiny bg-black/25 px-1.5 text-micro" aria-label={`и ещё ${n}`}>
      +{n}
    </span>
  );
}

/** Плашка активности (без данных) — шапка на десктопе и витрина дизайн-системы */
export function ActivityPill({ activity, more = 0, current }: { activity: Activity; more?: number; current?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Tooltip text={activity.detail} side="bottom">
        <Link
          href={activity.href}
          aria-current={current ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-control border px-3 text-meta font-semibold transition-colors duration-[var(--dur-hover)]",
            TONE[activity.tone],
          )}
        >
          <span className={cn("size-2 shrink-0 rounded-full bg-current", activity.priority <= 3 && "animate-pulse")} aria-hidden />
          <span className="truncate">{activity.label}</span>
          {activity.deadline && <Timer deadline={activity.deadline} urgentAt={activity.priority === 4 ? 300 : 10} className="text-current" />}
          <More n={more} />
        </Link>
      </Tooltip>
      {activity.connect && <ConnectButton connect={activity.connect} />}
    </div>
  );
}

/** Полоса активности под шапкой на телефоне: одна строка 40px, вся кликабельна, таймер справа */
export function ActivityBar({ activity, more = 0, current }: { activity: Activity; more?: number; current?: boolean }) {
  return (
    <div className={cn("flex h-10 items-center gap-2 border-t px-4", TONE[activity.tone])}>
      <Link href={activity.href} aria-current={current ? "page" : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 text-meta font-semibold">
        <span className={cn("size-2 shrink-0 rounded-full bg-current", activity.priority <= 3 && "animate-pulse")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{activity.label}</span>
        {activity.deadline && <Timer deadline={activity.deadline} urgentAt={activity.priority === 4 ? 300 : 10} className="shrink-0 text-current" />}
        <More n={more} />
      </Link>
      {activity.connect && <ConnectButton connect={activity.connect} compact />}
    </div>
  );
}

/** Активность в строке шапки — только от 768px (на телефоне — полоса под шапкой) */
export function GlobalActivity() {
  const { activity, moreActivity } = useViewer();
  const pathname = usePathname();
  if (!activity) return null;
  return (
    <div className="hidden min-w-0 md:block">
      <ActivityPill activity={activity} more={moreActivity} current={pathname === activity.href.split("?")[0]} />
    </div>
  );
}

/** Полоса активности под шапкой — только на телефоне; нет действия — строки нет */
export function MobileActivityBar() {
  const { activity, moreActivity } = useViewer();
  const pathname = usePathname();
  if (!activity) return null;
  return (
    <div className="md:hidden">
      <ActivityBar activity={activity} more={moreActivity} current={pathname === activity.href.split("?")[0]} />
    </div>
  );
}

function secondsText(s: number) {
  const a = s % 100;
  const b = s % 10;
  const word = a > 10 && a < 20 ? "секунд" : b === 1 ? "секунда" : b > 1 && b < 5 ? "секунды" : "секунд";
  return `${s} ${word}`;
}

/**
 * Один раз на событие (смена activity.key): звук, мигание вкладки и объявление для скринридера
 * «Ваш ход · бан карты. Осталось 24 секунды». Тиканье таймера не озвучивается. Ставится в шапке один раз.
 */
export function ActivityAnnouncer() {
  const { activity } = useViewer();
  const [text, setText] = useState("");
  const last = useRef<string | null>(null);
  useAlert(activity);
  useEffect(() => {
    const key = activity?.key ?? null;
    if (key === last.current) return;
    last.current = key;
    if (!activity) return;
    const left = activity.deadline ? Math.max(0, Math.ceil((new Date(activity.deadline).getTime() - Date.now()) / 1000)) : null;
    const msg = `${activity.label}. ${activity.detail}.${left != null ? ` Осталось ${left >= 120 ? `${Math.round(left / 60)} мин` : secondsText(left)}.` : ""}`;
    const t = setTimeout(() => setText(msg), 0);
    return () => clearTimeout(t);
  }, [activity]);
  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </span>
  );
}
