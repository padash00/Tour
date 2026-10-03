/**
 * Иконки F16 DS.
 * Основа — lucide-react: импортируйте иконку напрямую из "lucide-react", размер — классом
 * (size-3.5 · size-4 · size-5 · size-6 = 14 · 16 · 20 · 24), толщина линии задана в globals.css (1.75).
 * Здесь — только то, чего нет в Lucide: игровые сущности CS2/F16 в той же геометрии (24×24, скруглённые концы).
 */
import { createLucideIcon } from "lucide-react";

/** Нож — ножевой раунд */
export const Knife = createLucideIcon("knife", [
  ["path", { d: "M3 21 13.5 10.5", key: "k1" }],
  ["path", { d: "M13.5 10.5 20 4a1.8 1.8 0 0 1 0 2.6L16.4 10.2a1 1 0 0 1-1.4 0", key: "k2" }],
  ["path", { d: "m9.5 14.5 3 3", key: "k3" }],
]);

/** Карта (маппул, вето) — сложенный лист */
export const MapSheet = createLucideIcon("map-sheet", [
  ["path", { d: "M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4Z", key: "m1" }],
  ["path", { d: "M9 4v13", key: "m2" }],
  ["path", { d: "M15 6.5v13", key: "m3" }],
]);

/** Steam — фирменный знак (заливка, как требует бренд) */
export function SteamMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.98 2C6.73 2 2.42 6.04 2 11.18l5.37 2.22a2.82 2.82 0 0 1 1.6-.49h.16l2.39-3.46v-.05a3.78 3.78 0 1 1 3.78 3.78h-.09l-3.4 2.43v.13a2.84 2.84 0 0 1-5.62.56L2.36 14.7A10 10 0 1 0 11.98 2ZM8.28 17.17l-1.23-.51a2.13 2.13 0 1 0 1.17-2.9l1.27.52a1.57 1.57 0 1 1-1.2 2.89Zm9.53-7.79a2.52 2.52 0 1 0-2.52 2.52 2.52 2.52 0 0 0 2.52-2.52Zm-4.4 0a1.89 1.89 0 1 1 1.88 1.9 1.89 1.89 0 0 1-1.88-1.9Z" />
    </svg>
  );
}
