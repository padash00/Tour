/**
 * Тиры игроков по FACEIT ELO — для «Десятки» (игра на банк между игроками).
 * Общие для сервера и браузера. Границы задал владелец клуба (15.11.2026):
 *   S — от 3000, A — 2800–2999, B — 2500–2799, C — 2200–2499,
 *   D — от 9 уровня FACEIT до 2199. Ниже 9 уровня тира нет — в «Десятку» не попадают.
 * Нижняя граница D — по уровню FACEIT, а не по числу ELO: пороги уровней FACEIT меняет сам.
 */

export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type TierKey = (typeof TIERS)[number];

/** Минимальный уровень FACEIT для тира D */
export const TIER_MIN_LEVEL = 9;

/** Нижняя граница ELO тира (для D — граница по уровню, числа нет) */
export const TIER_FROM: Record<TierKey, number | null> = { S: 3000, A: 2800, B: 2500, C: 2200, D: null };

export function tierOf(elo: number | null | undefined, level: number | null | undefined): TierKey | null {
  if (!elo || elo <= 0) return null;
  if (elo >= 3000) return "S";
  if (elo >= 2800) return "A";
  if (elo >= 2500) return "B";
  if (elo >= 2200) return "C";
  return (level ?? 0) >= TIER_MIN_LEVEL ? "D" : null;
}

/** Диапазон тира для подписи: «3000+», «2800–2999», «9 уровень – 2199» */
export function tierRange(tier: TierKey, levelWord = "ур."): string {
  if (tier === "S") return "3000+";
  if (tier === "A") return "2800–2999";
  if (tier === "B") return "2500–2799";
  if (tier === "C") return "2200–2499";
  return `${TIER_MIN_LEVEL} ${levelWord} – 2199`;
}

/** Список тиров из любых данных: только известные, без повторов, в порядке S→D */
export function normalizeTiers(input: unknown, fallback: readonly TierKey[] = TIERS): TierKey[] {
  if (!Array.isArray(input)) return [...fallback];
  const set = new Set(input.map(String));
  const out = TIERS.filter((t) => set.has(t));
  return out.length ? out : [...fallback];
}

/** «S», «A–B», «все тиры» — коротко для списка лобби */
export function tiersLabel(tiers: readonly TierKey[], all = "все тиры"): string {
  if (tiers.length === TIERS.length) return all;
  return tiers.join(" · ");
}

export const TIER_COLOR: Record<TierKey, string> = {
  S: "#ff5a1f",
  A: "#ff8a3d",
  B: "#e3b465",
  C: "#6cc59a",
  D: "#a7b2c3",
};

/** Порядок выбора змейкой для двух капитанов: 1-2-2-1-1-2-2-1… (n — сколько игроков уже выбрано) */
export function snakeTurn(n: number): 1 | 2 {
  const i = n % 4;
  return i === 0 || i === 3 ? 1 : 2;
}
