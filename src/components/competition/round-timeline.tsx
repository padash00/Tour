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

function Legend({ team1, team2 }: { team1: string; team2: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-fg-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-accent/85" /> {team1}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-warn/85" /> {team2}
      </span>
      {(Object.keys(HOW_LABEL) as RoundHow[]).map((h) => (
        <span key={h} className="inline-flex items-center gap-1.5">
          <HowIcon how={h} /> {HOW_LABEL[h]}
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
      <Legend team1={team1} team2={team2} />
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
                <div className="num text-[14px]">
                  <span className="text-accent">{won1}</span>
                  <span className="mx-1 text-fg-3">:</span>
                  <span className="text-warn">{won2}</span>
                  <span className="ml-2 text-[12px] text-fg-3">раундов в логе</span>
                </div>
              </div>
              <RoundChips map={m} team1={team1} team2={team2} />
              {isLive && <KillFeed kills={m.lastKills} round={m.lastRound} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
