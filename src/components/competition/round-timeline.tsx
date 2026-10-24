import { Fragment } from "react";
import { mapName } from "@/lib/format";
import { HOW_LABEL, type KillLine, type MapRounds, type RoundHow } from "@/lib/rounds";
import { weaponName } from "../stats-format";
import { cn } from "@/components/ds";

/*
 * Лента раундов: фишка на каждый раунд — цвет команды-победителя, значок — как закончился.
 * Команда 1 — голубая (accent), команда 2 — золотая (warn), как на табло.
 */

const TEAM_BG = { 1: "bg-accent/85 text-accent-ink", 2: "bg-warn/85 text-[#1a1206]" } as const;
const TEAM_TEXT = { 1: "text-accent", 2: "text-warn" } as const;

export function HowIcon({ how, className }: { how: RoundHow; className?: string }) {
  const common = { viewBox: "0 0 12 12", className: cn("size-[11px]", className), "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.5 };
  if (how === "bomb")
    return (
      <svg {...common}>
        <circle cx="5.5" cy="7" r="3.5" />
        <path d="M7.8 4.3 9.5 2.6M9.5 1v1.6M11 2.6H9.5" strokeLinecap="round" />
      </svg>
    );
  if (how === "defuse")
    return (
      <svg {...common}>
        <path d="M2 10 10 2M2.5 3.5l2 2M7.5 8.5l2 2" strokeLinecap="round" />
      </svg>
    );
  if (how === "time")
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4.5" />
        <path d="M6 3.5V6l1.8 1.2" strokeLinecap="round" />
      </svg>
    );
  // все убиты — прицел
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="3.6" />
      <path d="M6 0.8v2.4M6 8.8v2.4M0.8 6h2.4M8.8 6h2.4" strokeLinecap="round" />
    </svg>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-fg-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-[4px] bg-ct/70" /> CT
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-[4px] bg-t/70" /> T
      </span>
      {(Object.keys(HOW_LABEL) as RoundHow[]).map((h) => (
        <span key={h} className="inline-flex items-center gap-1.5">
          <HowIcon how={h} className="size-3" /> {HOW_LABEL[h]}
        </span>
      ))}
    </div>
  );
}

/** Ряд фишек раундов одной карты (используется и на странице матча, и в режиме ТВ) */
export function RoundChips({ map, team1, team2, size = "md" }: { map: MapRounds; team1: string; team2: string; size?: "md" | "tv" }) {
  const tv = size === "tv";
  return (
    <div className={cn("flex flex-wrap items-center", tv ? "gap-[0.35vw]" : "gap-1")}>
      {map.rounds.map((r) => (
        <Fragment key={r.n}>
          {r.switched && <span aria-hidden className={cn("self-stretch bg-line-strong", tv ? "mx-[0.4vw] w-[0.15vw]" : "mx-1 w-px")} title="Смена сторон" />}
          <span
            title={`Раунд ${r.n}${r.winner ? ` · ${r.winner === 1 ? team1 : team2}` : ""} · ${HOW_LABEL[r.how]}`}
            className={cn(
              "grid place-items-center rounded-[4px] num font-semibold transition-colors",
              tv ? "h-[3.2vh] w-[1.9vw] text-[0.85vw]" : "h-7 w-[26px] text-[10px]",
              r.winner ? TEAM_BG[r.winner] : "bg-surface-3 text-fg-3",
            )}
          >
            <HowIcon how={r.how} className={tv ? "size-[1vw]" : undefined} />
          </span>
        </Fragment>
      ))}
    </div>
  );
}

type Segment = { title: string; rounds: MapRounds["rounds"]; s1: number; s2: number };

/** Деление на половины по номерам раундов: основное время и половины овертаймов */
function segments(rounds: MapRounds["rounds"]): Segment[] {
  // половина — 12 раундов (MR12), у 2×2 — 8 (видно по смене сторон на 9-м раунде); овертайм — по 3 раунда на сторону
  const half = rounds.some((r) => r.switched && r.n === 9) ? 8 : 12;
  const ot = half === 8 ? 4 : 3;
  const out: Segment[] = [];
  let cur: MapRounds["rounds"] = [];
  const key = (n: number) => (n <= half ? 0 : n <= 2 * half ? 1 : 2 + Math.floor((n - 2 * half - 1) / ot));
  rounds.forEach((r, idx) => {
    const cut = idx > 0 && key(r.n) !== key(rounds[idx - 1].n);
    if (cut) {
      out.push({ title: "", rounds: cur, s1: 0, s2: 0 });
      cur = [];
    }
    cur.push(r);
  });
  if (cur.length) out.push({ title: "", rounds: cur, s1: 0, s2: 0 });
  return out.map((seg, i) => ({
    ...seg,
    title: i === 0 ? "1-я половина" : i === 1 ? "2-я половина" : `Овертайм ${Math.floor((i - 2) / 2) + 1} · ${(i - 2) % 2 === 0 ? "1-я" : "2-я"} пол.`,
    s1: seg.rounds.filter((r) => r.winner === 1).length,
    s2: seg.rounds.filter((r) => r.winner === 2).length,
  }));
}

