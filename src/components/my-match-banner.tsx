"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useViewer } from "./viewer";
import { cn } from "./ui";

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

/**
 * Матч стал «готов» или началось вето — звук и мигающий заголовок вкладки, пока игрок не вернётся на неё.
 * Срабатывает один раз на матч и статус.
 */
function useMatchAlert(key: string | null, label: string) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!key) {
      last.current = null;
      return;
    }
    if (last.current === key) return;
    const first = last.current === null && sessionStorageGet(key);
    last.current = key;
    if (first) return; // уже звенели в этой вкладке до перехода
    sessionStorageSet(key);
    chime();
    const base = document.title;
    let on = false;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${label}` : base;
    }, 1000);
    const stop = () => {
      if (document.visibilityState !== "visible") return;
      clearInterval(id);
      document.title = base;
      document.removeEventListener("visibilitychange", stop);
    };
    // если вкладка на виду — помигаем 6 секунд, иначе до возвращения
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
const sessionStorageGet = (k: string) => {
  try {
    return sessionStorage.getItem(`f16-alert:${k}`) === "1";
  } catch {
    return false;
  }
};
const sessionStorageSet = (k: string) => {
  try {
    sessionStorage.setItem(`f16-alert:${k}`, "1");
  } catch {}
};

/**
 * Плашка под шапкой на любой странице сайта: «твой матч готов — заходи», «твоё вето», «идёт твой матч».
 * Данные — из /api/me (страницы сами из кэша CDN и одинаковы для всех).
 */
export function MyMatchBanner() {
  const { match } = useViewer();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const alertKey = match && ((match.status === "ready" && match.address) || match.status === "veto") ? `${match.id}:${match.status}` : null;
  useMatchAlert(alertKey, match?.status === "veto" ? "Твоё вето" : "Матч готов — заходи");
  if (!match || pathname.startsWith("/admin")) return null;
  // на странице самого матча всё и так видно
  if (pathname === `/matches/${match.id}` && match.status !== "ready") return null;

  const href = `/matches/${match.id}`;
  const ready = match.status === "ready" && match.address;
  const tone = ready ? "border-ok/40 bg-ok/[0.10]" : match.status === "veto" ? "border-warn/40 bg-warn/[0.08]" : "border-danger/30 bg-danger/[0.06]";

  return (
    <div className={cn("border-y", tone)}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 sm:px-8 lg:px-16">
        <span className={cn("size-2 shrink-0 rounded-full animate-pulse", ready ? "bg-ok" : match.status === "veto" ? "bg-warn" : "bg-danger")} />
        <span className="min-w-0 flex-1 text-[14px] text-fg">
          {ready ? (
            <>
              <b className="font-semibold">Твой матч #{match.number} против {match.opponent} готов.</b>{" "}
              <span className="text-fg-2">Сервер:</span> <span className="num text-fg">{match.address}</span>
            </>
          ) : match.status === "veto" ? (
            <>
              <b className="font-semibold">Вето матча #{match.number} против {match.opponent}</b> <span className="text-fg-2">— выберите карты</span>
            </>
          ) : (
            <>
              <b className="font-semibold">Идёт твой матч #{match.number}</b> <span className="text-fg-2">против {match.opponent}</span>
            </>
          )}
        </span>
        {ready && match.address && (
          <span className="flex shrink-0 items-center gap-2">
            <a
              href={`steam://connect/${match.address}${match.password ? `/${match.password}` : ""}`}
              className="inline-flex h-9 items-center rounded-[8px] bg-ok px-4 text-[13px] font-semibold text-[#06120c] transition-opacity hover:opacity-90"
            >
              Зайти в игру
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`connect ${match.address}${match.password ? `; password ${match.password}` : ""}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              className="inline-flex h-9 items-center rounded-[8px] border border-white/[0.14] px-3 text-[13px] text-fg-2 transition-colors hover:text-fg"
            >
              {copied ? "Скопировано" : "Скопировать connect"}
            </button>
          </span>
        )}
        {!ready && (
          <Link href={href} className="shrink-0 text-[13px] font-medium text-accent hover:underline">
            {match.status === "veto" ? "К вето →" : "Открыть матч →"}
          </Link>
        )}
      </div>
    </div>
  );
}
