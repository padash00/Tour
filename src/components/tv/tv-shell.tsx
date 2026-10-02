"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../ui";

export type TvPanel = { key: string; title: string; node: ReactNode };

const ROTATE_MS = 15_000;

/**
 * Режим ТВ: экраны сменяются сами каждые 15 с, внизу — полоса прогресса, точки экранов,
 * название турнира и часы. Курсор прячется через 3 с без движения. Управление не нужно.
 */
export function TvShell({ panels, tournament, footerNote }: { panels: TvPanel[]; tournament: string; footerNote?: string }) {
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState(true);
  const count = panels.length;
  const current = count ? index % count : 0;

  // смена экранов
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [count]);

  // курсор исчезает без движения мыши
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      setCursor(true);
      clearTimeout(t);
      t = setTimeout(() => setCursor(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  const panel = panels[current];

  return (
    <div
      className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg text-fg", !cursor && "cursor-none")}
      style={{ backgroundImage: "radial-gradient(1400px 700px at 80% -10%, #14233b66, transparent 60%)" }}
    >
      <main className="relative flex-1 min-h-0 px-[4vw] pt-[3.2vh] pb-[2vh]">
        {panel ? (
          <div key={`${panel.key}-${index}`} className="h-full flex flex-col animate-[tv-in_600ms_ease-out]">
            <div className="text-[1.25vw] font-medium uppercase tracking-[0.34em] text-[#7f93b0]">{panel.title}</div>
            <div className="mt-[2.4vh] flex-1 min-h-0">{panel.node}</div>
          </div>
        ) : null}
      </main>

      <footer className="relative shrink-0 border-t border-white/[0.08] bg-[#060a10]/80 px-[4vw] h-[8.5vh] flex items-center gap-[2vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/f16-arena-horizontal.svg" alt="F16 Arena" className="h-[5.4vh] w-auto" />
        <div className="h-[3.4vh] w-px bg-white/15" />
        <div className="min-w-0 flex-1 truncate text-[1.6vw] font-semibold tracking-[-0.01em]">{tournament}</div>
        {count > 1 && (
          <div className="flex items-center gap-[0.6vw]">
            {panels.map((p, i) => (
              <span key={p.key} className={cn("h-[0.8vh] rounded-full transition-all duration-500", i === current ? "w-[2.4vw] bg-accent" : "w-[0.8vh] bg-white/25")} />
            ))}
          </div>
        )}
        <div className="text-right leading-tight">
          <Clock />
          <div className="text-[0.95vw] text-fg-3">{footerNote ?? "tournament.f16-arena.kz"}</div>
        </div>
        {count > 1 && (
          <span
            key={`bar-${index}`}
            className="absolute left-0 top-0 h-[3px] bg-accent/80"
            style={{ animation: `tv-progress ${ROTATE_MS}ms linear forwards` }}
          />
        )}
      </footer>

      <style>{`
        @keyframes tv-progress { from { width: 0 } to { width: 100% } }
        @keyframes tv-in { from { opacity: 0; transform: translateY(1.2vh) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { [class*="animate-[tv-in"] { animation: none !important } }
      `}</style>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const text = now
    ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(now)
    : "--:--";
  return <div className="num text-[2.1vw] font-semibold tracking-[-0.01em]">{text}</div>;
}
