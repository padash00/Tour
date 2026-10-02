import type { LogEvent, Side } from "./swing";

/**
 * Лента раундов матча: кто выиграл каждый раунд и как, плюс убийства последнего раунда.
 * Источник — match_rounds (HTTP-лог CS2, разобранный в swing-ingest). Сторона CT/T меняется
 * после перерыва, поэтому команду раунда определяем по SteamID из турнирных составов.
 */

export type RoundHow = "kill" | "bomb" | "defuse" | "time";
export type RoundChip = {
  n: number;
  /** 1 — команда 1 матча, 2 — команда 2, null — не удалось определить */
  winner: 1 | 2 | null;
  how: RoundHow;
  /** перед этим раундом команды поменялись сторонами (перерыв, овертайм) */
  switched: boolean;
};
export type KillLine = {
  killer: string;
  killerTeam: 1 | 2 | null;
  victim: string;
  victimTeam: 1 | 2 | null;
  weapon: string;
  hs: boolean;
  suicide?: boolean;
};
export type MapRounds = { mapNumber: number; rounds: RoundChip[]; lastRound: number | null; lastKills: KillLine[] };

export type RoundRow = { map_number: number; round_number: number; winner_side: Side | null; events: LogEvent[] };
type Row = RoundRow;

export const HOW_LABEL: Record<RoundHow, string> = {
  kill: "все убиты",
  bomb: "бомба взорвалась",
  defuse: "бомба разминирована",
  time: "время вышло",
};

/** Раунды одной карты → фишки; team1/team2 — SteamID64 игроков составов */
export function buildMapRounds(rows: Row[], team1: Set<string>, team2: Set<string>, teamSize: number): MapRounds[] {
  const teamOf = (id: string | null | undefined): 1 | 2 | null => (!id ? null : team1.has(id) ? 1 : team2.has(id) ? 2 : null);
  const byMap = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byMap.has(r.map_number)) byMap.set(r.map_number, []);
    byMap.get(r.map_number)!.push(r);
  }
  const out: MapRounds[] = [];
  for (const [mapNumber, list] of [...byMap].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.round_number - b.round_number);
    // сторона команды 1 на текущий момент (меняется после перерыва)
    let team1Side: Side | null = null;
    const rounds: RoundChip[] = [];
    for (const r of list) {
      const events = (r.events ?? []) as LogEvent[];
      let seenSide: Side | null = null;
      for (const e of events) {
        const actors =
          e.type === "kill"
            ? [e.killer, e.victim]
            : e.type === "assist"
              ? [e.assister, e.victim]
              : e.type === "suicide"
                ? [e.victim]
                : e.type === "plant" || e.type === "defuse"
                  ? [e.actor]
                  : [];
        for (const a of actors) {
          const t = teamOf(a?.steamId);
          if (t && a.side) {
            seenSide = t === 1 ? a.side : a.side === "CT" ? "T" : "CT";
            break;
          }
        }
        if (seenSide) break;
      }
      const switched = !!(seenSide && team1Side && seenSide !== team1Side);
      if (seenSide) team1Side = seenSide;
      const winnerSide = r.winner_side ?? (events.find((e) => e.type === "round_end") as Extract<LogEvent, { type: "round_end" }> | undefined)?.winner ?? null;
      const winner: 1 | 2 | null = !winnerSide || !team1Side ? null : winnerSide === team1Side ? 1 : 2;
      const loserSide: Side | null = winnerSide ? (winnerSide === "CT" ? "T" : "CT") : null;
      const loserDeaths = events.filter((e) => (e.type === "kill" || e.type === "suicide") && e.victim.side === loserSide).length;
      const how: RoundHow = events.some((e) => e.type === "defuse")
        ? "defuse"
        : winnerSide === "T" && events.some((e) => e.type === "plant")
          ? "bomb"
          : loserDeaths >= teamSize
            ? "kill"
            : "time";
      rounds.push({ n: r.round_number, winner, how, switched });
    }
    const last = list.at(-1);
    const lastKills: KillLine[] = (last?.events ?? [])
      .filter((e): e is Extract<LogEvent, { type: "kill" | "suicide" }> => e.type === "kill" || e.type === "suicide")
      .map((e) =>
        e.type === "kill"
          ? {
              killer: e.killer.name,
              killerTeam: teamOf(e.killer.steamId),
              victim: e.victim.name,
              victimTeam: teamOf(e.victim.steamId),
              weapon: e.weapon,
              hs: e.headshot,
            }
          : { killer: e.victim.name, killerTeam: teamOf(e.victim.steamId), victim: e.victim.name, victimTeam: teamOf(e.victim.steamId), weapon: "world", hs: false, suicide: true },
      );
    out.push({ mapNumber, rounds, lastRound: last?.round_number ?? null, lastKills });
  }
  return out;
}
