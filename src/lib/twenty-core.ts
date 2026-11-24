/*
 * «Двадцатка» — расчёты без базы: общий рейтинг, рейтинг по картам, роли, номинации, рекорды, связки.
 * На вход — сыгранные игры на банк и строки статистики по картам; всё остальное считается здесь.
 * Проверка: npx tsx scripts/test-twenty.mts
 */

/** метка «текст переводится при показе» — её видит scripts/i18n-check.mjs */
const tr = <S extends string>(s: S) => s;

// ───────────────────────── вход

export type CoreMap = { map: string; status?: string | null; winner?: number | null; team1_score: number; team2_score: number };
export type CoreGame = {
  id: string;
  /** код большого лобби (вечер); null — отдельная игра на банк */
  code: string | null;
  winner: number | null;
  finished_at: string | null;
  maps: CoreMap[];
};
export type CoreStat = {
  game_id: string;
  map_number: number;
  steam_id: string;
  name: string | null;
  team: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshot_kills: number;
  rounds_played: number;
  kast: number;
  mvp: number;
  clutch_wins: number;
  first_kills: number;
  /** раунды с 3, 4 и 5 убийствами */
  k3: number;
  k4: number;
  k5: number;
  utility_damage: number;
  enemies_flashed: number;
  bomb_plants: number;
  bomb_defuses: number;
  // из лога раундов; у игр, сыгранных до его включения, — нули
  first_deaths: number;
  trade_kills: number;
  /** убийства из снайперских винтовок */
  sniper_kills: number;
  ct_rounds: number;
  ct_wins: number;
  ct_kills: number;
  ct_deaths: number;
  t_rounds: number;
  t_wins: number;
  t_kills: number;
  t_deaths: number;
};

// ───────────────────────── пороги

/** В общий рейтинг попадают сыгравшие хотя бы столько карт — одна удачная карта не делает королём */
export const TWENTY_MIN_MAPS = 2;
/** «Коронная» и «слабая» карта, хозяин карты: не меньше стольких игр на этой карте */
export const MAP_MIN = 2;
/** Роль и паутинка — от стольких карт: по одной-двум картам стиль не виден */
export const ROLE_MIN_MAPS = 3;
/** Связка считается от стольких матчей вместе */
export const DUO_MIN = 3;
/** Сезон — календарный месяц. Призы за 1–3 места сезона, тенге */
export const SEASON_PRIZES = [15000, 10000, 5000];
/** В зачёт сезона (и на призы) — сыгравшие за сезон не меньше стольких карт: две удачные карты приз не приносят */
export const SEASON_MIN_MAPS = 10;
/** Рекорды «за карту» — только полноценные карты (не обрывки по 5 раундов) */
const RECORD_MIN_ROUNDS = 12;
/** Насколько должен отличаться рейтинг последнего игрового дня, чтобы показать стрелку */
const TREND_MIN = 0.05;

// ───────────────────────── сумма и рейтинг

type Sum = {
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  hs: number;
  kast: number;
  mvp: number;
  clutches: number;
  firstKills: number;
  k3: number;
  k4: number;
  k5: number;
  utility: number;
  flashed: number;
  plants: number;
  defuses: number;
  /** раунды карт, по которым KAST известен: на остальных картах его нет, и делить на все раунды нельзя */
  kastRounds: number;
  firstDeaths: number;
  trades: number;
  sniper: number;
  ctR: number;
  ctW: number;
  ctK: number;
  ctD: number;
  tR: number;
  tW: number;
  tK: number;
  tD: number;
};

const zero = (): Sum => ({ maps: 0, rounds: 0, kills: 0, deaths: 0, assists: 0, damage: 0, hs: 0, kast: 0, mvp: 0, clutches: 0, firstKills: 0, k3: 0, k4: 0, k5: 0, utility: 0, flashed: 0, plants: 0, defuses: 0, kastRounds: 0, firstDeaths: 0, trades: 0, sniper: 0, ctR: 0, ctW: 0, ctK: 0, ctD: 0, tR: 0, tW: 0, tK: 0, tD: 0 });

function add(a: Sum, s: CoreStat) {
  a.maps++;
  a.rounds += s.rounds_played;
  a.kills += s.kills;
  a.deaths += s.deaths;
  a.assists += s.assists;
  a.damage += s.damage;
  a.hs += s.headshot_kills;
  a.kast += s.kast;
  a.mvp += s.mvp;
  a.clutches += s.clutch_wins;
  a.firstKills += s.first_kills;
  a.k3 += s.k3;
  a.k4 += s.k4;
  a.k5 += s.k5;
  a.utility += s.utility_damage;
  a.flashed += s.enemies_flashed;
  a.plants += s.bomb_plants;
  a.defuses += s.bomb_defuses;
  if (s.kast > 0) a.kastRounds += s.rounds_played;
  a.firstDeaths += s.first_deaths;
  a.trades += s.trade_kills;
  a.sniper += s.sniper_kills;
  a.ctR += s.ct_rounds;
  a.ctW += s.ct_wins;
  a.ctK += s.ct_kills;
  a.ctD += s.ct_deaths;
  a.tR += s.t_rounds;
  a.tW += s.t_wins;
  a.tK += s.t_kills;
  a.tD += s.t_deaths;
}

/** Та же база, что у рейтинга турниров (аппроксимация HLTV 2.0): средний игрок ≈ 1.00 */
export function ratingOf(a: Pick<Sum, "rounds" | "kills" | "deaths" | "assists" | "damage" | "kast" | "clutches"> & { kastRounds?: number }) {
  if (!a.rounds) return 0;
  const r = a.rounds;
  const kpr = a.kills / r;
  // KAST приходит не со всех матчей: без него берём типичные 70%, чтобы рейтинг оставался около 1.00
  // KAST известен не по всем картам: доля считается по тем раундам, где он есть
  const kast = a.kast > 0 ? (100 * a.kast) / (a.kastRounds || r) : 70;
  const impact = 2.13 * kpr + (0.42 * a.assists) / r - 0.41 + (1.5 * a.clutches) / r;
  return 0.0073 * kast + 0.3591 * kpr - (0.5329 * a.deaths) / r + 0.2372 * impact + (0.0032 * a.damage) / r + 0.1587;
}

// ───────────────────────── выход

export type MapCell = { map: string; maps: number; wins: number; rounds: number; kills: number; deaths: number; kd: number; adr: number; hsPct: number; rating: number };

export type RoleKey = "fragger" | "sniper" | "entry" | "clutch" | "support" | "headshot" | "multi" | "survivor" | "bomber" | "stable" | "universal";
export const ROLES: Record<RoleKey, { label: string; hint: string }> = {
  fragger: { label: tr("Фраггер"), hint: tr("Больше всех убивает за раунд") },
  sniper: { label: tr("Снайпер"), hint: tr("Большая доля убийств из AWP и других снайперских винтовок") },
  entry: { label: tr("Открывашка"), hint: tr("Чаще других делает первое убийство в раунде") },
  clutch: { label: tr("Клатчер"), hint: tr("Выигрывает раунды, оставшись один") },
  support: { label: tr("Опорник"), hint: tr("Ассисты, ослепления и урон гранатами") },
  headshot: { label: tr("Хедшотник"), hint: tr("Самая высокая доля убийств в голову") },
  multi: { label: tr("Мультикиллер"), hint: tr("Часто забирает троих и больше за раунд") },
  survivor: { label: tr("Живучий"), hint: tr("Реже всех умирает") },
  bomber: { label: tr("Подрывник"), hint: tr("Чаще других ставит и снимает бомбу") },
  stable: { label: tr("Стабильный"), hint: tr("Играет ровно от карты к карте") },
  universal: { label: tr("Универсал"), hint: tr("Без явного перекоса — всего понемногу") },
};

