import Link from "next/link";
import type { HeadToHead } from "@/lib/stats";
import { TeamLogo, cn } from "./ui";

/** Личные встречи: соперник, серии В–П, карты, разница раундов */
export function HeadToHeadList({ items, empty = "Появятся после первых сыгранных матчей." }: { items: HeadToHead[]; empty?: string }) {
  if (!items.length) return <p className="text-[14px] text-fg-3">{empty}</p>;
  return (
    <div>
      {items.map((h) => {
        const rd = h.roundsFor - h.roundsAgainst;
        const lost = h.matches - h.wins;
        return (
          <div key={h.opponent.id} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0">
            <Link href={h.href} className="flex min-w-0 flex-1 items-center gap-3 hover:[&_span]:text-accent">
              <TeamLogo src={h.opponent.logo_url} tag={h.opponent.tag} size={28} />
              <span className="truncate font-semibold text-fg transition-colors">{h.opponent.name}</span>
            </Link>
            <span className="num shrink-0 text-right text-[12px] text-fg-3" title="Карты: выиграно–проиграно, разница раундов">
              карты {h.mapWins}–{h.maps - h.mapWins}
              <span className={cn("ml-1.5", rd > 0 ? "text-ok" : rd < 0 ? "text-danger" : "")}>{rd > 0 ? `+${rd}` : rd}</span>
            </span>
            <span
              className={cn(
                "num w-12 shrink-0 text-right text-[15px] font-semibold",
                h.wins > lost ? "text-ok" : h.wins < lost ? "text-danger" : "text-fg",
              )}
              title="Матчи: победы–поражения"
            >
              {h.wins}–{lost}
            </span>
          </div>
        );
      })}
    </div>
  );
}
