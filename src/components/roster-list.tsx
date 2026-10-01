import Link from "next/link";
import type { Player } from "@/lib/types";
import { Avatar, FaceitLevel } from "./ui";

export type RosterItem = {
  key: string;
  player: Player;
  role: "captain" | "main" | "sub";
  extra?: React.ReactNode;
};

const roleLabel = { captain: "Капитан", main: "Основа", sub: "Запасной" };

/** Состав: крупные чистые строки игроков */
export function RosterList({ items, slots }: { items: RosterItem[]; slots?: number }) {
  const empty = Math.max(0, (slots ?? 0) - items.length);
  return (
    <div>
      {items.map((it) => (
        <div key={it.key} className="flex min-h-[76px] items-center gap-4 border-b border-white/[0.05] py-3 last:border-0 sm:gap-5">
          <Avatar src={it.player.avatar_url} name={it.player.nickname} size={48} />
          <div className="min-w-0 flex-1">
            <Link href={`/players/${it.player.steam_id}`} className="block truncate rounded-[4px] text-[17px] font-semibold transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              {it.player.nickname}
            </Link>
            <div className="mt-0.5 text-[12px] uppercase tracking-[0.16em] text-fg-3">
              {it.player.is_banned ? <span className="text-danger">Заблокирован</span> : roleLabel[it.role]}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[15px] text-fg-3">
            <FaceitLevel level={it.player.faceit_level} />
            <span className="num w-12 text-right">{it.player.faceit_elo ?? "—"}</span>
          </div>
          {it.role === "captain" && !it.player.is_banned && (
            <span title="Капитан" className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-accent/40 bg-accent/[0.08] text-[12px] font-bold text-accent">
              C
            </span>
          )}
          {it.extra}
        </div>
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <div key={`empty-${i}`} className="flex min-h-[76px] items-center gap-4 border-b border-white/[0.05] py-3 text-fg-3 last:border-0 sm:gap-5">
          <div className="size-12 shrink-0 rounded-full border border-dashed border-white/15" />
          <span className="text-[15px]">Свободный слот</span>
          <span className="ml-auto text-[12px] uppercase tracking-[0.16em] text-fg-4">ожидает игрока</span>
        </div>
      ))}
    </div>
  );
}