export const RADAR_AXES = [
  { key: "fire", label: tr("Огонь"), hint: tr("Урон и убийства за раунд") },
  { key: "aim", label: tr("Точность"), hint: tr("Доля убийств в голову") },
  { key: "clutch", label: tr("Клатчи"), hint: tr("Выигранные раунды в одиночку") },
  { key: "support", label: tr("Поддержка"), hint: tr("Ассисты, ослепления, урон гранатами") },
  { key: "survive", label: tr("Живучесть"), hint: tr("Как редко умирает") },
  { key: "stable", label: tr("Стабильность"), hint: tr("Ровная игра от карты к карте") },
] as const;
export type RadarKey = (typeof RADAR_AXES)[number]["key"];

export type TwentyRow = {
  steam_id: string;
  /** ник из статистики сервера — запасной, если игрока нет в базе */
  name: string | null;
  /** сыграно карт */
  maps: number;
  /** сыграно и выиграно матчей (серий) */
  matches: number;
  wins: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  adr: number;
  hsPct: number;
  /** доля раундов с пользой, %; 0 — сервер её не прислал */
  kast: number;
  mvp: number;
  rating: number;
  clutches: number;
  /** раунды с тремя и более убийствами; из них эйсов */
  multi: number;
  aces: number;
  utility: number;
  flashed: number;
  /** первые убийства и первые смерти в раунде, размены; нули — лог раундов для этих игр не вёлся */
  entries: number;
  entryDeaths: number;
  trades: number;
  /** доля убийств из снайперских винтовок, 0–1 */
  sniperShare: number;
  /** игра за защиту и за атаку (null — лог раундов не вёлся) */
  sides: Record<"ct" | "t", { rounds: number; wins: number; kills: number; deaths: number; kd: number }> | null;
  /** по картам: лучшая сверху */
  byMap: MapCell[];
  /** коронная и слабая карта (от MAP_MIN игр на карте) */
  best: MapCell | null;
  worst: MapCell | null;
  /** роль и паутинка — от ROLE_MIN_MAPS карт */
  role: RoleKey | null;
  radar: Record<RadarKey, number> | null;
  /** рейтинг последнего игрового дня минус рейтинг до него; null — сравнивать не с чем */
  trend: number | null;
  /** последние матчи, свежий первым */
  form: ("W" | "L")[];
  /** идущая серия побед и лучшая за всё время */
  streak: number;
  bestStreak: number;
  /** сезон: набрал карты для зачёта (вне сезона — всегда true) и сколько тенге сейчас причитается за место */
  qualified: boolean;
  prize: number | null;
};

export type MapBoard = {
  map: string;
  /** сколько раз карту сыграли */
  played: number;
  /** порог таблицы: сколько игр на карте нужно, чтобы в неё попасть */
  minMaps: number;
  rows: (MapCell & { steam_id: string; name: string | null })[];
};

export type NominationKey = "clutch" | "multi" | "grenade" | "flash" | "headshot" | "damage" | "entry" | "map" | "progress";
export const NOMINATIONS: Record<NominationKey, { label: string; hint: string }> = {
  clutch: { label: tr("Клатчер"), hint: tr("Больше всех раундов, выигранных в одиночку") },
  multi: { label: tr("Мультикиллер"), hint: tr("Больше всех раундов с тремя и более убийствами") },
  grenade: { label: tr("Гранатомётчик"), hint: tr("Больше всех урона гранатами") },
  flash: { label: tr("Ослепитель"), hint: tr("Больше всех ослеплённых соперников") },
  headshot: { label: tr("Хедшотник"), hint: tr("Самая высокая доля убийств в голову") },
  damage: { label: tr("Дамагер"), hint: tr("Самый высокий урон за раунд") },
  entry: { label: tr("Открывашка"), hint: tr("Больше всех первых убийств в раунде") },
  map: { label: tr("Лучшая игра"), hint: tr("Лучшая отдельная карта по рейтингу") },
  progress: { label: tr("Прогресс"), hint: tr("Сильнее всех прибавил к своему прежнему рейтингу") },
};
export type Nomination = {
  key: NominationKey;
  steam_id: string;
  name: string | null;
  /** главное число номинации, уже готовое к показу */
  value: string;
  /** пояснение: число-основание (всего, карта, счёт) */
  detail: { kind: "total" | "perMap" | "kills" | "map" | "delta"; n?: number; map?: string; kills?: number; deaths?: number; from?: number; to?: number };
  game_id?: string;
};

export type RecordKey = "kills_map" | "rating_map" | "adr_map" | "hs_map" | "utility_map" | "flash_map" | "kills_match" | "streak";
export const RECORDS: Record<RecordKey, string> = {
  kills_map: tr("Убийств за карту"),
  rating_map: tr("Рейтинг за карту"),
  adr_map: tr("ADR за карту"),
  hs_map: tr("Убийств в голову за карту"),
  utility_map: tr("Урон гранатами за карту"),
  flash_map: tr("Ослеплено за карту"),
  kills_match: tr("Убийств за матч"),
  streak: tr("Побед подряд"),
};
export type RecordItem = { key: RecordKey; steam_id: string; name: string | null; value: string; map: string | null; game_id: string | null; at: string | null; note: string | null };

export type Duo = { a: string; b: string; games: number; wins: number };
export type Versus = { steam_id: string; games: number; wins: number };

export type Season = {
  /** «2026-11» */
  key: string;
  matches: number;
  mapsPlayed: number;
  /** месяц уже закончился — места окончательные */
  finished: boolean;
  /** первые три места среди набравших карты для зачёта */
  podium: { steam_id: string; name: string | null; rating: number; maps: number; prize: number }[];
};

export type Twenty = {
  /** сезоны, свежий первым */
  seasons: Season[];
  rows: TwentyRow[];
  boards: MapBoard[];
  nominations: Nomination[];
  records: RecordItem[];
  duos: Duo[];
  /** сколько матчей и карт учтено */
  matches: number;
  mapsPlayed: number;
};

// ───────────────────────── подготовка

type Line = CoreStat & { game: CoreGame; map: string | null; mapWon: boolean; rating: number; at: number; scoreFor: number; scoreAgainst: number };

/** Игровой день: игры после полуночи относятся к вечеру накануне (Казахстан, UTC+5; граница — 6 утра) */
function playDay(iso: string | null) {
  const ts = iso ? Date.parse(iso) : 0;
  return Math.floor((ts - 3_600_000) / 86_400_000);
}
const dayIso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
/** Сезон игры — месяц её игрового дня: «2026-11» */
export const seasonOf = (iso: string | null) => dayIso(playDay(iso)).slice(0, 7);
/** Сезон, который идёт сейчас */
export const currentSeason = (now = Date.now()) => seasonOf(new Date(now).toISOString());

