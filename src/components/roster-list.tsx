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

export function RosterList({ items, slots }: { items: RosterItem[]; slots?: number }) {
  const empty = Math.max(0, (slots ?? 0) - items.length);
  return (
    <div className="divide-y divide-line">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-3 py-3">
          <Avatar src={it.player.avatar_url} name={it.player.nickname} size={36} />
          <div className="min-w-0 flex-1">
            <Link href={`/players/${it.player.steam_id}`} className="font-medium hover:text-accent truncate block">
              {it.player.nickname}
            </Link>
            <div className="text-xs text-fg-3 num">{it.player.steam_id}</div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-fg-3">
            <FaceitLevel level={it.player.faceit_level} />
            <span className="num w-12 text-right">{it.player.faceit_elo ?? "—"}</span>
          </div>
          {it.player.is_banned ? (
            <Pill tone="danger">Бан</Pill>
          ) : (
            <Pill tone={it.role === "captain" ? "accent" : "neutral"}>{roleLabel[it.role]}</Pill>
          )}
          {it.extra}
        </div>
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <div key={`empty-${i}`} className="flex items-center gap-3 py-3 text-fg-3">
          <div className="size-9 rounded-lg border border-dashed border-line-strong" />
          <span className="text-sm">Свободный слот</span>
        </div>
      ))}
    </div>
  );
}
