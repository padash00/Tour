import { randomInt } from "node:crypto";

/**
 * Жеребьёвка: случайный посев сетки. Перестановка Фишера–Йетса на криптографически стойком
 * генераторе (node:crypto randomInt) — каждая перестановка равновероятна и не предсказуема заранее.
 * Чистая функция (кроме источника случайности) — покрыта тестом scripts/test-tournament-structure.mts.
 */
export function drawOrder<T>(items: readonly T[], random: (max: number) => number = randomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1); // 0..i включительно
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Запись жеребьёвки в audit_logs (action = 'bracket.draw') — порядок посева, сид 1 первым */
export type DrawRecord = {
  order: { seed: number; team_id: string; name: string }[];
  teams: number;
  onlyCheckedIn: boolean;
  /** жеребьёвка проведена заново (предыдущая сетка удалена) */
  redo: boolean;
};

/** Разбор payload из audit_logs; null — запись не похожа на жеребьёвку */
export function parseDrawRecord(payload: unknown): DrawRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<DrawRecord>;
  if (!Array.isArray(p.order)) return null;
  const order = p.order
    .filter((x): x is DrawRecord["order"][number] => !!x && typeof x.team_id === "string" && typeof x.seed === "number")
    .map((x) => ({ seed: x.seed, team_id: x.team_id, name: typeof x.name === "string" ? x.name : "—" }))
    .sort((a, b) => a.seed - b.seed);
  return { order, teams: order.length, onlyCheckedIn: !!p.onlyCheckedIn, redo: !!p.redo };
}

/** «1. Alpha, 2. Bravo, …» */
export const drawOrderText = (record: DrawRecord) => record.order.map((x) => `${x.seed}. ${x.name}`).join(", ");