function toLines(games: CoreGame[], stats: CoreStat[]): Line[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  // номера карт в статистике идут с нуля или с единицы — приводим к порядку карт серии
  const base = new Map<string, number>();
  for (const s of stats) base.set(s.game_id, Math.min(base.get(s.game_id) ?? Infinity, s.map_number));
  const out: Line[] = [];
  for (const s of stats) {
    const game = byId.get(s.game_id);
    if (!game || !s.rounds_played) continue;
    const m = game.maps[s.map_number - (base.get(s.game_id) ?? 0)] ?? null;
    const winner = m ? (m.winner ?? (m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : null)) : null;
    const [scoreFor, scoreAgainst] = m ? (s.team === 1 ? [m.team1_score, m.team2_score] : [m.team2_score, m.team1_score]) : [0, 0];
    out.push({ ...s, game, map: m?.map ?? null, mapWon: winner === s.team, scoreFor, scoreAgainst, rating: ratingOf({ rounds: s.rounds_played, kills: s.kills, deaths: s.deaths, assists: s.assists, damage: s.damage, kast: s.kast, clutches: s.clutch_wins, kastRounds: s.rounds_played }), at: game.finished_at ? Date.parse(game.finished_at) : 0 });
  }
  return out;
}

function cell(map: string, a: Sum, wins: number): MapCell {
  const r = Math.max(1, a.rounds);
  return { map, maps: a.maps, wins, rounds: a.rounds, kills: a.kills, deaths: a.deaths, kd: a.deaths ? a.kills / a.deaths : a.kills, adr: a.damage / r, hsPct: a.kills ? (100 * a.hs) / a.kills : 0, rating: ratingOf(a) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
/** z-оценки: насколько значение выше среднего по игрокам, в стандартных отклонениях */
function zScores(xs: number[]) {
  const m = mean(xs);
  const sd = stdev(xs);
  return xs.map((x) => (sd > 1e-9 ? (x - m) / sd : 0));
}
/** место среди всех, 0–100: 100 — лучший */
function percentiles(xs: number[]) {
  if (xs.length < 2) return xs.map(() => 50);
  return xs.map((x) => {
    const below = xs.filter((y) => y < x).length;
    const same = xs.filter((y) => y === x).length - 1;
    return Math.round((100 * (below + same / 2)) / (xs.length - 1));
  });
}

type Player = {
  steam_id: string;
  name: string | null;
  sum: Sum;
  lines: Line[];
  /** матчи по времени: старые первыми */
  games: { game: CoreGame; team: number; won: boolean }[];
};

function collect(lines: Line[]): Player[] {
  const by = new Map<string, Player>();
  for (const l of lines) {
    let p = by.get(l.steam_id);
    if (!p) by.set(l.steam_id, (p = { steam_id: l.steam_id, name: l.name, sum: zero(), lines: [], games: [] }));
    add(p.sum, l);
    p.lines.push(l);
    if (l.name) p.name = p.name ?? l.name;
    if (!p.games.some((g) => g.game.id === l.game.id)) p.games.push({ game: l.game, team: l.team, won: l.game.winner === l.team });
  }
  for (const p of by.values()) {
    p.lines.sort((x, y) => x.at - y.at || x.map_number - y.map_number);
    p.games.sort((x, y) => (x.game.finished_at ?? "").localeCompare(y.game.finished_at ?? ""));
  }
  return [...by.values()];
}

function mapCells(p: Player): MapCell[] {
  const by = new Map<string, { sum: Sum; wins: number }>();
  for (const l of p.lines) {
    if (!l.map) continue;
    let c = by.get(l.map);
    if (!c) by.set(l.map, (c = { sum: zero(), wins: 0 }));
    add(c.sum, l);
    if (l.mapWon) c.wins++;
  }
  return [...by.entries()].map(([map, c]) => cell(map, c.sum, c.wins)).sort((x, y) => y.rating - x.rating || y.maps - x.maps);
}

function streaks(games: Player["games"]) {
  let best = 0;
  let run = 0;
  for (const g of games) {
    run = g.won ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { streak: run, bestStreak: best };
}

function trendOf(p: Player): number | null {
  const days = [...new Set(p.lines.map((l) => playDay(l.game.finished_at)))].sort((a, b) => a - b);
  if (days.length < 2) return null;
  const last = days[days.length - 1];
  const before = zero();
  const now = zero();
  for (const l of p.lines) add(playDay(l.game.finished_at) === last ? now : before, l);
  // по одной карте с каждой стороны стрелку не рисуем — это шум
  if (before.maps < 2 || now.maps < 2) return null;
  const d = ratingOf(now) - ratingOf(before);
  return Math.abs(d) >= TREND_MIN ? d : 0;
}

/** Роли и паутинка: сравниваем игроков между собой, поэтому считаем сразу по всем */
function styles(players: Player[]) {
  const pool = players.filter((p) => p.sum.maps >= ROLE_MIN_MAPS && p.sum.rounds > 0);
  const out = new Map<string, { role: RoleKey; radar: Record<RadarKey, number> }>();
  if (pool.length < 3) return out;
  const per = (f: (s: Sum) => number) => pool.map((p) => f(p.sum) / p.sum.rounds);
  const kpr = per((s) => s.kills);
  const dpr = per((s) => s.deaths);
  const adr = per((s) => s.damage);
  const apr = per((s) => s.assists);
  const flash = per((s) => s.flashed);
  const util = per((s) => s.utility);
  const clutch = per((s) => s.clutches);
  const multi = per((s) => s.k3 + s.k4 + s.k5);
  const bomb = per((s) => s.plants + s.defuses);
  const entry = per((s) => s.firstKills);
  const hs = pool.map((p) => (p.sum.kills ? p.sum.hs / p.sum.kills : 0));
  const spread = pool.map((p) => stdev(p.lines.map((l) => l.rating)));
  const hasEntry = entry.some((x) => x > 0);
  // снайпер — только тот, у кого из винтовки хотя бы каждое пятое убийство
  const sniper = pool.map((p) => (p.sum.kills ? p.sum.sniper / p.sum.kills : 0));
  const zSniper = zScores(sniper).map((x, i) => (sniper[i] >= 0.2 ? x : -9));

  const zk = zScores(kpr);
  const zd = zScores(dpr);
  const za = zScores(apr);
  const zf = zScores(flash);
  const zu = zScores(util);
  const support = za.map((x, i) => 0.4 * x + 0.3 * zf[i] + 0.3 * zu[i]);
  const fire = zScores(adr).map((x, i) => (x + zk[i]) / 2);
  const z: Record<Exclude<RoleKey, "universal" | "stable">, number[]> = {
    fragger: zk,
    sniper: zSniper,
    entry: hasEntry ? zScores(entry) : entry.map(() => -9),
    clutch: zScores(clutch),
    support: zScores(support),
    headshot: zScores(hs),
    multi: zScores(multi),
    survivor: zd.map((x) => -x),
    // бомбу чаще ставит тот, кто её носит, — это слабый признак стиля, поэтому он уступает остальным
    bomber: zScores(bomb).map((x) => 0.6 * x),
  };
  const zStable = zScores(spread).map((x) => -x);

  const pFire = percentiles(fire);
  const pAim = percentiles(hs);
  const pClutch = percentiles(clutch);
  const pSupport = percentiles(support);
  const pSurvive = percentiles(dpr.map((x) => -x));
  const pStable = percentiles(spread.map((x) => -x));

  pool.forEach((p, i) => {
    let role: RoleKey = "universal";
    let top = 0.8; // ниже этого явного перекоса нет
    for (const k of Object.keys(z) as (keyof typeof z)[]) {
      if (z[k][i] > top) {
        top = z[k][i];
        role = k;
      }
    }
    // «стабильный» — только при хорошем рейтинге и достаточном числе карт: ровно плохо играть — не роль
    if (p.sum.maps >= 5 && ratingOf(p.sum) >= 0.95 && zStable[i] > top) role = "stable";
    out.set(p.steam_id, { role, radar: { fire: pFire[i], aim: pAim[i], clutch: pClutch[i], support: pSupport[i], survive: pSurvive[i], stable: pStable[i] } });
  });
  return out;
}

function rowsOf(players: Player[], minMaps: number, season = false): TwentyRow[] {
  const style = styles(players);
  const rows: TwentyRow[] = players
    .filter((p) => p.sum.maps >= minMaps)
    .map((p) => {
      const a = p.sum;
      const r = Math.max(1, a.rounds);
      const byMap = mapCells(p);
      const solid = byMap.filter((c) => c.maps >= MAP_MIN);
      const st = style.get(p.steam_id);
      return {
        steam_id: p.steam_id,
        name: p.name,
        maps: a.maps,
        matches: p.games.length,
        wins: p.games.filter((g) => g.won).length,
        rounds: a.rounds,
        kills: a.kills,
        deaths: a.deaths,
        assists: a.assists,
        kd: a.deaths ? a.kills / a.deaths : a.kills,
        adr: a.damage / r,
        hsPct: a.kills ? (100 * a.hs) / a.kills : 0,
        kast: a.kast > 0 ? (100 * a.kast) / (a.kastRounds || r) : 0,
        mvp: a.mvp,
        rating: ratingOf(a),
        clutches: a.clutches,
        multi: a.k3 + a.k4 + a.k5,
        aces: a.k5,
        utility: a.utility,
        flashed: a.flashed,
        entries: a.firstKills,
        entryDeaths: a.firstDeaths,
        trades: a.trades,
        sniperShare: a.kills ? a.sniper / a.kills : 0,
        sides:
          a.ctR + a.tR > 0
            ? { ct: { rounds: a.ctR, wins: a.ctW, kills: a.ctK, deaths: a.ctD, kd: a.ctD ? a.ctK / a.ctD : a.ctK }, t: { rounds: a.tR, wins: a.tW, kills: a.tK, deaths: a.tD, kd: a.tD ? a.tK / a.tD : a.tK } }
            : null,
        byMap,
        best: solid[0] ?? null,
        // слабая карта — только если есть с чем сравнить
        worst: solid.length > 1 ? solid[solid.length - 1] : null,
        role: st?.role ?? null,
        radar: st?.radar ?? null,
        trend: trendOf(p),
        form: p.games.slice(-5).reverse().map((g): "W" | "L" => (g.won ? "W" : "L")),
        ...streaks(p.games),
        qualified: !season || a.maps >= SEASON_MIN_MAPS,
        prize: null,
      };
    })
    // в сезоне сначала идут набравшие карты для зачёта: места и призы считаются среди них
    .sort((x, y) => Number(y.qualified) - Number(x.qualified) || y.rating - x.rating || y.maps - x.maps);
  if (season) rows.forEach((r, i) => (r.prize = r.qualified ? (SEASON_PRIZES[i] ?? null) : null));
  return rows;
}

function boardsOf(rows: TwentyRow[], games: CoreGame[]): MapBoard[] {
  const played = new Map<string, number>();
  for (const g of games) for (const m of g.maps) if (m.status === "finished" || (m.status == null && m.team1_score + m.team2_score > 0)) played.set(m.map, (played.get(m.map) ?? 0) + 1);
  const by = new Map<string, MapBoard["rows"]>();
  for (const r of rows) for (const c of r.byMap) by.set(c.map, [...(by.get(c.map) ?? []), { ...c, steam_id: r.steam_id, name: r.name }]);
  return [...by.entries()]
    .map(([map, all]) => {
      // редкую карту показываем и по одной игре, иначе таблица пустая
      const minMaps = all.filter((c) => c.maps >= MAP_MIN).length >= 5 ? MAP_MIN : 1;
      return { map, played: played.get(map) ?? 0, minMaps, rows: all.filter((c) => c.maps >= minMaps).sort((x, y) => y.rating - x.rating || y.maps - x.maps) };
    })
    .sort((x, y) => y.played - x.played || x.map.localeCompare(y.map));
}

// ───────────────────────── номинации

function nominationsOf(scope: Player[], all: Player[], evening: boolean): Nomination[] {
  const out: Nomination[] = [];
  // общий зачёт — в среднем за карту и от ROLE_MIN_MAPS карт; вечер — просто сумма за вечер
  const pool = evening ? scope : scope.filter((p) => p.sum.maps >= ROLE_MIN_MAPS);
  const top = (key: NominationKey, f: (p: Player) => number, minValue: number, digits = 1) => {
    let best: Player | null = null;
    let bv = 0;
    for (const p of pool) {
      const v = evening ? f(p) : f(p) / p.sum.maps;
      if (f(p) >= minValue && (v > bv || (v === bv && best && p.sum.maps < best.sum.maps))) {
        best = p;
        bv = v;
      }
    }
    if (best) out.push({ key, steam_id: best.steam_id, name: best.name, value: evening ? String(f(best)) : bv.toFixed(digits), detail: evening ? { kind: "total", n: f(best) } : { kind: "perMap", n: f(best) } });
  };
  top("clutch", (p) => p.sum.clutches, 2, 2);
  top("multi", (p) => p.sum.k3 + p.sum.k4 + p.sum.k5, 2, 2);
  top("grenade", (p) => p.sum.utility, 50, 0);
  top("flash", (p) => p.sum.flashed, 5, 1);
  top("entry", (p) => p.sum.firstKills, 3, 2);

  const rate = (key: NominationKey, f: (p: Player) => number, show: (v: number) => string, ok: (p: Player) => boolean) => {
    const cands = pool.filter(ok).sort((x, y) => f(y) - f(x));
    const best = cands[0];
    if (best) out.push({ key, steam_id: best.steam_id, name: best.name, value: show(f(best)), detail: { kind: "kills", kills: best.sum.kills } });
  };
  const minKills = evening ? 15 : 40;
  rate("headshot", (p) => (100 * p.sum.hs) / Math.max(1, p.sum.kills), (v) => `${Math.round(v)}%`, (p) => p.sum.kills >= minKills);
  rate("damage", (p) => p.sum.damage / Math.max(1, p.sum.rounds), (v) => String(Math.round(v)), (p) => p.sum.rounds >= (evening ? 15 : 40));

  // лучшая отдельная карта
  let bestLine: Line | null = null;
  for (const p of scope) for (const l of p.lines) if (l.rounds_played >= RECORD_MIN_ROUNDS && (!bestLine || l.rating > bestLine.rating)) bestLine = l;
  if (bestLine) out.push({ key: "map", steam_id: bestLine.steam_id, name: bestLine.name, value: bestLine.rating.toFixed(2), detail: { kind: "map", map: bestLine.map ?? undefined, kills: bestLine.kills, deaths: bestLine.deaths }, game_id: bestLine.game.id });

  // прогресс: вечер — против всего сыгранного до него; общий зачёт — последний игровой день против прежних
  let prog: { p: Player; from: number; to: number } | null = null;
  if (evening) {
    const start = Math.min(...scope.flatMap((p) => p.lines.map((l) => l.at)));
    const full = new Map(all.map((p) => [p.steam_id, p]));
    for (const p of scope) {
      const before = zero();
      for (const l of full.get(p.steam_id)?.lines ?? []) if (l.at < start) add(before, l);
      if (before.maps < 2 || p.sum.maps < 2) continue;
      const from = ratingOf(before);
      const to = ratingOf(p.sum);
      if (to - from >= TREND_MIN && (!prog || to - from > prog.to - prog.from)) prog = { p, from, to };
    }
  } else {
    for (const p of scope) {
      const d = trendOf(p);
      if (d == null || d < TREND_MIN) continue;
      const last = Math.max(...p.lines.map((l) => playDay(l.game.finished_at)));
      const before = zero();
      for (const l of p.lines) if (playDay(l.game.finished_at) !== last) add(before, l);
      const from = ratingOf(before);
      if (!prog || d > prog.to - prog.from) prog = { p, from, to: from + d };
    }
  }
  if (prog) out.push({ key: "progress", steam_id: prog.p.steam_id, name: prog.p.name, value: `+${(prog.to - prog.from).toFixed(2)}`, detail: { kind: "delta", from: prog.from, to: prog.to } });
  return out;
}

// ───────────────────────── рекорды

function recordsOf(players: Player[]): RecordItem[] {
  const out: RecordItem[] = [];
  const lines = players.flatMap((p) => p.lines);
  const full = lines.filter((l) => l.rounds_played >= RECORD_MIN_ROUNDS);
  const byLine = (key: RecordKey, pool: Line[], f: (l: Line) => number, show: (v: number) => string, note?: (l: Line) => string) => {
    let best: Line | null = null;
    // при равенстве рекорд остаётся за тем, кто поставил его раньше
    for (const l of pool) if (f(l) > 0 && (!best || f(l) > f(best) || (f(l) === f(best) && l.at < best.at))) best = l;
    if (best) out.push({ key, steam_id: best.steam_id, name: best.name, value: show(f(best)), map: best.map, game_id: best.game.id, at: best.game.finished_at, note: note ? note(best) : null });
  };
  const kd = (l: Line) => `${l.kills}–${l.deaths}`;
  byLine("kills_map", lines, (l) => l.kills, String, (l) => kd(l));
  byLine("rating_map", full, (l) => l.rating, (v) => v.toFixed(2), kd);
  byLine("adr_map", full, (l) => l.damage / l.rounds_played, (v) => String(Math.round(v)), kd);
  byLine("hs_map", lines, (l) => l.headshot_kills, String, kd);
  byLine("utility_map", lines, (l) => l.utility_damage, String);
  byLine("flash_map", lines, (l) => l.enemies_flashed, String);

  let match: { p: Player; game: CoreGame; kills: number; deaths: number } | null = null;
  let streak: { p: Player; n: number; at: string | null } | null = null;
  for (const p of players) {
    for (const g of p.games) {
      const ls = p.lines.filter((l) => l.game.id === g.game.id);
      const kills = ls.reduce((s, l) => s + l.kills, 0);
      if (!match || kills > match.kills) match = { p, game: g.game, kills, deaths: ls.reduce((s, l) => s + l.deaths, 0) };
    }
    let run = 0;
    for (const g of p.games) {
      run = g.won ? run + 1 : 0;
      if (run >= 2 && (!streak || run > streak.n)) streak = { p, n: run, at: g.game.finished_at };
    }
  }
  if (match) out.push({ key: "kills_match", steam_id: match.p.steam_id, name: match.p.name, value: String(match.kills), map: null, game_id: match.game.id, at: match.game.finished_at, note: `${match.kills}–${match.deaths}` });
  if (streak) out.push({ key: "streak", steam_id: streak.p.steam_id, name: streak.p.name, value: String(streak.n), map: null, game_id: null, at: streak.at, note: null });
  return out;
}

// ───────────────────────── связки и личные встречи

type Pairs = { mates: Map<string, Map<string, Versus>>; foes: Map<string, Map<string, Versus>> };

function pairsOf(players: Player[]): Pairs {
  // состав матча — по строкам статистики: кто реально играл, а не кто был записан
  const rosters = new Map<string, { game: CoreGame; teams: Map<string, number> }>();
  for (const p of players)
    for (const g of p.games) {
      let r = rosters.get(g.game.id);
      if (!r) rosters.set(g.game.id, (r = { game: g.game, teams: new Map() }));
      r.teams.set(p.steam_id, g.team);
    }
  const mates: Pairs["mates"] = new Map();
  const foes: Pairs["foes"] = new Map();
  const bump = (m: Pairs["mates"], a: string, b: string, won: boolean) => {
    let row = m.get(a);
    if (!row) m.set(a, (row = new Map()));
    const v = row.get(b) ?? { steam_id: b, games: 0, wins: 0 };
    v.games++;
    if (won) v.wins++;
    row.set(b, v);
  };
  for (const { game, teams } of rosters.values()) {
    if (!game.winner) continue;
    for (const [a, ta] of teams) for (const [b, tb] of teams) if (a !== b) bump(ta === tb ? mates : foes, a, b, game.winner === ta);
  }
  return { mates, foes };
}

function duosOf(pairs: Pairs): Duo[] {
  const out: Duo[] = [];
  for (const [a, row] of pairs.mates) for (const [b, v] of row) if (a < b && v.games >= DUO_MIN) out.push({ a, b, games: v.games, wins: v.wins });
  return out.sort((x, y) => y.wins / y.games - x.wins / x.games || y.games - x.games).slice(0, 12);
}

export type Relations = {
  /** с кем чаще всего выигрывает */
  partner: Versus | null;
  /** против кого чаще всего проигрывает и кого чаще всего обыгрывает */
  nemesis: Versus | null;
  victim: Versus | null;
};

/** Напарник и соперники одного игрока — от двух матчей вместе или друг против друга */
function relationsOf(pairs: Pairs, steamId: string): Relations {
  const list = (m: Pairs["mates"]) => [...(m.get(steamId)?.values() ?? [])].filter((v) => v.games >= 2);
  const share = (v: Versus) => v.wins / v.games;
  const mates = list(pairs.mates).sort((x, y) => share(y) - share(x) || y.games - x.games);
  const foes = list(pairs.foes);
  const nemesis = [...foes].sort((x, y) => share(x) - share(y) || y.games - x.games)[0] ?? null;
  const victim = [...foes].sort((x, y) => share(y) - share(x) || y.games - x.games)[0] ?? null;
  return {
    partner: mates[0] && mates[0].wins > 0 ? mates[0] : null,
    nemesis: nemesis && share(nemesis) < 0.5 ? nemesis : null,
    victim: victim && share(victim) > 0.5 ? victim : null,
  };
}

// ───────────────────────── сезоны

function seasonsOf(games: CoreGame[], lines: Line[], now: number): Season[] {
  const current = currentSeason(now);
  const keys = [...new Set(games.map((g) => seasonOf(g.finished_at)))].sort().reverse();
  return keys.map((key) => {
    const own = games.filter((g) => seasonOf(g.finished_at) === key);
    const players = collect(lines.filter((l) => seasonOf(l.game.finished_at) === key));
    const podium = players
      .filter((p) => p.sum.maps >= SEASON_MIN_MAPS)
      .map((p) => ({ steam_id: p.steam_id, name: p.name, rating: ratingOf(p.sum), maps: p.sum.maps }))
      .sort((x, y) => y.rating - x.rating || y.maps - x.maps)
      .slice(0, SEASON_PRIZES.length)
      .map((x, i) => ({ ...x, prize: SEASON_PRIZES[i] }));
    return { key, matches: own.length, mapsPlayed: own.reduce((n, g) => n + g.maps.filter((m) => m.status === "finished").length, 0), finished: key < current, podium };
  });
}

// ───────────────────────── достижения

export type Tier = "bronze" | "silver" | "gold";
/** как показывать число достижения: целое, рейтинг с двумя знаками или проценты */
type AchFormat = "int" | "r2" | "pct";
type AchContext = { pairs: Pairs; owners: Set<string>; recordHolders: Set<string>; eveningKings: Map<string, number>; podiums: Map<string, number>; champions: Map<string, number> };
type AchDef = { key: string; label: string; hint: string; tier: Tier; need: number; format?: AchFormat; have: (p: Player, c: AchContext) => number };

const best = (p: Player, f: (l: Line) => number, ok: (l: Line) => boolean = () => true) => p.lines.reduce((m, l) => (ok(l) ? Math.max(m, f(l)) : m), 0);
const count = (p: Player, ok: (l: Line) => boolean) => p.lines.filter(ok).length;
const full = (l: Line) => l.rounds_played >= RECORD_MIN_ROUNDS;
const days = (p: Player) => new Set(p.lines.map((l) => playDay(l.game.finished_at))).size;
const won = (p: Player) => p.games.filter((g) => g.won).length;
const mateMax = (p: Player, c: AchContext, f: (v: Versus) => number) => Math.max(0, ...[...(c.pairs.mates.get(p.steam_id)?.values() ?? [])].map(f));

const ACHIEVEMENTS: AchDef[] = [
  // сколько сыграно
  { key: "maps10", label: tr("Втянулся"), hint: tr("Сыграть 10 карт"), tier: "bronze", need: 10, have: (p) => p.sum.maps },
  { key: "maps25", label: tr("Завсегдатай"), hint: tr("Сыграть 25 карт"), tier: "silver", need: 25, have: (p) => p.sum.maps },
  { key: "maps50", label: tr("Ветеран"), hint: tr("Сыграть 50 карт"), tier: "gold", need: 50, have: (p) => p.sum.maps },
  { key: "maps100", label: tr("Легенда Микса"), hint: tr("Сыграть 100 карт"), tier: "gold", need: 100, have: (p) => p.sum.maps },
  { key: "days3", label: tr("Свой человек"), hint: tr("Прийти на игры в 3 разных дня"), tier: "bronze", need: 3, have: days },
  { key: "days10", label: tr("Старожил"), hint: tr("Прийти на игры в 10 разных дней"), tier: "silver", need: 10, have: days },
  { key: "pool5", label: tr("Путешественник"), hint: tr("Сыграть на 5 разных картах"), tier: "bronze", need: 5, have: (p) => new Set(p.lines.map((l) => l.map).filter(Boolean)).size },
  // победы
  { key: "wins5", label: tr("Победитель"), hint: tr("Выиграть 5 матчей"), tier: "bronze", need: 5, have: won },
  { key: "wins15", label: tr("Привык побеждать"), hint: tr("Выиграть 15 матчей"), tier: "silver", need: 15, have: won },
  { key: "wins30", label: tr("Машина побед"), hint: tr("Выиграть 30 матчей"), tier: "gold", need: 30, have: won },
  { key: "streak3", label: tr("На ходу"), hint: tr("Выиграть 3 матча подряд"), tier: "bronze", need: 3, have: (p) => streaks(p.games).bestStreak },
  { key: "streak5", label: tr("Не остановить"), hint: tr("Выиграть 5 матчей подряд"), tier: "silver", need: 5, have: (p) => streaks(p.games).bestStreak },
  { key: "streak7", label: tr("Непобедимый"), hint: tr("Выиграть 7 матчей подряд"), tier: "gold", need: 7, have: (p) => streaks(p.games).bestStreak },
  { key: "blowout", label: tr("Разгром"), hint: tr("Выиграть карту, отдав сопернику не больше 3 раундов"), tier: "bronze", need: 1, have: (p) => count(p, (l) => l.mapWon && full(l) && l.scoreAgainst <= 3) },
  { key: "overtime", label: tr("Герой овертайма"), hint: tr("Выиграть карту в овертайме"), tier: "bronze", need: 1, have: (p) => count(p, (l) => l.mapWon && l.scoreFor > 13 && l.scoreAgainst >= 12) },
  // стрельба
  { key: "kills250", label: tr("Стрелок"), hint: tr("Сделать 250 убийств"), tier: "bronze", need: 250, have: (p) => p.sum.kills },
  { key: "kills500", label: tr("Охотник"), hint: tr("Сделать 500 убийств"), tier: "silver", need: 500, have: (p) => p.sum.kills },
  { key: "kills1000", label: tr("Тысячник"), hint: tr("Сделать 1000 убийств"), tier: "gold", need: 1000, have: (p) => p.sum.kills },
  { key: "map30", label: tr("Тридцатка"), hint: tr("Сделать 30 убийств за одну карту"), tier: "silver", need: 30, have: (p) => best(p, (l) => l.kills) },
  { key: "map40", label: tr("Сорокет"), hint: tr("Сделать 40 убийств за одну карту"), tier: "gold", need: 40, have: (p) => best(p, (l) => l.kills) },
  { key: "rating15", label: tr("Отличная карта"), hint: tr("Сыграть карту с рейтингом 1.50 и выше"), tier: "bronze", need: 1.5, format: "r2", have: (p) => best(p, (l) => l.rating, full) },
  { key: "rating20", label: tr("Карта жизни"), hint: tr("Сыграть карту с рейтингом 2.00 и выше"), tier: "gold", need: 2, format: "r2", have: (p) => best(p, (l) => l.rating, full) },
  { key: "adr120", label: tr("Бульдозер"), hint: tr("Сыграть карту с ADR 120 и выше"), tier: "silver", need: 120, have: (p) => Math.floor(best(p, (l) => l.damage / l.rounds_played, full)) },
  { key: "hs70", label: tr("Только в голову"), hint: tr("Сыграть карту с 70% убийств в голову (от 15 убийств)"), tier: "silver", need: 70, format: "pct", have: (p) => Math.floor(best(p, (l) => (100 * l.headshot_kills) / l.kills, (l) => l.kills >= 15)) },
  { key: "ace1", label: tr("Эйс"), hint: tr("Убить всю команду соперника за раунд"), tier: "silver", need: 1, have: (p) => p.sum.k5 },
  { key: "ace3", label: tr("Коллекционер эйсов"), hint: tr("Сделать 3 эйса"), tier: "gold", need: 3, have: (p) => p.sum.k5 },
  { key: "multi25", label: tr("Серийный"), hint: tr("25 раундов с тремя и более убийствами"), tier: "bronze", need: 25, have: (p) => p.sum.k3 + p.sum.k4 + p.sum.k5 },
  { key: "multi75", label: tr("Мясорубка"), hint: tr("75 раундов с тремя и более убийствами"), tier: "silver", need: 75, have: (p) => p.sum.k3 + p.sum.k4 + p.sum.k5 },
  { key: "mvp50", label: tr("Звезда раунда"), hint: tr("Получить 50 звёзд MVP"), tier: "bronze", need: 50, have: (p) => p.sum.mvp },
  { key: "mvp150", label: tr("Суперзвезда"), hint: tr("Получить 150 звёзд MVP"), tier: "gold", need: 150, have: (p) => p.sum.mvp },
  { key: "carry", label: tr("Тащил один"), hint: tr("Сыграть с рейтингом 1.50 и выше на проигранной карте"), tier: "silver", need: 1, have: (p) => count(p, (l) => !l.mapWon && full(l) && l.rating >= 1.5) },
  { key: "ghost", label: tr("Неуловимый"), hint: tr("Выиграть полную карту, умерев не больше 5 раз"), tier: "silver", need: 1, have: (p) => count(p, (l) => l.mapWon && l.rounds_played >= 16 && l.deaths <= 5) },
  { key: "allround", label: tr("Универсальный солдат"), hint: tr("Рейтинг 1.10 и выше на 3 разных картах (от 2 игр на каждой)"), tier: "silver", need: 3, have: (p) => mapCells(p).filter((c) => c.maps >= MAP_MIN && c.rating >= 1.1).length },
  // клатчи и поддержка
  { key: "clutchMap3", label: tr("Хладнокровный"), hint: tr("Выиграть 3 клатча за одну карту"), tier: "silver", need: 3, have: (p) => best(p, (l) => l.clutch_wins) },
  { key: "clutch10", label: tr("Клатч-мастер"), hint: tr("Выиграть 10 клатчей"), tier: "silver", need: 10, have: (p) => p.sum.clutches },
  { key: "clutch25", label: tr("Один в поле воин"), hint: tr("Выиграть 25 клатчей"), tier: "gold", need: 25, have: (p) => p.sum.clutches },
  { key: "flash20", label: tr("Светошумовой"), hint: tr("Ослепить 20 соперников за одну карту"), tier: "bronze", need: 20, have: (p) => best(p, (l) => l.enemies_flashed) },
  { key: "nade300", label: tr("Пиротехник"), hint: tr("Нанести 300 урона гранатами за одну карту"), tier: "silver", need: 300, have: (p) => best(p, (l) => l.utility_damage) },
  { key: "defuse10", label: tr("Сапёр"), hint: tr("Обезвредить 10 бомб"), tier: "bronze", need: 10, have: (p) => p.sum.defuses },
  { key: "plant25", label: tr("Бомбер"), hint: tr("Заложить 25 бомб"), tier: "bronze", need: 25, have: (p) => p.sum.plants },
  // с кем играет
  { key: "mate5", label: tr("Неразлучные"), hint: tr("Сыграть 5 матчей в одной команде с одним и тем же игроком"), tier: "bronze", need: 5, have: (p, c) => mateMax(p, c, (v) => v.games) },
  { key: "duo5", label: tr("Связка"), hint: tr("Выиграть 5 матчей с одним и тем же напарником"), tier: "silver", need: 5, have: (p, c) => mateMax(p, c, (v) => v.wins) },
  // звания
  { key: "eveningKing", label: tr("Король вечера"), hint: tr("Стать лучшим игроком вечера в большом лобби"), tier: "gold", need: 1, have: (p, c) => c.eveningKings.get(p.steam_id) ?? 0 },
  { key: "mapOwner", label: tr("Хозяин карты"), hint: tr("Держать лучший рейтинг на одной из карт"), tier: "gold", need: 1, have: (p, c) => Number(c.owners.has(p.steam_id)) },
  { key: "record", label: tr("Рекордсмен"), hint: tr("Держать один из рекордов Микса"), tier: "gold", need: 1, have: (p, c) => Number(c.recordHolders.has(p.steam_id)) },
  { key: "podium", label: tr("Призёр сезона"), hint: tr("Закончить сезон в тройке лучших"), tier: "silver", need: 1, have: (p, c) => c.podiums.get(p.steam_id) ?? 0 },
  { key: "champion", label: tr("Чемпион сезона"), hint: tr("Закончить сезон на первом месте"), tier: "gold", need: 1, have: (p, c) => c.champions.get(p.steam_id) ?? 0 },
];

export type AchGroup = "played" | "wins" | "aim" | "support" | "team" | "titles";
export const ACH_GROUPS: { key: AchGroup; label: string; keys: string[] }[] = [
  { key: "titles", label: tr("Звания"), keys: ["champion", "podium", "eveningKing", "mapOwner", "record"] },
  { key: "aim", label: tr("Стрельба"), keys: ["kills250", "kills500", "kills1000", "map30", "map40", "rating15", "rating20", "adr120", "hs70", "ace1", "ace3", "multi25", "multi75", "mvp50", "mvp150", "carry", "ghost", "allround"] },
  { key: "support", label: tr("Клатчи и поддержка"), keys: ["clutchMap3", "clutch10", "clutch25", "flash20", "nade300", "defuse10", "plant25"] },
  { key: "wins", label: tr("Победы"), keys: ["wins5", "wins15", "wins30", "streak3", "streak5", "streak7", "blowout", "overtime"] },
  { key: "played", label: tr("Сколько сыграно"), keys: ["maps10", "maps25", "maps50", "maps100", "days3", "days10", "pool5"] },
  { key: "team", label: tr("С кем играет"), keys: ["mate5", "duo5"] },
];

export type Achievement = { key: string; label: string; hint: string; tier: Tier; earned: boolean; have: string; need: string; progress: number };
export type AchievementBoard = { key: string; label: string; hint: string; tier: Tier; holders: string[] };
export const ACHIEVEMENTS_TOTAL = ACHIEVEMENTS.length;

const achShow = (v: number, f?: AchFormat) => (f === "r2" ? v.toFixed(2) : f === "pct" ? `${Math.round(v)}%` : String(Math.round(v)));

function achievementsOf(p: Player, c: AchContext): Achievement[] {
  return ACHIEVEMENTS.map((d) => {
    const have = d.have(p, c);
    const earned = have >= d.need;
    return { key: d.key, label: d.label, hint: d.hint, tier: d.tier, earned, have: achShow(have, d.format), need: achShow(d.need, d.format), progress: Math.max(0, Math.min(1, have / d.need)) };
  });
}

/** Лучший по рейтингу в каждом вечере большого лобби (от двух карт): steam_id → сколько раз */
function eveningKingsOf(lines: Line[]) {
  const out = new Map<string, number>();
  const codes = new Set(lines.map((l) => l.game.code).filter(Boolean));
  for (const code of codes) {
    const top = collect(lines.filter((l) => l.game.code === code))
      .filter((p) => p.sum.maps >= 2)
      .sort((x, y) => ratingOf(y.sum) - ratingOf(x.sum))[0];
    if (top) out.set(top.steam_id, (out.get(top.steam_id) ?? 0) + 1);
  }
  return out;
}

// ───────────────────────── график формы

export type HistoryPoint = { day: string; rating: number; maps: number };

/** Рейтинг игрока по игровым дням, старые первыми */
function historyOf(p: Player): HistoryPoint[] {
  const by = new Map<number, Sum>();
  for (const l of p.lines) {
    const d = playDay(l.game.finished_at);
    let a = by.get(d);
    if (!a) by.set(d, (a = zero()));
    add(a, l);
  }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([d, a]) => ({ day: dayIso(d), rating: ratingOf(a), maps: a.maps }));
}

// ───────────────────────── сборка

export type TwentyScope = { code?: string; season?: string; now?: number };

/**
 * Всё про «Микс» по сыгранным играм. С кодом лобби — только один вечер, с сезоном — только его месяц
 * (рекорды, связки, достижения и история считаются по всем играм: они не про отрезок).
 */
export function buildTwenty(games: CoreGame[], stats: CoreStat[], opts: TwentyScope = {}) {
  const lines = toLines(games, stats);
  const all = collect(lines);
  const evening = !!opts.code;
  const season = !evening && !!opts.season;
  const scopeGames = evening ? games.filter((g) => g.code === opts.code) : season ? games.filter((g) => seasonOf(g.finished_at) === opts.season) : games;
  const ids = new Set(scopeGames.map((g) => g.id));
  const scope = evening || season ? collect(lines.filter((l) => ids.has(l.game_id))) : all;
  const rows = rowsOf(scope, evening ? 1 : TWENTY_MIN_MAPS, season);
  const pairs = pairsOf(all);
  const records = recordsOf(all);
  const seasons = seasonsOf(games, lines, opts.now ?? Date.now());

  // звания считаются по всем играм, а не по выбранному отрезку
  const allRows = evening || season ? rowsOf(all, TWENTY_MIN_MAPS) : rows;
  const tally = (list: string[]) => list.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  const done = seasons.filter((x) => x.finished);
  const context: AchContext = {
    pairs,
    owners: new Set(boardsOf(allRows, games).filter((b) => b.minMaps >= MAP_MIN && b.rows[0]).map((b) => b.rows[0].steam_id)),
    recordHolders: new Set(records.map((r) => r.steam_id)),
    eveningKings: eveningKingsOf(lines),
    podiums: tally(done.flatMap((x) => x.podium.map((p) => p.steam_id))),
    champions: tally(done.flatMap((x) => x.podium.slice(0, 1).map((p) => p.steam_id))),
  };
  const byId = new Map(all.map((p) => [p.steam_id, p]));
  const earned = new Map(all.map((p) => [p.steam_id, achievementsOf(p, context)]));

  const twenty: Twenty = {
    seasons,
    rows,
    boards: boardsOf(rows, scopeGames),
    nominations: scope.length ? nominationsOf(scope, all, evening) : [],
    records,
    duos: duosOf(pairs),
    matches: scopeGames.length,
    mapsPlayed: scopeGames.reduce((n, g) => n + g.maps.filter((m) => m.status === "finished").length, 0),
  };
  return {
    ...twenty,
    relations: (steamId: string) => relationsOf(pairs, steamId),
    /** все достижения игрока: полученные и нет, с прогрессом */
    achievements: (steamId: string): Achievement[] => earned.get(steamId) ?? [],
    /** история рейтинга по игровым дням — для графика в профиле */
    history: (steamId: string): HistoryPoint[] => (byId.has(steamId) ? historyOf(byId.get(steamId)!) : []),
    /** доска достижений: у кого какое есть */
    achievementBoard: (): AchievementBoard[] =>
      ACHIEVEMENTS.map((d) => ({ key: d.key, label: d.label, hint: d.hint, tier: d.tier, holders: [...earned.entries()].filter(([, list]) => list.find((x) => x.key === d.key)?.earned).map(([id]) => id) })),
  };
}

/** Перевес на карте для вето: средний рейтинг игроков каждой команды на этой карте (null — никто на ней не играл) */
export function mapEdge(rows: { steam_id: string; byMap: Pick<MapCell, "map" | "rating" | "rounds">[] }[], team1: string[], team2: string[], pool: string[]) {
  const by = new Map(rows.map((r) => [r.steam_id, r.byMap]));
  const avg = (team: string[], map: string) => {
    let rounds = 0;
    let sum = 0;
    let known = 0;
    for (const id of team) {
      const c = by.get(id)?.find((x) => x.map === map);
      if (!c) continue;
      // взвешиваем по раундам: одна короткая карта не перевешивает десять полных
      rounds += c.rounds;
      sum += c.rating * c.rounds;
      known++;
    }
    return rounds ? { rating: sum / rounds, known } : null;
  };
  return Object.fromEntries(pool.map((map) => [map, { team1: avg(team1, map), team2: avg(team2, map) }])) as Record<string, { team1: { rating: number; known: number } | null; team2: { rating: number; known: number } | null }>;
}

// ───────────────────────── баланс составов

/*
 * Сила игрока для сравнения составов. Проверка на 19 сыгранных играх (24.11.2026, рейтинг считался без самой игры):
 * рейтинг «Микса» угадал победителя в 14 играх, ELO FACEIT — в 13, а при заметном перевесе по ELO победитель
 * угадан только в 3 случаях из 8. Поэтому основа — рейтинг «Микса», ELO — только для тех, у кого здесь мало игр.
 * Выборка мала для процентов: показываем перевес словами, а не шансом на победу.
 */

/** С этого числа карт рейтингу игрока в «Миксе» доверяем больше, чем его ELO */
export const STRENGTH_MIN_MAPS = 3;
/** Разница средней силы составов: до первой — равны, до второй — небольшой перевес, дальше — заметный */
export const BALANCE_SLIGHT = 0.03;
export const BALANCE_CLEAR = 0.07;

/** Как ELO FACEIT переводится в ожидаемый рейтинг «Микса»: по игрокам, у которых есть и то и другое */
export type EloFit = { rating: number; elo: number; perPoint: number };

export function eloFit(rows: { rating: number; maps: number; elo: number | null }[]): EloFit | null {
  const pool = rows.filter((r) => r.maps >= 6 && r.elo);
  if (pool.length < 8) return null;
  const mx = mean(pool.map((r) => r.elo!));
  const my = mean(pool.map((r) => r.rating));
  const varX = pool.reduce((s, r) => s + (r.elo! - mx) ** 2, 0);
  if (!varX) return null;
  // отрицательной связи не допускаем: тогда ELO просто не используется
  const perPoint = Math.max(0, pool.reduce((s, r) => s + (r.elo! - mx) * (r.rating - my), 0) / varX);
  return { rating: my, elo: mx, perPoint };
}

export type Strength = { value: number; by: "mix" | "elo" | "none" };

/** Сила игрока: его рейтинг в «Миксе», а пока игр мало — оценка по ELO; без ELO — чуть ниже среднего */
export function playerStrength(mix: { rating: number; maps: number } | null, elo: number | null, fit: EloFit | null): Strength {
  if (mix && mix.maps >= STRENGTH_MIN_MAPS) return { value: mix.rating, by: "mix" };
  const base = fit?.rating ?? 1;
  if (elo && fit) return { value: Math.max(0.6, Math.min(1.5, base + fit.perPoint * (elo - fit.elo))), by: "elo" };
  return { value: base - 0.08, by: "none" };
}

export type Balance = {
  team1: number;
  team2: number;
  /** у кого перевес (null — составы равны) */
  favored: 1 | 2 | null;
  level: "even" | "slight" | "clear";
  /** у скольких игроков сила взята не из «Микса» */
  estimated: number;
};

/** Сравнение двух составов; null — пока в какой-то команде меньше трёх игроков, сравнивать рано */
export function teamBalance(a: Strength[], b: Strength[]): Balance | null {
  if (a.length < 3 || b.length < 3) return null;
  const team1 = mean(a.map((x) => x.value));
  const team2 = mean(b.map((x) => x.value));
  const gap = Math.abs(team1 - team2);
  const level = gap < BALANCE_SLIGHT ? "even" : gap < BALANCE_CLEAR ? "slight" : "clear";
  return { team1, team2, favored: level === "even" ? null : team1 > team2 ? 1 : 2, level, estimated: [...a, ...b].filter((x) => x.by !== "mix").length };
}
