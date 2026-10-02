import Link from "next/link";
import type { Award } from "@/lib/awards";
import type { ProgressItem } from "@/lib/progress";
import type { Trend } from "@/lib/awards-core";
import { mapName } from "@/lib/format";
import { cn } from "../ui";
import { DATA_TABLE, NUM_CELL } from "./data-table";

const PLACE_TONE: Record<1 | 2 | 3, string> = {
  1: "border-[#d6aa63]/50 bg-[#d6aa63]/[0.10] text-[#e8c27a]",
  2: "border-[#c0c8d4]/40 bg-[#c0c8d4]/[0.08] text-[#d4dae3]",
  3: "border-[#c48a5a]/45 bg-[#c48a5a]/[0.09] text-[#d9a27a]",
};

const title = (a: Award) =>
  a.kind === "place" ? (a.place === 1 ? "Чемпион" : `${a.place} место`) : a.kind === "mvp" ? "MVP турнира" : a.kind === "clutch" ? "Лучший клатч" : "Лучший ADR";

function Medal({ a }: { a: Award }) {
  const tone = a.kind === "place" ? PLACE_TONE[a.place!] : a.kind === "mvp" ? "border-accent/45 bg-accent/[0.08] text-accent" : "border-white/[0.14] bg-white/[0.03] text-fg-2";
  const icon = a.kind === "place" ? (a.place === 1 ? "🏆" : a.place === 2 ? "🥈" : "🥉") : a.kind === "mvp" ? "★" : a.kind === "clutch" ? "◆" : "◎";
  return (
    <Link
      href={`/tournaments/${a.tournament.slug}`}
      className={cn("group flex min-w-0 items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors hover:border-white/30", tone)}
    >
      <span className="text-[22px] leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title(a)}</span>
        <span className="block truncate text-[12px] text-fg-3 group-hover:text-fg-2">
          {a.tournament.name}
          {a.value ? ` · ${a.value}` : ""}
        </span>
      </span>
    </Link>
  );
}

/** Ряд наград: места, MVP, лучший клатч и ADR. Пусто — честное пустое состояние */
export function AwardsRow({ awards, empty = "Первые трофеи впереди." }: { awards: Award[]; empty?: string }) {
  if (awards.length === 0) return <p className="text-[14px] text-fg-3">{empty}</p>;
  const order = (a: Award) => (a.kind === "place" ? a.place! : a.kind === "mvp" ? 4 : 5);
  const sorted = [...awards].sort((a, b) => order(a) - order(b));
  return (
    <div className="grid gap-2.5">
      {sorted.map((a, i) => (
        <Medal key={`${a.tournament.id}:${a.kind}:${i}`} a={a} />
      ))}
    </div>
  );
}

function TrendMark({ t }: { t: Trend }) {
  if (t === "flat") return <span className="ml-1.5 text-fg-4" aria-label="без изменений">·</span>;
  return t === "up" ? (
    <span className="ml-1.5 text-ok" aria-label="рост">▲</span>
  ) : (
    <span className="ml-1.5 text-danger" aria-label="спад">▼</span>
  );
}

/** Прогресс игрока по турнирам: новые сверху, стрелки — к прошлому турниру */
export function ProgressTable({ items }: { items: ProgressItem[] }) {
  if (items.length === 0) {
    return <p className="text-[14px] text-fg-3">Прогресс появится после первого турнира.</p>;
  }
  return (
    <div className="-mx-6 overflow-x-auto lg:-mx-8">
      <table className={cn(DATA_TABLE, "min-w-[640px] [&_th]:first:pl-6 [&_td]:first:pl-6 lg:[&_th]:first:pl-8 lg:[&_td]:first:pl-8")}>
        <thead>
          <tr>
            <th>Турнир</th>
            <th className="!text-center">Место</th>
            <th className="!text-right">Карт</th>
            <th className="!text-right">Rating</th>
            <th className="!text-right">K/D</th>
            <th className="!text-right">ADR</th>
            <th>Лучшая карта</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.tournament.id}>
              <td>
                <Link href={`/tournaments/${it.tournament.slug}`} className="font-semibold text-fg hover:text-accent">
                  {it.tournament.name}
                </Link>
              </td>
              <td className="text-center">{it.place ? (it.place === 1 ? "🏆" : it.place === 2 ? "🥈" : "🥉") : <span className="text-fg-3">—</span>}</td>
              <td className={NUM_CELL}>{it.maps}</td>
              <td className={cn(NUM_CELL, "font-semibold")}>
                {it.rating.toFixed(2)}
                <TrendMark t={it.trend.rating} />
              </td>
              <td className={NUM_CELL}>
                {it.kd.toFixed(2)}
                <TrendMark t={it.trend.kd} />
              </td>
              <td className={NUM_CELL}>
                {it.adr.toFixed(1)}
                <TrendMark t={it.trend.adr} />
              </td>
              <td>{it.bestMap ? `${mapName(it.bestMap.map)} · ${it.bestMap.rating.toFixed(2)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
