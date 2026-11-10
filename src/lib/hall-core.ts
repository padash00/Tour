/**
 * Рассадка команд в зале клуба (чистая логика, без базы — проверяется в scripts/test-hall.mts).
 *
 * Зал: Premium — ПК 1–30, шесть рядов по 5 ПК; ряды попарно смотрят друг на друга
 * (1–5 ↔ 6–10, 11–15 ↔ 16–20, 21–25 ↔ 26–30). Standart — ПК 31–55, четыре блока по 5–6 ПК, всё близко.
 * Одна команда — один блок. Соперники не должны слышать коллы и видеть экраны друг друга:
 *  - в Premium соперники сидят минимум через два ряда (1–5 против 16–20 можно, против 11–15 — нет);
 *  - в Standart соперники друг против друга не сидят вообще: команда из Standart играет против Premium.
 * Таблица запретов по умолчанию — DEFAULT_FORBIDDEN; в пульте её можно поправить (HALL_FORBIDDEN).
 */

export type HallZone = "premium" | "standart";
export type HallBlock = { id: string; zone: HallZone; from: number; to: number; row?: number };

export const HALL_BLOCKS: HallBlock[] = [
  { id: "P1", zone: "premium", from: 1, to: 5, row: 1 },
  { id: "P2", zone: "premium", from: 6, to: 10, row: 2 },
  { id: "P3", zone: "premium", from: 11, to: 15, row: 3 },
  { id: "P4", zone: "premium", from: 16, to: 20, row: 4 },
  { id: "P5", zone: "premium", from: 21, to: 25, row: 5 },
  { id: "P6", zone: "premium", from: 26, to: 30, row: 6 },
  { id: "S1", zone: "standart", from: 31, to: 36 },
  { id: "S2", zone: "standart", from: 37, to: 41 },
  { id: "S3", zone: "standart", from: 42, to: 47 },
  { id: "S4", zone: "standart", from: 49, to: 53 },
];

/** Блоки, где на турнире не сидят (по умолчанию): 31–36 и 42–47. В пульте «Зал» — кнопкой у блока (HALL_OFF) */
export const DEFAULT_OFF = ["S1", "S3"];

/** HALL_OFF из настроек: "S1,S3"; пусто — по умолчанию; "none" — все блоки в игре */
export function parseOff(raw: string | null | undefined): Set<string> {
  if (raw == null || !raw.trim()) return new Set(DEFAULT_OFF);
  if (raw.trim() === "none") return new Set();
  const ids = new Set(HALL_BLOCKS.map((b) => b.id));
  return new Set(raw.split(",").map((x) => x.trim()).filter((x) => ids.has(x)));
}

export const serializeOff = (set: Set<string>) => (set.size ? [...set].sort().join(",") : "none");

/** Запасные ПК — не входят в блоки, пересадка одного игрока при поломке */
export const HALL_SPARE_PCS = [54, 55];

export const ZONE_LABEL: Record<HallZone, string> = { premium: "Premium", standart: "Standart" };

export const blockById = (id: string | null | undefined) => HALL_BLOCKS.find((b) => b.id === id) ?? null;

/** «ПК 37–41 (Standart)» */
export function blockLabel(id: string | null | undefined, withZone = true) {
  const b = blockById(id);
  if (!b) return "—";
  return `ПК ${b.from}–${b.to}${withZone ? ` (${ZONE_LABEL[b.zone]})` : ""}`;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Отдельные запреты по залу (кроме правил «Standart против Standart» и «в Premium ближе двух рядов») */
const EXTRA_FORBIDDEN: [string, string][] = [
  ["S2", "P2"],
  ["S2", "P3"],
];

/** Запрещённые пары соперников по умолчанию */
export function defaultForbidden(): Set<string> {
  const out = new Set<string>();
  for (const a of HALL_BLOCKS)
    for (const b of HALL_BLOCKS) {
      if (a.id >= b.id) continue;
      const bothStandart = a.zone === "standart" && b.zone === "standart";
      const closeRows = a.zone === "premium" && b.zone === "premium" && Math.abs((a.row ?? 0) - (b.row ?? 0)) < 3;
      if (bothStandart || closeRows) out.add(pairKey(a.id, b.id));
    }
  // 37–41 стоит у стены рядом с рядами 6–10 и 11–15 Premium — слышно через проход
  for (const [a, b] of EXTRA_FORBIDDEN) out.add(pairKey(a, b));
  return out;
}

/** HALL_FORBIDDEN из настроек: "P1-P2,P1-P3,…"; пусто — по умолчанию */
export function parseForbidden(raw: string | null | undefined): Set<string> {
  if (!raw?.trim()) return defaultForbidden();
  if (raw.trim() === "none") return new Set();
  const ids = new Set(HALL_BLOCKS.map((b) => b.id));
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const [a, b] = part.trim().split("-");
    if (a && b && a !== b && ids.has(a) && ids.has(b)) out.add(pairKey(a, b));
  }
  return out;
}

