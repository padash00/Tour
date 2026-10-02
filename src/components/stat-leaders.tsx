import Link from "next/link";
import type { PlayerAgg } from "@/lib/stats";
import { Avatar, cn } from "./ui";
import { fmt, ratingColor } from "./stats-format";

type Row = PlayerAgg & { player?: { nickname: string; avatar_url: string | null; steam_id: string } | null };

/**
 * Лидеры над таблицей игроков: убийства, ADR, HS%, Swing, Rating.
 * Для ADR и HS — порог по объёму, чтобы одна удачная карта не обгоняла весь турнир.
 */
export function StatLeaders({ rows }: { rows: Row[] }) {
  if (rows.length < 2) return null;
  const maxRounds = Math.max(...rows.map((r) => r.rounds));
  const enoughRounds = rows.filter((r) => r.rounds >= Math.min(30, Math.ceil(maxRounds / 2)));
  const top = <T,>(list: T[], v: (x: T) => number) => list.reduce<T | null>((best, x) => (best == null || v(x) > v(best) ? x : best), null);

  const kills = top(rows, (r) => r.kills);
  const adr = top(enoughRounds, (r) => r.adr);
  const hs = top(rows.filter((r) => r.kills >= 10), (r) => r.hsPct);
  const swing = top(enoughRounds.filter((r) => r.swing != null), (r) => r.swing!);
  const rating = top(enoughRounds, (r) => r.rating);
  const cards: { label: string; row: Row | null; value: string; tone?: string }[] = [
    { label: "Больше всего убийств", row: kills, value: String(kills?.kills ?? "") },
    { label: "Лучший ADR", row: adr, value: adr ? fmt.d1(adr.adr) : "" },
    { label: "Самый точный · HS", row: hs, value: hs ? fmt.pct(hs.hsPct) : "" },
    { label: "Лучший Swing", row: swing, value: swing ? fmt.swing(swing.swing) : "", tone: "text-ok" },
    { label: "Лучший Rating", row: rating, value: rating ? fmt.r(rating.rating) : "", tone: rating ? ratingColor(rating.rating) : undefined },
  ];
  const shown = cards.filter((c) => c.row);
  if (!shown.length) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-3", shown.length >= 5 ? "lg:grid-cols-5" : shown.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {shown.map((c) => {
        const r = c.row!;
        const nick = r.player?.nickname ?? r.name;
        const who = (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar src={r.player?.avatar_url} name={nick} size={22} />
            <span className="truncate text-[13px] font-medium text-fg-2">{nick}</span>
          </span>
        );
        return (
          <div key={c.label} className="min-w-0 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-3">{c.label}</div>
            <div className={cn("num mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em]", c.tone ?? "text-fg")}>{c.value}</div>
            <div className="mt-3">
              {r.player ? (
                <Link href={`/players/${r.player.steam_id}`} className="block min-w-0 hover:[&_span]:text-accent">
                  {who}
                </Link>
              ) : (
                who
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
