import { randomInt } from "node:crypto";
import { drawOrder } from "./draw";

/**
 * Пары закрытого турнира 2×2 из игроков, прошедших check-in. Чистые функции (кроме источника случайности).
 *  - random — перемешать и разбить по двое;
 *  - elo — сильная половина (по FACEIT ELO) × слабая половина, соединяются случайно: игрок с 2000 попадает
 *    к тому, у кого ELO ниже или нет вовсе. Без FACEIT = 0 (самый слабый).
 * Нечётное число — один игрок остаётся запасным: в режиме elo самый слабый, в random — случайный.
 */

export type PairMode = "random" | "elo";
export type PairPlayer = { id: string; nickname: string; elo: number | null };
export type PairPlan = { pairs: [PairPlayer, PairPlayer][]; reserve: PairPlayer[] };

const eloOf = (p: PairPlayer) => (typeof p.elo === "number" && p.elo > 0 ? p.elo : 0);

export function makePairs(players: readonly PairPlayer[], mode: PairMode, random: (max: number) => number = randomInt): PairPlan {
  // случайный порядок до сортировки: при равном ELO (например, у всех без FACEIT) — тоже случайно
  const shuffled = drawOrder(players, random);
  if (mode === "random") {
    const reserve = shuffled.length % 2 ? [shuffled.pop()!] : [];
    const pairs: [PairPlayer, PairPlayer][] = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);
    return { pairs, reserve };
  }
  const sorted = [...shuffled].sort((a, b) => eloOf(b) - eloOf(a));
  const reserve = sorted.length % 2 ? [sorted.pop()!] : [];
  const half = sorted.length / 2;
  const strong = sorted.slice(0, half);
  const weak = drawOrder(sorted.slice(half), random);
  return { pairs: strong.map((s, i) => [s, weak[i]] as [PairPlayer, PairPlayer]), reserve };
}

/** Поменять двух игроков местами (в парах или с запасным) */
export function swapPlayers(plan: PairPlan, a: string, b: string): PairPlan {
  if (a === b) return plan;
  const all = [...plan.pairs.flat(), ...plan.reserve];
  const pa = all.find((p) => p.id === a);
  const pb = all.find((p) => p.id === b);
  if (!pa || !pb) return plan;
  const sw = (p: PairPlayer) => (p.id === a ? pb : p.id === b ? pa : p);
  return { pairs: plan.pairs.map(([x, y]) => [sw(x), sw(y)] as [PairPlayer, PairPlayer]), reserve: plan.reserve.map(sw) };
}

/** Сумма ELO пары — для предпросмотра баланса */
export const pairElo = (pair: readonly PairPlayer[]) => pair.reduce((s, p) => s + eloOf(p), 0);

/** «Ник1 + Ник2» — сильный первым; капитан пары — первый игрок */
export function pairName(pair: readonly [PairPlayer, PairPlayer]) {
  return `${pair[0].nickname} + ${pair[1].nickname}`.slice(0, 60);
}
