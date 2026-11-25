import { computeRoundSwing, parseLogLine, stripStamp, toSteam64, type Actor, type LogEvent, type Side } from "./swing";

/*
 * Раунды игр лобби по HTTP-логу CS2 — расчёты без базы.
 * MatchZy для лобби не присылает первые убийства, трейды, флеш-ассисты и KAST, а оружие и стороны не присылает вовсе:
 * берём их из событий раундов. Счёт карты и основная статистика остаются от MatchZy — здесь только дополнение.
 * Проверка: npx tsx scripts/test-lobby-rounds.mts
 */

/** Событие лога с временем (секунды от начала суток по часам сервера) и отметки начала и конца карты */
export type RoundEvent = (LogEvent | { type: "match_start" } | { type: "game_over" } | { type: "equip"; actor: Actor; value: number }) & { t: number | null };

const RE_TIME = /^(?:L )?\d{2}\/\d{2}\/\d{4} - (\d{2}):(\d{2}):(\d{2})/;
const RE_MATCH_START = /^World triggered "Match_Start"/;
const RE_GAME_OVER = /^Game Over:/;
// "Name<12><[U:1:123]><CT>" left buyzone with [ weapon_knife weapon_usp_silencer kevlar(100) helmet ]
const RE_EQUIP = /^"(.+?)<\d+><([^>]*)><([^>]*)>" left buyzone with \[(.*)\]\s*$/;

