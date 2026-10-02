/**
 * Swing — вклад игрока в изменение шанса команды выиграть раунд (как в FACEIT / HLTV Rating 3.0).
 *
 * Каждое событие раунда (убийство, плент, дефьюз) меняет вероятность победы. Разница засчитывается:
 *   убийство  — убийце +Δ (с ассистом: 75% убийце, 25% ассистенту), жертве −Δ;
 *   плент     — тому, кто заложил; дефьюз — тому, кто разминировал;
 *   конец раунда — остаток до 0/100% делится между выжившими (победители +, проигравшие −).
 * Swing игрока за карту = сумма его Δ в процентных пунктах / сыгранные раунды.
 */

export type Side = "CT" | "T";

export type LogEvent =
  | { type: "round_start" }
  | { type: "round_end"; winner: Side | null }
  | { type: "kill"; killer: Actor; victim: Actor; weapon: string; headshot: boolean }
  | { type: "assist"; assister: Actor; victim: Actor; flash: boolean }
  | { type: "suicide"; victim: Actor }
  | { type: "plant"; actor: Actor }
  | { type: "defuse"; actor: Actor };

export type Actor = { name: string; steamId: string | null; side: Side | null };

// ───────────────────────── разбор строк лога CS2

const STEAM_BASE = BigInt("76561197960265728");

/** [U:1:123] → SteamID64; BOT → null */
export function toSteam64(raw: string): string | null {
  const m = /^\[U:1:(\d+)\]$/.exec(raw);
  if (m) return (STEAM_BASE + BigInt(m[1])).toString();
  if (/^\d{17}$/.test(raw)) return raw;
  return null;
}

const sideOf = (team: string): Side | null =>
  team === "CT" ? "CT" : team === "TERRORIST" || team === "T" ? "T" : null;

// "Name<12><[U:1:123]><CT>"
const ACTOR = String.raw`"(.+?)<\d+><([^>]*)><([^>]*)>"`;
const POS = String.raw`(?:\s*\[[^\]]*\])?`;

const RE_KILL = new RegExp(`^${ACTOR}${POS} killed ${ACTOR}${POS} with "([^"]+)"(.*)$`);
const RE_ASSIST = new RegExp(`^${ACTOR} (flash-)?assisted killing ${ACTOR}`);
const RE_SUICIDE = new RegExp(`^${ACTOR}${POS} committed suicide`);
const RE_PLANT = new RegExp(`^${ACTOR} triggered "Planted_The_Bomb"`);
const RE_DEFUSE = new RegExp(`^${ACTOR} triggered "Defused_The_Bomb"`);
const RE_TEAM_WIN = /^Team "(CT|TERRORIST)" triggered "SFUI_Notice_\w+"/;
const RE_STAMP = /^(?:L )?\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}(?:\.\d+)?(?::| -) /;

const actor = (name: string, id: string, team: string): Actor => ({ name, steamId: toSteam64(id), side: sideOf(team) });

/** Убирает префикс времени. Возвращает текст события или null. */
export function stripStamp(line: string): string {
  return line.replace(RE_STAMP, "").trim();
}

export function parseLogLine(raw: string): LogEvent | null {
  const line = stripStamp(raw);
  if (line === 'World triggered "Round_Start"') return { type: "round_start" };
  let m = RE_TEAM_WIN.exec(line);
  if (m) return { type: "round_end", winner: m[1] === "CT" ? "CT" : "T" };
  if ((m = RE_KILL.exec(line))) {
    return {
      type: "kill",
      killer: actor(m[1], m[2], m[3]),
      victim: actor(m[4], m[5], m[6]),
      weapon: m[7],
      headshot: /headshot/.test(m[8] ?? ""),
    };
  }
  if ((m = RE_ASSIST.exec(line))) {
    return { type: "assist", assister: actor(m[1], m[2], m[3]), flash: !!m[4], victim: actor(m[5], m[6], m[7]) };
  }
  if ((m = RE_SUICIDE.exec(line))) return { type: "suicide", victim: actor(m[1], m[2], m[3]) };
  if ((m = RE_PLANT.exec(line))) return { type: "plant", actor: actor(m[1], m[2], m[3]) };
  if ((m = RE_DEFUSE.exec(line))) return { type: "defuse", actor: actor(m[1], m[2], m[3]) };
  return null;
}

// ───────────────────────── модель шанса победы раунда (v1)

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Вероятность победы CT при текущем числе живых и состоянии бомбы.
 * v1 — экспертная модель; после ~300 сыгранных раундов откалибруем на собственных данных.
 */
export function winProbCT(ct: number, t: number, planted: boolean): number {
  if (ct <= 0) return 0;
  if (planted) {
    if (t <= 0) return Math.min(0.95, 0.3 + 0.13 * ct); // надо успеть разминировать
    return sigmoid(0.05 + 0.75 * (ct - t) - 1.4);
  }
  if (t <= 0) return 1;
  return sigmoid(0.05 + 0.75 * (ct - t));
}

// ───────────────────────── расчёт Swing раунда

export type RoundSwing = Map<string, number>; // steamId → Δ в долях (0.12 = 12 п.п.)

/**
 * События одного раунда (между round_start и round_end) → вклад каждого игрока.
 * roster — известные игроки карты и их текущая сторона (для дележа остатка между выжившими).
 */
