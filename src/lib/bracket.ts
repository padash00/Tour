/**
 * Сетка Double Elimination / Single Elimination.
 * Чистые функции: генерация структуры и «разрешение» сетки (баи, продвижение по результатам).
 */

export type Side = "upper" | "lower" | "grand_final" | "group" | "swiss";
export type MatchStatus = "pending" | "upcoming" | "veto" | "ready" | "live" | "finished" | "cancelled";

export type BracketMatch = {
  key: string; // `${bracket}:${round}:${position}`
  number: number;
  bracket: Side;
  round: number;
  position: number;
  best_of: number;
  status: MatchStatus;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
  is_walkover: boolean;
  winner_to: { key: string; slot: 1 | 2 } | null;
  loser_to: { key: string; slot: 1 | 2 } | null;
};

export const matchKey = (bracket: Side, round: number, position: number) => `${bracket}:${round}:${position}`;

/** Классический порядок посева: 1-16, 8-9, 5-12, 4-13, … */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function bracketSize(teams: number) {
  let size = 2;
  while (size < teams) size *= 2;
  return size;
}

/** Количество матчей в раунде нижней сетки (раунды 1..2(k-1)) */
function lowerRoundSize(size: number, round: number) {
  if (round === 1) return size / 4;
  const j = Math.floor(round / 2);
  return round % 2 === 0 ? size / 2 ** (j + 1) : size / 2 ** (j + 2);
}

export type GenerateOptions = {
  /** id команд в порядке посева (первый — 1-й сид) */
  seeded: string[];
  double: boolean;
  /** формат обычных матчей и финальной стадии (последние 4 команды) */
  bestOf?: number;
  finalBestOf?: number;
};

/**
 * Генерирует структуру сетки. best_of по умолчанию: BO1, а финальная стадия (последние 4 команды) — BO3:
 * финал верхней сетки, два последних раунда нижней и гранд-финал (в SE — полуфиналы и финал).
 */
export function generateBracket({ seeded, double, bestOf = 1, finalBestOf = 3 }: GenerateOptions): BracketMatch[] {
  const size = bracketSize(Math.max(seeded.length, double ? 4 : 2));
  const k = Math.log2(size);
  const matches: BracketMatch[] = [];
  const blank = (bracket: Side, round: number, position: number, best_of: number): BracketMatch => ({
    key: matchKey(bracket, round, position),
    number: 0,
    bracket,
    round,
    position,
    best_of,
    status: "pending",
    team1_id: null,
    team2_id: null,
    winner_id: null,
    is_walkover: false,
    winner_to: null,
    loser_to: null,
  });

  // верхняя сетка
  for (let r = 1; r <= k; r++) {
    const count = size / 2 ** r;
    const bo3 = double ? r === k : r >= k - 1;
    for (let p = 0; p < count; p++) matches.push(blank("upper", r, p, bo3 ? finalBestOf : bestOf));
  }
  const order = seedOrder(size);
  for (let p = 0; p < size / 2; p++) {
    const m = matches.find((x) => x.key === matchKey("upper", 1, p))!;
    m.team1_id = seeded[order[2 * p] - 1] ?? null;
    m.team2_id = seeded[order[2 * p + 1] - 1] ?? null;
  }

  if (double) {
    const lbRounds = 2 * (k - 1);
    for (let r = 1; r <= lbRounds; r++) {
      const count = lowerRoundSize(size, r);
      for (let p = 0; p < count; p++) matches.push(blank("lower", r, p, r >= lbRounds - 1 ? finalBestOf : bestOf));
    }
    matches.push(blank("grand_final", 1, 0, finalBestOf));
  }

  const get = (b: Side, r: number, p: number) => matches.find((x) => x.key === matchKey(b, r, p))!;

  for (const m of matches) {
    if (m.bracket === "upper") {
      if (m.round < k) {
        m.winner_to = { key: matchKey("upper", m.round + 1, Math.floor(m.position / 2)), slot: m.position % 2 === 0 ? 1 : 2 };
      } else if (double) {
        m.winner_to = { key: matchKey("grand_final", 1, 0), slot: 1 };
      }
      if (double) {
        if (m.round === 1) {
          m.loser_to = { key: matchKey("lower", 1, Math.floor(m.position / 2)), slot: m.position % 2 === 0 ? 1 : 2 };
        } else {
          const lbRound = 2 * (m.round - 1);
          const count = lowerRoundSize(size, lbRound);
          // чередуем порядок, чтобы реже было повторных встреч
          const pos = m.round % 2 === 0 ? count - 1 - m.position : m.position;
          m.loser_to = { key: get("lower", lbRound, pos).key, slot: 2 };
        }
      }
    } else if (m.bracket === "lower") {
      const lbRounds = 2 * (k - 1);
      if (m.round === lbRounds) {
        m.winner_to = { key: matchKey("grand_final", 1, 0), slot: 2 };
      } else if (m.round % 2 === 1) {
        m.winner_to = { key: matchKey("lower", m.round + 1, m.position), slot: 1 };
      } else {
        m.winner_to = { key: matchKey("lower", m.round + 1, Math.floor(m.position / 2)), slot: m.position % 2 === 0 ? 1 : 2 };
      }
    }
  }

  // сквозная нумерация: по раундам, чередуя верхнюю и нижнюю сетку
  const sortKey = (m: BracketMatch) => {
    if (m.bracket === "grand_final") return [1e6, 0, 0];
    // UB раунд r ≈ LB раунды 2r-2..2r-1
    const stage = m.bracket === "upper" ? m.round * 2 - 1 : m.round + 1;
    return [stage, m.bracket === "upper" ? 0 : 1, m.position];
  };
  matches.sort((a, b) => {
    const [a1, a2, a3] = sortKey(a);
    const [b1, b2, b3] = sortKey(b);
    return a1 - b1 || a2 - b2 || a3 - b3;
  });
  matches.forEach((m, i) => (m.number = i + 1));

  resolveBracket(matches);
  return matches;
}

