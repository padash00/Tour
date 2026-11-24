import { parseLogLine, stripStamp, type LogEvent, type Side } from "./swing";

/*
 * Раунды игр лобби по HTTP-логу CS2 — расчёты без базы.
 * MatchZy для лобби не присылает первые убийства, трейды, флеш-ассисты и KAST, а оружие и стороны не присылает вовсе:
 * берём их из событий раундов. Счёт карты и основная статистика остаются от MatchZy — здесь только дополнение.
 * Проверка: npx tsx scripts/test-lobby-rounds.mts
 */

/** Событие лога с временем (секунды от начала суток по часам сервера) и отметки начала и конца карты */
export type RoundEvent = (LogEvent | { type: "match_start" } | { type: "game_over" }) & { t: number | null };

const RE_TIME = /^(?:L )?\d{2}\/\d{2}\/\d{4} - (\d{2}):(\d{2}):(\d{2})/;
const RE_MATCH_START = /^World triggered "Match_Start"/;
const RE_GAME_OVER = /^Game Over:/;

/** Строки пачки HTTP-лога → события, которые нужны для раундов (остальное — урон, покупки, чат — отбрасывается) */
export function parseLogBatch(body: string): RoundEvent[] {
  const out: RoundEvent[] = [];
  for (const raw of body.split(/\r?\n/)) {
    if (!raw) continue;
    const m = RE_TIME.exec(raw);
    const t = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
    const line = stripStamp(raw);
    if (RE_MATCH_START.test(line)) out.push({ type: "match_start", t });
    else if (RE_GAME_OVER.test(line)) out.push({ type: "game_over", t });
    else {
      const e = parseLogLine(raw);
      if (e) out.push({ ...e, t });
    }
  }
  return out;
}

type Round = { winner: Side | null; events: RoundEvent[] };

/**
 * Режет поток событий игры на отрезки по началу карты (Match_Start — его пишет и рестарт после разминки и ножей),
 * в каждом отрезке — раунды: всё между Round_Start и итогом раунда. События вне раундов (разминка, пауза) не считаются.
 */
function segments(events: RoundEvent[]): Round[][] {
  const out: Round[][] = [];
  let rounds: Round[] = [];
  let buf: RoundEvent[] | null = null;
  const close = () => {
    if (rounds.length) out.push(rounds);
    rounds = [];
    buf = null;
  };
  for (const e of events) {
    if (e.type === "match_start" || e.type === "game_over") close();
    else if (e.type === "round_start") buf = [];
    else if (e.type === "round_end") {
      if (buf) rounds.push({ winner: e.winner, events: buf });
      buf = null;
    } else if (buf) buf.push(e);
  }
  close();
  return out;
}

export type SideFact = { rounds: number; wins: number; kills: number; deaths: number };
export type RoundFact = {
  rounds: number;
  kast: number;
  first_kills: number;
  first_deaths: number;
  trade_kills: number;
  flash_assists: number;
  weapons: Record<string, number>;
  sides: Record<Side, SideFact>;
};

const blank = (): RoundFact => ({ rounds: 0, kast: 0, first_kills: 0, first_deaths: 0, trade_kills: 0, flash_assists: 0, weapons: {}, sides: { CT: { rounds: 0, wins: 0, kills: 0, deaths: 0 }, T: { rounds: 0, wins: 0, kills: 0, deaths: 0 } } });

/** Размен: убийцу игрока убили его товарищи не позже чем через столько секунд */
const TRADE_SECONDS = 5;

type Kill = Extract<RoundEvent, { type: "kill" }>;
const enemy = (e: Kill) => !!e.killer.side && !!e.victim.side && e.killer.side !== e.victim.side;
const apart = (a: number | null, b: number | null) => (a == null || b == null ? null : (b - a + 86_400) % 86_400);