export function computeRoundSwing(events: LogEvent[], roster: Map<string, Side> = new Map(), teamSize = 5): RoundSwing {
  const swing: RoundSwing = new Map();
  const add = (a: Actor | null | undefined, v: number) => {
    if (!a?.steamId || !Number.isFinite(v) || v === 0) return;
    swing.set(a.steamId, (swing.get(a.steamId) ?? 0) + v);
  };
  const alive = { CT: new Set<string>(), T: new Set<string>() };
  for (const [id, side] of roster) alive[side].add(id);
  const dead = new Set<string>();
  let ct = teamSize;
  let t = teamSize;
  let planted = false;
  const key = (a: Actor) => a.steamId ?? `bot:${a.name}`;
  const seen = (a: Actor) => {
    if (!a.side || dead.has(key(a))) return;
    alive[a.side === "CT" ? "T" : "CT"].delete(key(a)); // сменил сторону после перерыва
    alive[a.side].add(key(a));
  };
  const forSide = (side: Side, pCt: number) => (side === "CT" ? pCt : 1 - pCt);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "kill" || e.type === "suicide") {
      const victim = e.victim;
      if (!victim.side) continue;
      seen(victim);
      const before = winProbCT(ct, t, planted);
      if (victim.side === "CT") ct = Math.max(0, ct - 1);
      else t = Math.max(0, t - 1);
      dead.add(key(victim));
      alive[victim.side].delete(key(victim));
      const after = winProbCT(ct, t, planted);
      const victimLoss = forSide(victim.side, before) - forSide(victim.side, after); // > 0
      add(victim, -victimLoss);
      if (e.type === "kill" && e.killer.side && e.killer.side !== victim.side) {
        seen(e.killer);
        const assist = events.slice(i + 1, i + 4).find(
          (x): x is Extract<LogEvent, { type: "assist" }> => x.type === "assist" && key(x.victim) === key(victim),
        );
        if (assist && assist.assister.side === e.killer.side) {
          add(e.killer, victimLoss * 0.75);
          add(assist.assister, victimLoss * 0.25);
        } else {
          add(e.killer, victimLoss);
        }
      }
    } else if (e.type === "plant") {
      const before = winProbCT(ct, t, planted);
      planted = true;
      const after = winProbCT(ct, t, planted);
      seen(e.actor);
      add(e.actor, before - after); // для T рост шанса = падение шанса CT
    } else if (e.type === "defuse") {
      const before = winProbCT(ct, t, planted);
      seen(e.actor);
      add(e.actor, 1 - before);
      ct = Math.max(ct, 1);
      t = 0;
      planted = false;
    } else if (e.type === "round_end" && e.winner) {
      // остаток до исхода раунда (время вышло, взрыв, сейвы) — выжившим
      const pCt = winProbCT(ct, t, planted);
      const residualCt = (e.winner === "CT" ? 1 : 0) - pCt;
      if (Math.abs(residualCt) > 1e-9) {
        const ctAlive = [...alive.CT];
        const tAlive = [...alive.T];
        for (const id of ctAlive) add({ name: id, steamId: id.startsWith("bot:") ? null : id, side: "CT" }, residualCt / ctAlive.length);
        for (const id of tAlive) add({ name: id, steamId: id.startsWith("bot:") ? null : id, side: "T" }, -residualCt / tAlive.length);
      }
    }
    // запоминаем живых участников событий
    if (e.type === "assist") seen(e.assister);
  }
  return swing;
}

/**
 * KAST и первый фраг раунда по событиям лога (MatchZy их не присылает).
 * KAST — игрок убил, помог, выжил или его разменяли (убийцу добил союзник в ближайших 3 убийствах).
 * players — состав карты на этот раунд.
 */
export function roundFacts(events: LogEvent[], players: Iterable<string>) {
  const kills = events.filter(
    (e): e is Extract<LogEvent, { type: "kill" }> => e.type === "kill" && !!e.killer.side && e.killer.side !== e.victim.side,
  );
  const killed = new Set<string>();
  const kast = new Set<string>();
  for (const e of events) {
    if ((e.type === "kill" || e.type === "suicide") && e.victim.steamId) killed.add(e.victim.steamId);
    if (e.type === "assist" && e.assister.steamId) kast.add(e.assister.steamId);
  }
  kills.forEach((k, i) => {
    if (k.killer.steamId) kast.add(k.killer.steamId);
    // размен: убийцу в следующих трёх убийствах убил кто-то со стороны жертвы
    const traded = kills
      .slice(i + 1, i + 4)
      .some((n) => n.victim.steamId && n.victim.steamId === k.killer.steamId && n.killer.side === k.victim.side);
    if (traded && k.victim.steamId) kast.add(k.victim.steamId);
  });
  for (const id of players) if (!killed.has(id)) kast.add(id);
  return {
    kast,
    firstKill: kills[0]?.killer.steamId ?? null,
    firstDeath: kills[0]?.victim.steamId ?? null,
  };
}

/** Обновляет состав карты по событиям (сторона — по последней строке лога) */
export function updateRoster(roster: Map<string, Side>, events: LogEvent[]) {
  const put = (a: Actor | undefined) => {
    if (a?.steamId && a.side) roster.set(a.steamId, a.side);
  };
  for (const e of events) {
    if (e.type === "kill") {
      put(e.killer);
      put(e.victim);
    } else if (e.type === "assist") put(e.assister);
    else if (e.type === "suicide") put(e.victim);
    else if (e.type === "plant" || e.type === "defuse") put(e.actor);
  }
  return roster;
}
