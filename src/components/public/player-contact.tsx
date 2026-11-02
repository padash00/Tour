"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useViewer } from "@/components/viewer";
import { isOnline, seenLabel } from "@/lib/online";
import { cn } from "@/components/ds";

/** В профиле игрока: «в сети / был(а) …» и «Написать» (себе — не показываем; гостю — вход через Steam) */
export function PlayerContact({ playerId, lastSeen }: { playerId: string; lastSeen: string | null }) {
  const { player, status } = useViewer();
  const online = isOnline(lastSeen);
  const self = player?.id === playerId;
  const href = `/messages?with=${playerId}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span suppressHydrationWarning className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", online ? "text-ok" : "text-fg-3")}>
        <span className={cn("size-2 rounded-full", online ? "bg-ok" : "bg-fg-4")} aria-hidden />
        {seenLabel(lastSeen)}
      </span>
      {status === "ready" && !self && (
        <Link
          href={player ? href : `/login?next=${encodeURIComponent(href)}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-[14px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
        >
          <Mail className="size-4" aria-hidden />
          Написать
        </Link>
      )}
    </span>
  );
}