export function serializeForbidden(set: Set<string>) {
  return set.size ? [...set].sort().join(",") : "none";
}

/** В каком порядке занимать блоки, когда команды ещё нигде не сидят */
const FILL_ORDER = ["P3", "P2", "P5", "P6", "P1", "P4", "S1", "S2", "S3", "S4"];

export type SeatInput = {
  team1: string;
  team2: string;
  /** где команда сидела в прошлый раз */
  last: Map<string, string>;
  /** блоки, где сейчас сидит другая команда (идёт матч, или он только что закончился) — занимать нельзя */
  occupied: Map<string, string>;
  /** блоки, которые «держит» команда, ждущая следующего матча, — занимать можно, но лучше не надо */
  reserved: Map<string, string>;
  forbidden: Set<string>;
  /** блоки, где на турнире не сидят */
  off?: Set<string>;
};

export type SeatPlan = { seat1: string; seat2: string; moved1: boolean; moved2: boolean };

/**
 * Лучшие места для матча: соперники не в запрещённой паре; кто уже сидит — остаётся на своём месте,
 * пересаживаем как можно меньше команд; чужие занятые блоки не трогаем. null — мест нет, ждём.
 */
export function chooseSeats(input: SeatInput): SeatPlan | null {
  const { team1, team2, last, occupied, reserved, forbidden, off } = input;
  const usable = (block: string, team: string) => {
    if (off?.has(block)) return false;
    const who = occupied.get(block);
    return !who || who === team;
  };
  const cost = (block: string, team: string) => {
    const prev = last.get(team);
    let c = 0;
    if (prev && prev !== block) c += 100; // пересадка
    const holder = reserved.get(block);
    if (holder && holder !== team) c += 10; // место ждущей команды
    return c;
  };
  let best: (SeatPlan & { cost: number }) | null = null;
  for (let i = 0; i < HALL_BLOCKS.length; i++)
    for (let j = 0; j < HALL_BLOCKS.length; j++) {
      if (i === j) continue;
      const a = HALL_BLOCKS[i].id;
      const b = HALL_BLOCKS[j].id;
      if (forbidden.has(pairKey(a, b))) continue;
      if (!usable(a, team1) || !usable(b, team2)) continue;
      // при равной цене: сначала матчи Premium против Standart, а внутри Premium оставляем свободными
      // 1–5 и 16–20 — подходящую пару для пятого матча (см. FILL_ORDER)
      const samePremium = HALL_BLOCKS[i].zone === "premium" && HALL_BLOCKS[j].zone === "premium";
      const c = cost(a, team1) + cost(b, team2) + (samePremium ? 1 : 0) + (FILL_ORDER.indexOf(a) + FILL_ORDER.indexOf(b)) / 100;
      if (!best || c < best.cost) {
        best = { seat1: a, seat2: b, moved1: !!last.get(team1) && last.get(team1) !== a, moved2: !!last.get(team2) && last.get(team2) !== b, cost: c };
      }
    }
  if (!best) return null;
  const { cost: _c, ...plan } = best;
  void _c;
  return plan;
}

/**
 * Схема зала как в программе клуба: номер ПК → клетка сетки [столбец, строка].
 * Standart (слева) — сетка 6×9, Premium (справа) — 5×9 (пустые строки — проходы).
 */
export const HALL_MAP: { zone: HallZone; cols: number; rows: number; pcs: Record<number, [number, number]>; desk?: [number, number] }[] = [
  {
    zone: "standart",
    cols: 6,
    rows: 9,
    desk: [1, 0],
    pcs: {
      34: [4, 0], 31: [5, 0], 35: [4, 1], 32: [5, 1], 36: [4, 2], 33: [5, 2],
      48: [2, 3], 47: [3, 3], 49: [2, 4], 46: [3, 4], 37: [5, 4], 50: [2, 5], 45: [3, 5], 38: [5, 5],
      51: [2, 6], 44: [3, 6], 39: [5, 6], 55: [0, 7], 52: [2, 7], 43: [3, 7], 40: [5, 7], 54: [0, 8], 53: [2, 8], 42: [3, 8], 41: [5, 8],
    },
  },
  {
    zone: "premium",
    cols: 5,
    rows: 9,
    pcs: Object.fromEntries(
      [
        [0, 1],
        [1, 6],
        [4, 11],
        [5, 16],
        [7, 21],
        [8, 26],
      ].flatMap(([row, first]) => [0, 1, 2, 3, 4].map((k) => [first + k, [4 - k, row] as [number, number]])),
    ),
  },
];

/** В каком блоке ПК */
export const blockOfPc = (pc: number) => HALL_BLOCKS.find((b) => pc >= b.from && pc <= b.to)?.id ?? null;