/** Цены снаряжения CS2, $ — чтобы понять, с чем игрок вышел в раунд (эко, форс или полная закупка) */
const PRICE: Record<string, number> = {
  glock: 200, hkp2000: 200, usp_silencer: 200, p250: 300, elite: 300, fiveseven: 500, tec9: 500, cz75a: 500, deagle: 700, revolver: 600,
  mac10: 1050, mp9: 1250, mp7: 1500, mp5sd: 1500, ump45: 1200, p90: 2350, bizon: 1400,
  famas: 1950, galilar: 1800, ak47: 2700, m4a1: 2900, m4a4: 2900, m4a1_silencer: 2900, sg556: 3000, aug: 3300, ssg08: 1700, awp: 4750, scar20: 5000, g3sg1: 5000,
  nova: 1050, xm1014: 2000, mag7: 1300, sawedoff: 1100, m249: 5200, negev: 1700,
  kevlar: 650, helmet: 350, defuser: 400, taser: 200,
  hegrenade: 300, flashbang: 200, smokegrenade: 300, molotov: 400, incgrenade: 500, decoy: 50,
};
/** Стоимость снаряжения по списку из строки «left buyzone with [ … ]» */
export function equipValue(list: string): number {
  let sum = 0;
  for (const raw of list.trim().split(/\s+/)) {
    const item = raw.toLowerCase().replace(/^weapon_/, "").replace(/^item_/, "").replace(/\(.*$/, "");
    sum += PRICE[item] ?? 0;
  }
  return sum;
}
const sideOf = (team: string): Side | null => (team === "CT" ? "CT" : team === "TERRORIST" || team === "T" ? "T" : null);

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
    else if (RE_EQUIP.test(line)) {
      const m = RE_EQUIP.exec(line)!;
      out.push({ type: "equip", actor: { name: m[1], steamId: toSteam64(m[2]), side: sideOf(m[3]) }, value: equipValue(m[4]), t });
    } else {
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

/**
 * Кроме простых счётчиков — то, из чего складывается рейтинг с учётом Swing (всё суммами за раунды стороны):
 *   swing   — вклад игрока в шанс команды выиграть раунд, в долях (0.12 = 12 п.п.);
 *   ekills  — убийства с весом по экономике дуэли (убил лучше вооружённого — больше единицы, хуже — меньше);
 *   edeaths — смерти с тем же весом (погиб от слабее вооружённого — дороже);
 *   multi   — очки за мультикиллы; eco — дуэли, где закупка обоих известна; traded — смерти, за которые отомстили.
 */
export type SideFact = { rounds: number; wins: number; kills: number; deaths: number; swing: number; ekills: number; edeaths: number; multi: number; eco: number; traded: number };
const blankSide = (): SideFact => ({ rounds: 0, wins: 0, kills: 0, deaths: 0, swing: 0, ekills: 0, edeaths: 0, multi: 0, eco: 0, traded: 0 });

/** Вес убийства по экономике: закупка жертвы против закупки убийцы. Пистолет против автомата — до 1.5, автомат против пистолета — до 0.65 */
export function ecoWeight(killer: number | undefined, victim: number | undefined): number {
  if (killer == null || victim == null) return 1;
  return Math.min(1.5, Math.max(0.65, Math.sqrt((victim + 800) / (killer + 800))));
}
/** Перевес CT в закупке команды → сдвиг шанса раунда (в логитах): полная закупка против эко даёт около 78% вместо 51% */
export function ecoBias(ct: number[], t: number[], teamSize: number): number {
  // закупка известна меньше чем у половины команды — не гадаем
  if (ct.length * 2 < teamSize || t.length * 2 < teamSize) return 0;
  const total = (list: number[]) => (list.reduce((a, b) => a + b, 0) / list.length) * teamSize;
  return Math.min(1.3, Math.max(-1.3, 0.9 * Math.log((total(ct) + 2000) / (total(t) + 2000))));
}
/** Очки за убийства в одном раунде: два — 1, три — 2.2, четыре — 3.6, пять — 5.2 */
const MULTI = [0, 0, 1, 2.2, 3.6, 5.2];
/** Доля заслуги за убийство-размен, которая достаётся погибшему товарищу: он открыл этот размен своей смертью */
const TRADE_SHARE = 0.2;
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

const blank = (): RoundFact => ({ rounds: 0, kast: 0, first_kills: 0, first_deaths: 0, trade_kills: 0, flash_assists: 0, weapons: {}, sides: { CT: blankSide(), T: blankSide() } });

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
  // игроков в команде на карте: с заменой в статистике их шестеро, а на сервере одновременно пятеро
  const teamSize = Math.max(1, Math.min(5, Math.max(...[1, 2].map((team) => players.filter((p) => p.team === team).length))));

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

    // Swing: насколько каждый изменил шанс своей команды выиграть этот раунд (убийства, смерти, бомба, исход)
    const roster = new Map<string, Side>();
    for (const p of players) {
      const s = side.get(p.team);
      if (s) roster.set(p.steam_id, s);
    }
    // с чем каждый вышел в раунд (последняя запись о выходе из зоны закупки)
    const equip = new Map<string, number>();
    for (const e of round.events) if (e.type === "equip" && e.actor.steamId) equip.set(e.actor.steamId, e.value);
    const equipOf = (s: Side) => players.filter((p) => roster.get(p.steam_id) === s && equip.has(p.steam_id)).map((p) => equip.get(p.steam_id)!);
    const swingEvents = round.events.filter((e) => e.type !== "match_start" && e.type !== "game_over" && e.type !== "equip") as LogEvent[];
    const credit = new Map<LogEvent, number>();
    const swing = computeRoundSwing([...swingEvents, { type: "round_end", winner: round.winner }], roster, teamSize, {
      bias: ecoBias(equipOf("CT"), equipOf("T"), teamSize),
      onKill: (k, c) => credit.set(k, c),
      zeroSum: true,
    });
    const frags = new Map<string, number>();

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
        frags.set(k.killer.steamId!, (frags.get(k.killer.steamId!) ?? 0) + 1);
      }
      if (victim) victim.sides[k.victim.side!].deaths++;
      // экономика дуэли: одинаковый вес у убийства и у смерти
      const kEq = k.killer.steamId ? equip.get(k.killer.steamId) : undefined;
      const vEq = k.victim.steamId ? equip.get(k.victim.steamId) : undefined;
      const w = ecoWeight(kEq, vEq);
      if (killer) {
        killer.sides[k.killer.side!].ekills += w;
        if (kEq != null && vEq != null) killer.sides[k.killer.side!].eco++;
      }
      if (victim) victim.sides[k.victim.side!].edeaths += w;
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
          if (victim) victim.sides[k.victim.side!].traded++;
          // часть заслуги за размен — погибшему: внутри команды, сумма раунда не меняется
          const share = TRADE_SHARE * (credit.get(next) ?? 0);
          if (share && k.victim.steamId && next.killer.steamId && swing.has(next.killer.steamId)) {
            swing.set(next.killer.steamId, swing.get(next.killer.steamId)! - share);
            swing.set(k.victim.steamId, (swing.get(k.victim.steamId) ?? 0) + share);
          }
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

    for (const [id, v] of swing) {
      const s = roster.get(id);
      if (s) out.get(id)!.sides[s].swing += v;
    }
    for (const [id, n] of frags) {
      const s = roster.get(id);
      if (s) out.get(id)!.sides[s].multi += MULTI[Math.min(n, 5)];
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
