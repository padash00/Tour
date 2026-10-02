"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, cn } from "./ui";

export type PickPlayer = { steam_id: string; nickname: string; avatar_url: string | null };

/**
 * «Сравнить» — выбор второго игрока поиском по нику и переход на /players/compare?a=…&b=….
 * side — какую сторону заменяет выбор (на странице сравнения можно поменять любого).
 */
export function ComparePicker({
  self,
  players,
  label = "Сравнить",
  side = "b",
  other,
  className,
}: {
  /** игрок, с которым сравниваем (остаётся на своей стороне) */
  self: string;
  players: PickPlayer[];
  label?: string;
  side?: "a" | "b";
  /** второй игрок, если уже выбран (для смены стороны на странице сравнения) */
  other?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return players.filter((p) => p.steam_id !== self && (!s || p.nickname.toLowerCase().includes(s) || p.steam_id.includes(s))).slice(0, 8);
  }, [players, q, self]);

  const go = (steam: string) => {
    setOpen(false);
    const a = side === "a" ? steam : self;
    const b = side === "a" ? (other ?? self) : steam;
    router.push(`/players/compare?a=${a}&b=${b}`);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-white/[0.14] bg-white/[0.02] px-4 text-[14px] font-medium text-fg-2 transition-colors hover:border-white/[0.28] hover:text-fg"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M5 2v12M11 2v12M2 5h6M8 11h6" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      {open && (
        // на телефоне — по центру экрана: кнопка может стоять у левого края, и выпадашка ушла бы за экран
        <div className="z-40 rounded-[12px] max-sm:fixed max-sm:inset-x-5 max-sm:top-24 sm:absolute sm:right-0 sm:mt-2 sm:w-[320px] border border-white/[0.1] bg-[#0b1420] p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ник или SteamID"
            aria-label="Найти игрока"
            className="field !h-10 w-full text-[14px]"
          />
          <ul className="mt-1.5 max-h-[300px] overflow-y-auto">
            {list.map((p) => (
              <li key={p.steam_id}>
                <button
                  type="button"
                  onClick={() => go(p.steam_id)}
                  className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[14px] text-fg-2 hover:bg-white/[0.05] hover:text-fg"
                >
                  <Avatar src={p.avatar_url} name={p.nickname} size={26} />
                  <span className="truncate">{p.nickname}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-2.5 py-3 text-[13px] text-fg-3">Никого не нашли</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