/**
 * Приводит сетку в согласованное состояние:
 * - победители и проигравшие завершённых матчей попадают в следующие матчи;
 * - матч с одной командой и пустым вторым слотом — техническая победа (бай);
 * - матч без команд — отменён;
 * - матч, где обе команды известны, переходит из pending в upcoming.
 * Мутирует массив, возвращает ключи изменённых матчей.
 */
export function resolveBracket(matches: BracketMatch[]): Set<string> {
  const changed = new Set<string>();
  const byKey = new Map(matches.map((m) => [m.key, m]));
  const done = (m: BracketMatch) => m.status === "finished" || m.status === "cancelled";

  const place = (to: { key: string; slot: 1 | 2 } | null, team: string | null) => {
    if (!to || !team) return;
    const target = byKey.get(to.key);
    if (!target) return;
    const field = to.slot === 1 ? "team1_id" : "team2_id";
    if (target[field] !== team) {
      target[field] = team;
      changed.add(target.key);
    }
  };

  const feeders = (m: BracketMatch, slot: 1 | 2) =>
    matches.filter(
      (f) =>
        (f.winner_to?.key === m.key && f.winner_to.slot === slot) ||
        (f.loser_to?.key === m.key && f.loser_to.slot === slot),
    );

  for (let guard = 0; guard < matches.length * 8; guard++) {
    let progress = false;

    for (const m of matches) {
      if (m.status === "finished" && m.winner_id) {
        const loser = m.winner_id === m.team1_id ? m.team2_id : m.team1_id;
        const before = changed.size;
        place(m.winner_to, m.winner_id);
        place(m.loser_to, loser);
        if (changed.size !== before) progress = true;
      }
    }

    for (const m of matches) {
      if (done(m) || m.status === "live") continue;
      const pending1 = !m.team1_id && feeders(m, 1).some((f) => !done(f));
      const pending2 = !m.team2_id && feeders(m, 2).some((f) => !done(f));
      if (pending1 || pending2) continue;

      if (m.team1_id && m.team2_id) {
        if (m.status === "pending") {
          m.status = "upcoming";
          changed.add(m.key);
          progress = true;
        }
        continue;
      }
      if (m.team1_id || m.team2_id) {
        m.status = "finished";
        m.winner_id = m.team1_id ?? m.team2_id;
        m.is_walkover = true;
      } else {
        m.status = "cancelled";
      }
      changed.add(m.key);
      progress = true;
      // сначала продвинуть результат дальше, потом смотреть остальные матчи
      break;
    }

    if (!progress) break;
  }
  return changed;
}

export function roundTitle(bracket: Side, round: number, totalUpper: number, totalLower: number) {
  if (bracket === "grand_final") return "Гранд-финал";
  if (bracket === "group") return `Тур ${round}`;
  if (bracket === "swiss") return `Раунд ${round}`;
  if (bracket === "upper") {
    if (round === totalUpper) return totalLower ? "Финал верхней сетки" : "Финал";
    if (round === totalUpper - 1) return totalLower ? "Полуфинал верхней сетки" : "Полуфинал";
    return `Верхняя · раунд ${round}`;
  }
  if (round === totalLower) return "Финал нижней сетки";
  return `Нижняя · раунд ${round}`;
}