function factsOfMap(rounds: Round[], players: { steam_id: string; team: number }[]): Map<string, RoundFact> {
  const out = new Map(players.map((p) => [p.steam_id, blank()]));
  const teamOf = new Map(players.map((p) => [p.steam_id, p.team]));
  // сторона команды в прошлом раунде: если в раунде никого из команды не видно в событиях, берём её
  const lastSide = new Map<number, Side>();

  for (const round of rounds) {
    // сторона каждой команды — по любому её игроку, который встретился в событиях раунда
    const side = new Map<number, Side>();
    const see = (a: { steamId: string | null; side: Side | null }) => {
      const team = a.steamId ? teamOf.get(a.steamId) : undefined;
      if (team && a.side && !side.has(team)) side.set(team, a.side);
    };
    for (const e of round.events) {
      if (e.type === "kill") [e.killer, e.victim].forEach(see);
      else if (e.type === "assist") [e.assister, e.victim].forEach(see);
      else if (e.type === "suicide") see(e.victim);
      else if (e.type === "plant" || e.type === "defuse") see(e.actor);
    }
    for (const team of [1, 2]) {
      const other = side.get(team === 1 ? 2 : 1);
      if (!side.has(team) && other) side.set(team, other === "CT" ? "T" : "CT");
      if (!side.has(team) && lastSide.has(team)) side.set(team, lastSide.get(team)!);
      if (side.has(team)) lastSide.set(team, side.get(team)!);
    }

    const kills = round.events.filter((e): e is Kill => e.type === "kill");
    const useful = new Set<string>(); // убийство или ассист
    const dead = new Set<string>();
    const traded = new Set<string>();
    let opened = false;

    kills.forEach((k, i) => {
      if (k.victim.steamId) dead.add(k.victim.steamId);
      if (!enemy(k)) return;
      const killer = k.killer.steamId ? out.get(k.killer.steamId) : undefined;
      const victim = k.victim.steamId ? out.get(k.victim.steamId) : undefined;
      if (killer) {
        useful.add(k.killer.steamId!);
        const weapon = k.weapon.replace(/^weapon_/, "").toLowerCase();
        killer.weapons[weapon] = (killer.weapons[weapon] ?? 0) + 1;
        killer.sides[k.killer.side!].kills++;
      }
      if (victim) victim.sides[k.victim.side!].deaths++;
      if (!opened) {
        opened = true;
        if (killer) killer.first_kills++;
        if (victim) victim.first_deaths++;
      }
      // размен: кто-то из команды жертвы убил её убийцу вскоре после этого
      for (let j = i + 1; j < kills.length; j++) {
        const next = kills[j];
        const gap = apart(k.t, next.t);
        if (gap != null ? gap > TRADE_SECONDS : j - i > 2) break;
        if (next.victim.steamId && next.victim.steamId === k.killer.steamId && next.killer.side === k.victim.side) {
          if (k.victim.steamId) traded.add(k.victim.steamId);
          const avenger = next.killer.steamId ? out.get(next.killer.steamId) : undefined;
          if (avenger) avenger.trade_kills++;
          break;
        }
      }
    });
    for (const e of round.events) {
      if (e.type === "suicide" && e.victim.steamId) dead.add(e.victim.steamId);
      if (e.type === "assist" && e.assister.steamId) {
        useful.add(e.assister.steamId);
        if (e.flash) {
          const f = out.get(e.assister.steamId);
          if (f) f.flash_assists++;
        }
      }
    }

    for (const p of players) {
      const f = out.get(p.steam_id)!;
      f.rounds++;
      if (useful.has(p.steam_id) || !dead.has(p.steam_id) || traded.has(p.steam_id)) f.kast++;
      const s = side.get(p.team);
      if (s) {
        f.sides[s].rounds++;
        if (round.winner === s) f.sides[s].wins++;
      }
    }
  }
  return out;
}

/**
 * Факты по картам игры. maps — сыгранные карты по порядку: сколько раундов на карте по счёту MatchZy и кто играл.
 * Отрезок лога сопоставляется карте по числу раундов (с допуском на переигранные раунды и потерянный хвост);
 * карта, которой отрезок не нашёлся, остаётся без фактов — лучше пусто, чем чужие или обрывочные цифры.
 */
export function roundFacts(events: RoundEvent[], maps: { total: number; players: { steam_id: string; team: number }[] }[]): (Map<string, RoundFact> | null)[] {
  const all = segments(events);
  let from = 0;
  return maps.map((map) => {
    if (!map.total || !map.players.length) return null;
    const slack = Math.max(2, Math.round(map.total * 0.15));
    for (let i = from; i < all.length; i++) {
      if (Math.abs(all[i].length - map.total) > slack) continue;
      from = i + 1;
      return factsOfMap(all[i], map.players);
    }
    return null;
  });
}

/** Снайперские винтовки — для роли «снайпер» */
export const SNIPER_WEAPONS = ["awp", "ssg08", "scar20", "g3sg1"];