const SIDE_CELL = { CT: "bg-ct/15 text-ct", T: "bg-t/15 text-t" } as const;

/** История раундов как на HLTV: строка на команду, значок исхода — в строке победителя, цвет — сторона (CT/T) */
function RoundHistory({ map, team1, team2 }: { map: MapRounds; team1: string; team2: string }) {
  const segs = segments(map.rounds);
  const cell = (r: MapRounds["rounds"][number], team: 1 | 2) => {
    const won = r.winner === team;
    return (
      <span
        className={cn("grid h-8 w-[26px] place-items-center rounded-[6px]", won ? (r.side ? SIDE_CELL[r.side] : "bg-surface-4 text-fg-2") : "bg-ink/[0.035]")}
        title={won ? `Раунд ${r.n} · ${team === 1 ? team1 : team2}${r.side ? ` (${r.side})` : ""} · ${HOW_LABEL[r.how]}` : undefined}
      >
        {won && <HowIcon how={r.how} className="size-[13px]" />}
      </span>
    );
  };
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max gap-3">
        <div className="flex shrink-0 flex-col gap-1 pt-6">
          <span className="flex h-8 max-w-[150px] items-center truncate text-[14px] font-bold text-fg">{team1}</span>
          <span className="flex h-8 max-w-[150px] items-center truncate text-[14px] font-bold text-fg">{team2}</span>
        </div>
        {segs.map((seg, i) => (
          <div key={i} className={cn("flex flex-col gap-1", i > 0 && "border-l border-line pl-3")}>
            <span className="flex h-5 items-center justify-between gap-3 text-[12px] text-fg-3">
              <span className="whitespace-nowrap">{seg.title}</span>
              <span className="num whitespace-nowrap font-bold text-fg-2">
                {seg.s1}:{seg.s2}
              </span>
            </span>
            <div className="flex gap-1">
              {seg.rounds.map((r) => (
                <div key={r.n} className="flex flex-col items-center gap-1">
                  {cell(r, 1)}
                  {cell(r, 2)}
                  <span className="num text-[10.5px] leading-none text-fg-4">{r.n}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KillFeed({ kills, round }: { kills: KillLine[]; round: number | null }) {
  if (!kills.length) return null;
  return (
    <div className="rounded-control border border-line-subtle bg-shell p-4">
      <div className="mb-2.5 text-[11px] uppercase tracking-[0.2em] text-fg-3">Убийства раунда {round}</div>
      <ul className="space-y-1.5">
        {kills.map((k, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            {k.suicide ? (
              <>
                <span className={cn("font-medium", k.victimTeam ? TEAM_TEXT[k.victimTeam] : "text-fg")}>{k.victim}</span>
                <span className="text-fg-3">погиб сам</span>
              </>
            ) : (
              <>
                <span className={cn("font-medium", k.killerTeam ? TEAM_TEXT[k.killerTeam] : "text-fg")}>{k.killer}</span>
                <span className="rounded-tiny bg-surface-3 px-1.5 py-px text-[11px] text-fg-2">
                  {weaponName(k.weapon)}
                  {k.hs && <span className="ml-1 text-danger">HS</span>}
                </span>
                <span className="text-fg-3">→</span>
                <span className={cn(k.victimTeam ? TEAM_TEXT[k.victimTeam] : "text-fg", "opacity-80")}>{k.victim}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Блок «Раунды» страницы матча: по карте — фишки раундов, у идущей карты — убийства последнего раунда */
export function RoundTimeline({
  maps,
  mapNames,
  team1,
  team2,
  liveMap,
}: {
  maps: MapRounds[];
  mapNames: Record<number, string>;
  team1: string;
  team2: string;
  /** номер идущей карты — для неё показываем ленту убийств */
  liveMap?: number | null;
}) {
  const shown = maps.filter((m) => m.rounds.length > 0);
  if (!shown.length) return null;
  return (
    <div className="space-y-5">
      <Legend />
      <div className="divide-y divide-line-subtle rounded-surface border border-line-subtle bg-surface">
        {[...shown].reverse().map((m) => {
          const won1 = m.rounds.filter((r) => r.winner === 1).length;
          const won2 = m.rounds.filter((r) => r.winner === 2).length;
          const isLive = liveMap === m.mapNumber;
          return (
            <div key={m.mapNumber} className="space-y-4 p-5 lg:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[15px] font-semibold">
                  Карта {m.mapNumber}
                  {mapNames[m.mapNumber] ? ` · ${mapName(mapNames[m.mapNumber])}` : ""}
                  {isLive && <span className="ml-2 inline-block size-1.5 rounded-full bg-danger align-middle animate-pulse" />}
                </div>
                <div className="num text-[17px] font-extrabold text-fg">
                  {won1}
                  <span className="mx-1 text-fg-4">:</span>
                  {won2}
                </div>
              </div>
              <RoundHistory map={m} team1={team1} team2={team2} />
              {isLive && <KillFeed kills={m.lastKills} round={m.lastRound} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
