/**
 * Чистая логика наград (без базы — покрыта тестом scripts/test-awards.mts).
 * Места 1/2/3 считаются по сетке плей-офф или, если её нет, по итоговой таблице.
 */

export type PlacementMatch = {
  bracket: "upper" | "lower" | "grand_final" | "third_place" | "group" | "swiss";
  round: number;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
};

export type Placement = { teamId: string; place: 1 | 2 | 3 };

/** Стороны сетки на выбывание (плей-офф) */
export const isPlayoffSide = (bracket: string) =>
  bracket === "upper" || bracket === "lower" || bracket === "grand_final" || bracket === "third_place";

const loserOf = (m: PlacementMatch) =>
  m.winner_id && m.team1_id && m.team2_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null;

/**
 * Места по завершённому турниру.
 * - Double Elimination: 1 — победитель гранд-финала, 2 — проигравший, 3 — проигравший финала нижней сетки.
 * - Single Elimination: 1/2 — финал (последний раунд верхней сетки); 3 — победитель матча за 3-е место,
 *   если он есть в сетке (пока не сыгран — 3-го места нет), иначе оба проигравших полуфинала (делят место).
 * - Без плей-офф (круговая, швейцарка): первые три строки итоговой таблицы `ranking`.
 * Если финал не сыгран — мест нет.
 */
export function computePlacements(matches: PlacementMatch[], ranking: string[] = []): Placement[] {
  const playoff = matches.filter((m) => isPlayoffSide(m.bracket));
  const out: Placement[] = [];
  const push = (teamId: string | null | undefined, place: 1 | 2 | 3) => {
    if (teamId && !out.some((p) => p.teamId === teamId)) out.push({ teamId, place });
  };

  if (playoff.length === 0) {
    ranking.slice(0, 3).forEach((id, i) => push(id, (i + 1) as 1 | 2 | 3));
    return out;
  }

  const gf = playoff.find((m) => m.bracket === "grand_final");
  if (gf) {
    if (gf.status !== "finished" || !gf.winner_id) return [];
    push(gf.winner_id, 1);
    push(loserOf(gf), 2);
    const lower = playoff.filter((m) => m.bracket === "lower" && m.status === "finished");
    const lowerFinal = lower.sort((a, b) => b.round - a.round)[0];
    if (lowerFinal) push(loserOf(lowerFinal), 3);
    return out;
  }

  const upper = playoff.filter((m) => m.bracket === "upper");
  const lastRound = Math.max(...upper.map((m) => m.round));
  const final = upper.find((m) => m.round === lastRound);
  if (!final || final.status !== "finished" || !final.winner_id) return [];
  push(final.winner_id, 1);
  push(loserOf(final), 2);
  const third = playoff.find((m) => m.bracket === "third_place");
  if (third) {
    // техническая победа без соперника (второй полуфиналист снялся) — тоже 3-е место
    if (third.status === "finished" && third.winner_id) push(third.winner_id, 3);
    return out;
  }
  for (const semi of upper.filter((m) => m.round === lastRound - 1 && m.status === "finished")) push(loserOf(semi), 3);
  return out;
}

export type StatLine = { key: string; maps: number; clutches: number; adr: number; teamMaps: number };

/** Лучший по показателю среди тех, кто сыграл хотя бы половину карт своей команды (минимум 1) */
export function bestBy(lines: StatLine[], pick: (l: StatLine) => number): StatLine | null {
  const eligible = lines.filter((l) => l.maps >= Math.max(1, Math.ceil(l.teamMaps / 2)));
  const best = eligible.sort((a, b) => pick(b) - pick(a))[0];
  return best && pick(best) > 0 ? best : null;
}

export type Trend = "up" | "down" | "flat";

/** Тренд показателя к прошлому турниру (порог — 3% от прошлого значения) */
export function trend(cur: number, prev: number | null | undefined): Trend {
  if (prev == null || prev === 0) return "flat";
  const d = (cur - prev) / Math.abs(prev);
  return d > 0.03 ? "up" : d < -0.03 ? "down" : "flat";
}

/** Проигравший в 1/4 финала: раунды в его матче (тех. поражение — 0:13) и данные для следующих шагов сравнения */
export type QuarterLoser = {
  teamId: string;
  won: number;
  lost: number;
  walkover: boolean;
  /** разница раундов за весь турнир (все его карты) */
  totalDiff: number;
  /** средний FACEIT ELO основного состава; null — нет данных */
  elo: number | null;
  /** жребий платформы: число из хэша «турнир:команда» — заранее известно и проверяемо, без участия людей */
  lot: number;
};
export type QuarterPlace = QuarterLoser & { place: string; by: QuarterTiebreak };
export type QuarterTiebreak = "diff" | "won" | "total" | "elo" | "lot";

/** Раунды, которые засчитываются за техническое поражение в 1/4 финала */
export const WALKOVER_ROUNDS = { won: 0, lost: 13 } as const;

/**
 * Места V–VIII среди выбывших в 1/4 финала (регламент OSKEMEN 2026, п. 4.6.1) — платформа решает сама, без судей:
 * 1) разница раундов в матче 1/4 финала; 2) выигранные раунды в нём; 3) разница раундов за весь турнир;
 * 4) средний FACEIT ELO основного состава; 5) жребий платформы. Равенства не остаётся никогда.
 * by — каким шагом место отделено от следующей команды (для подписи «почему так»).
 */
export function rankQuarterLosers(list: QuarterLoser[], firstPlace = 5): QuarterPlace[] {
  const keys: [QuarterTiebreak, (q: QuarterLoser) => number][] = [
    ["diff", (q) => q.won - q.lost],
    ["won", (q) => q.won],
    ["total", (q) => q.totalDiff],
    ["elo", (q) => q.elo ?? -1],
    ["lot", (q) => q.lot],
  ];
  const sorted = [...list].sort((a, b) => {
    for (const [, k] of keys) if (k(b) !== k(a)) return k(b) - k(a);
    return a.teamId < b.teamId ? -1 : 1;
  });
  return sorted.map((q, i) => {
    const prev = sorted[i - 1], next = sorted[i + 1];
    // шаг, на котором команда отличается от соседей (от того, что «ближе»)
    const step = (o: QuarterLoser | undefined) => (o ? keys.findIndex(([, k]) => k(o) !== k(q)) : 0);
    const deepest = Math.max(step(prev), step(next));
    return { ...q, place: String(firstPlace + i), by: keys[Math.max(0, deepest)][0] };
  });
}
