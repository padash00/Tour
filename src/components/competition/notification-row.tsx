import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "../ui";

/** Уведомление строкой ленты: точка «не прочитано», заголовок, текст, время */
export function NotificationRow({ n }: { n: Notification }) {
  const inner = (
    <div className="flex items-start gap-4">
      <span className={cn("mt-2 size-1.5 rounded-full shrink-0", n.read_at ? "bg-transparent" : "bg-accent")} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[15px]", n.read_at ? "text-fg-2" : "text-fg font-medium")}>{n.title}</div>
        {n.body && <div className="text-sm text-fg-3 mt-0.5">{n.body}</div>}
      </div>
      <div className="text-[12px] text-fg-3 whitespace-nowrap pt-0.5">{formatDateTime(n.created_at)}</div>
    </div>
  );
  return n.link ? (
    <Link href={n.link} className="block py-4 px-2 -mx-2 rounded-lg border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="py-4 border-b border-white/[0.05] last:border-0">{inner}</div>
  );
}
