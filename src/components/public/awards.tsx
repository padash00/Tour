import Link from "next/link";
import type { Award } from "@/lib/awards";
import type { ProgressItem } from "@/lib/progress";
import type { Trend } from "@/lib/awards-core";
import { mapName } from "@/lib/format";
import { cn } from "../ui";
import { DATA_TABLE, NUM_CELL } from "./data-table";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

const PLACE_TONE: Record<1 | 2 | 3, string> = {
  1: "border-[#d6aa63]/50 bg-[#d6aa63]/[0.10] text-[#e8c27a]",
  2: "border-[#c0c8d4]/40 bg-[#c0c8d4]/[0.08] text-[#d4dae3]",
  3: "border-[#c48a5a]/45 bg-[#c48a5a]/[0.09] text-[#d9a27a]",
};

const title = (a: Award, tx: T) =>
  a.kind === "place" ? (a.place === 1 ? tx("Чемпион") : tx("{n} место", { n: a.place })) : a.kind === "mvp" ? tx("MVP турнира") : a.kind === "sniper" ? tx("Лучший снайпер") : tx("Лучший рифлер");

const valueText = (a: Award) => a.value;

function Medal({ a, tx }: { a: Award; tx: T }) {
  const tone = a.kind === "place" ? PLACE_TONE[a.place!] : a.kind === "mvp" ? "border-accent/45 bg-accent/[0.08] text-accent" : "border-ink/[0.14] bg-ink/[0.03] text-fg-2";
  const icon = a.kind === "place" ? (a.place === 1 ? "🏆" : a.place === 2 ? "🥈" : "🥉") : a.kind === "mvp" ? "★" : a.kind === "sniper" ? "◎" : "◆";
  return (
    <Link
      href={`/tournaments/${a.tournament.slug}`}
      className={cn("group flex min-w-0 items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors hover:border-ink/30", tone)}
    >
      <span className="text-[22px] leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title(a, tx)}</span>
        <span className="block truncate text-[12px] text-fg-3 group-hover:text-fg-2">
          {a.tournament.name}
          {a.value ? ` · ${valueText(a)}` : ""}
        </span>
      </span>
    </Link>
  );
}

/** Ряд наград: места и номинации (MVP, снайпер, рифлер). Пусто — честное пустое состояние */
export async function AwardsRow({ awards, empty }: { awards: Award[]; empty?: string }) {
  const tx = await getT();
  if (awards.length === 0) return <p className="text-[14px] text-fg-3">{empty ?? tx("Первые трофеи впереди.")}</p>;
  const order = (a: Award) => (a.kind === "place" ? a.place! : a.kind === "mvp" ? 4 : a.kind === "sniper" ? 5 : 6);
  const sorted = [...awards].sort((a, b) => order(a) - order(b));
  return (
    <div className="grid gap-2.5">
      {sorted.map((a, i) => (
        <Medal key={`${a.tournament.id}:${a.kind}:${i}`} a={a} tx={tx} />
      ))}
    </div>
  );
}

function TrendMark({ t, tx }: { t: Trend; tx: T }) {
  if (t === "flat") return <span className="ml-1.5 text-fg-4" aria-label={tx("без изменений")}>·</span>;
  return t === "up" ? (
    <span className="ml-1.5 text-ok" aria-label={tx("рост")}>▲</span>
  ) : (
    <span className="ml-1.5 text-danger" aria-label={tx("спад")}>▼</span>
  );
}

/** Прогресс игрока по турнирам: новые сверху, стрелки — к прошлому турниру */
export async function ProgressTable({ items }: { items: ProgressItem[] }) {
  const tx = await getT();
  if (items.length === 0) {
    return <p className="text-[14px] text-fg-3">{tx("Прогресс появится после первого турнира.")}</p>;
  }
  return (
    <div className="-mx-6 overflow-x-auto lg:-mx-8">
      <table className={cn(DATA_TABLE, "min-w-[640px] [&_th]:first:pl-6 [&_td]:first:pl-6 lg:[&_th]:first:pl-8 lg:[&_td]:first:pl-8")}>
        <thead>
          <tr>
            <th>{tx("Турнир")}</th>
            <th className="!text-center">{tx("Место")}</th>
            <th className="!text-right">{tx("Карт")}</th>
            <th className="!text-right">Rating</th>
            <th className="!text-right">K/D</th>
            <th className="!text-right">ADR</th>
            <th>{tx("Лучшая карта")}</th>
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
                <TrendMark t={it.trend.rating} tx={tx} />
              </td>
              <td className={NUM_CELL}>
                {it.kd.toFixed(2)}
                <TrendMark t={it.trend.kd} tx={tx} />
              </td>
              <td className={NUM_CELL}>
                {it.adr.toFixed(1)}
                <TrendMark t={it.trend.adr} tx={tx} />
              </td>
              <td>{it.bestMap ? `${mapName(it.bestMap.map)} · ${it.bestMap.rating.toFixed(2)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
