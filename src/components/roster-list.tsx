import Link from "next/link";
import type { Player } from "@/lib/types";
import { Avatar, FaceitLevel, Pill } from "./ui";

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
        <div key={it.key} className="flex items-center gap-4 h-16 border-b border-white/[0.05] last:border-0">
          <Avatar src={it.player.avatar_url} name={it.player.nickname} size={36} />
          <div className="min-w-0 flex-1">
            <Link href={`/players/${it.player.steam_id}`} className="font-medium hover:text-accent-strong truncate block">
              {it.player.nickname}
            </Link>
            <div className="text-[12px] text-fg-3">
              {it.player.is_banned ? <span className="text-danger">Заблокирован</span> : roleLabel[it.role]}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-sm text-fg-3">
            <FaceitLevel level={it.player.faceit_level} />
            <span className="num w-12 text-right">{it.player.faceit_elo ?? "—"}</span>
          </div>
          {it.role === "captain" && !it.player.is_banned && <Pill tone="accent">C</Pill>}
          {it.extra}
        </div>
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <div key={`empty-${i}`} className="flex items-center gap-4 h-16 border-b border-white/[0.05] last:border-0 text-fg-3">
          <div className="size-9 rounded-full border border-dashed border-white/15" />
          <span className="text-sm">Свободный слот</span>
        </div>
      ))}
    </div>
  );
}
