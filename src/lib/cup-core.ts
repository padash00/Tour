// Лобби на 20–40 игроков: несколько команд по пять и сетка (или круг) матчей между ними.
// Чистая логика — общая для сервера, страницы и тестов. Каждый матч играется в своей комнате на две команды
// (обычное лобби), сюда возвращается только итог.

export const CUP_SIZES = [20, 30, 40] as const;
export type CupFormat = "bracket" | "round";

/** Сколько команд по 5 в лобби на столько игроков (0 — обычное лобби на две команды) */
export const cupTeams = (players: number) => ((CUP_SIZES as readonly number[]).includes(players) ? players / 5 : 0);

/** Круговая играется в одну карту (BO1): на 6–8 команд это 15–28 матчей — сериями за день не сыграть */
export const cupBestOf = <T extends number>(format: CupFormat, bestOf: T): T | 1 => (format === "round" ? 1 : bestOf);

export type CupMatch = {
  /** "r1m1" — круг и номер матча в нём */
  id: string;
  round: number;
  /** команды (номер с нуля); null — ещё не известна */
  a: number | null;
  b: number | null;
  /** сетка: победители каких матчей сюда попадают */
  fa?: string;
  fb?: string;
  /** код комнаты матча (обычное лобби на две команды) */
  code: string | null;
  state: "pending" | "playing" | "done" | "cancelled";
  /** команда-победитель (номер с нуля) */
  winner: number | null;
  /** счёт по картам: [a, b] */
  score: [number, number] | null;
  /** счёт по раундам за все карты матча: [a, b] (у старых матчей нет) */
  rounds?: [number, number] | null;
};

export type Cup = {
  format: CupFormat;
  /** названия команд */
  names: string[];
  /** составы: id игроков, капитан первым */
  rosters: string[][];
  matches: CupMatch[];
  state: "playing" | "done";
  /** победитель (номер команды с нуля) */
  champion: number | null;
  started_at: string;
};

/** Порядок выбора змейкой для N капитанов: 1…N, N…1, 1…N… (n — сколько игроков уже выбрано). Возвращает номер с единицы */
export function snakeTurnN(n: number, teams: number): number {
  const lap = Math.floor(n / teams);
  const i = n % teams;
  return lap % 2 === 0 ? i + 1 : teams - i;
}

/** Расстановка посева в сетке на size мест: [1, 8, 4, 5, 2, 7, 3, 6] — сильнейшие встречаются позже всех */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const blank = (id: string, round: number): CupMatch => ({ id, round, a: null, b: null, code: null, state: "pending", winner: null, score: null });

/** Матчи сетки на вылет: при 6 командах две первые проходят первый круг без игры */
function bracketMatches(teams: number): CupMatch[] {
  let size = 2;
  while (size < teams) size *= 2;
  // места первого круга: номер команды или null (свободное место)
  type Entry = { team: number | null; from?: string };
  let level: Entry[] = seedOrder(size).map((seed) => ({ team: seed <= teams ? seed - 1 : null }));
  const matches: CupMatch[] = [];
  for (let round = 1; level.length > 1; round++) {
    const next: Entry[] = [];
    let num = 0;
    for (let i = 0; i < level.length; i += 2) {
      const [x, y] = [level[i], level[i + 1]];
      const empty = (e: Entry) => e.team === null && !e.from;
      if (empty(x) || empty(y)) {
        // соперника нет — команда проходит дальше без матча
        next.push(empty(x) ? y : x);
        continue;
      }
      const m = blank(`r${round}m${++num}`, round);
      m.a = x.team;
      m.b = y.team;
      if (x.from) m.fa = x.from;
      if (y.from) m.fb = y.from;
      matches.push(m);
      next.push({ team: null, from: m.id });
    }
    level = next;
  }
  return matches;
}

/** Круговая: каждый с каждым, по кругам — в одном круге команда играет один матч */
function roundMatches(teams: number): CupMatch[] {
  const ids = Array.from({ length: teams + (teams % 2) }, (_, i) => (i < teams ? i : -1));
  const matches: CupMatch[] = [];
  const n = ids.length;
  for (let round = 1; round < n; round++) {
    let num = 0;
    for (let i = 0; i < n / 2; i++) {
      const [x, y] = [ids[i], ids[n - 1 - i]];
      if (x < 0 || y < 0) continue;
      const m = blank(`r${round}m${++num}`, round);
      m.a = x;
      m.b = y;
      matches.push(m);
    }
    ids.splice(1, 0, ids.pop()!);
  }
  return matches;
}

export function buildCup(format: CupFormat, names: string[], rosters: string[][], now = new Date()): Cup {
  const teams = names.length;
  return {
    format,
    names,
    rosters,
    matches: format === "round" ? roundMatches(teams) : bracketMatches(teams),
    state: "playing",
    champion: null,
    started_at: now.toISOString(),
  };
}

/**
 * Матчи, которые пора запускать: обе команды известны, комнаты ещё нет.
 * В круговой туров никто не ждёт: освободившаяся команда сразу играет со свободной командой, с которой ещё
 * не встречалась (команда не играет два матча сразу). Из свободных команд собираем как можно больше пар;
 * при равенстве — сначала те, у кого осталось больше матчей (чтобы никто не доигрывал хвост в одиночку),
 * затем матчи более ранних кругов.
 */
export function readyMatches(cup: Cup): CupMatch[] {
  if (cup.state !== "playing") return [];
  const open = cup.matches.filter((m) => m.state === "pending" && m.a !== null && m.b !== null && !m.code);
  if (cup.format !== "round") return open;
  const busy = new Set(cup.matches.filter((m) => m.state === "playing").flatMap((m) => [m.a, m.b]));
  const free = open.filter((m) => !busy.has(m.a) && !busy.has(m.b));
  const left = (team: number | null) => cup.matches.filter((m) => m.state !== "done" && (m.a === team || m.b === team)).length;
  type Pick = { list: CupMatch[]; weight: number; rounds: number };
  const better = (x: Pick, y: Pick) => x.list.length - y.list.length || x.weight - y.weight || y.rounds - x.rounds;
  const best = (rest: CupMatch[]): Pick => {
    if (!rest.length) return { list: [], weight: 0, rounds: 0 };
    // первая по номеру команда из оставшихся: либо играет один из своих матчей, либо пропускает
    const team = Math.min(...rest.flatMap((m) => [m.a!, m.b!]));
    let top = best(rest.filter((m) => m.a !== team && m.b !== team));
    for (const m of rest.filter((x) => x.a === team || x.b === team)) {
      const sub = best(rest.filter((x) => x.a !== m.a && x.b !== m.a && x.a !== m.b && x.b !== m.b));
      const pick = { list: [m, ...sub.list], weight: sub.weight + left(m.a) + left(m.b), rounds: sub.rounds + m.round };
      if (better(pick, top) > 0) top = pick;
    }
    return top;
  };
  return best(free).list;
}

export type CupRow = { team: number; played: number; wins: number; maps: number; mapsLost: number; rounds: number; roundsLost: number };

/**
 * Таблица круговой: очки (победа — очко), разница карт (в BO1 она равна очкам), разница раундов,
 * личная встреча (когда равны ровно две команды), выигранные раунды.
 */
export function standings(cup: Cup): CupRow[] {
  const rows: CupRow[] = cup.names.map((_, team) => ({ team, played: 0, wins: 0, maps: 0, mapsLost: 0, rounds: 0, roundsLost: 0 }));
  for (const m of cup.matches) {
    if (m.state !== "done" || m.a === null || m.b === null) continue;
    const [sa, sb] = m.score ?? [0, 0];
    rows[m.a].played++;
    rows[m.b].played++;
    rows[m.a].maps += sa;
    rows[m.a].mapsLost += sb;
    rows[m.b].maps += sb;
    rows[m.b].mapsLost += sa;
    const [ra, rb] = m.rounds ?? [0, 0];
    rows[m.a].rounds += ra;
    rows[m.a].roundsLost += rb;
    rows[m.b].rounds += rb;
    rows[m.b].roundsLost += ra;
    if (m.winner !== null) rows[m.winner].wins++;
  }
  const mapDiff = (r: CupRow) => r.maps - r.mapsLost;
  const roundDiff = (r: CupRow) => r.rounds - r.roundsLost;
  const level = (x: CupRow, y: CupRow) => x.wins === y.wins && mapDiff(x) === mapDiff(y) && roundDiff(x) === roundDiff(y);
  const h2h = (x: CupRow, y: CupRow) => {
    if (!level(x, y) || rows.filter((r) => level(r, x)).length !== 2) return 0;
    const m = cup.matches.find((q) => q.state === "done" && ((q.a === x.team && q.b === y.team) || (q.a === y.team && q.b === x.team)));
    return m?.winner === x.team ? -1 : m?.winner === y.team ? 1 : 0;
  };
  return [...rows].sort(
    (x, y) => y.wins - x.wins || mapDiff(y) - mapDiff(x) || roundDiff(y) - roundDiff(x) || h2h(x, y) || y.rounds - x.rounds || y.maps - x.maps || x.team - y.team,
  );
}

/**
 * Итог матча: side — кто победил (1 — команда a, 2 — команда b). Победитель проходит в следующий матч сетки;
 * когда всё сыграно — определяется чемпион. Возвращает новую сетку (исходная не меняется).
 */
export function recordResult(cup: Cup, matchId: string, side: 1 | 2, score: [number, number], rounds: [number, number] | null = null): Cup {
  const matches = cup.matches.map((m) => ({ ...m }));
  const m = matches.find((x) => x.id === matchId);
  if (!m || m.a === null || m.b === null || m.state === "done") return cup;
  m.state = "done";
  m.winner = side === 1 ? m.a : m.b;
  m.score = score;
  m.rounds = rounds;
  for (const next of matches) {
    if (next.fa === m.id) next.a = m.winner;
    if (next.fb === m.id) next.b = m.winner;
  }
  const next: Cup = { ...cup, matches };
  if (matches.every((x) => x.state === "done")) {
    next.state = "done";
    next.champion = cup.format === "round" ? standings(next)[0].team : m.winner;
  }
  return next;
}

/** Матч отменён (сервер не поднялся, отменил организатор): комната закрыта, матч можно запустить заново */
export function markCancelled(cup: Cup, matchId: string): Cup {
  return { ...cup, matches: cup.matches.map((m) => (m.id === matchId && m.state !== "done" ? { ...m, state: "cancelled" as const, code: null } : m)) };
}

/** Отменённый матч — снова в очередь на запуск */
export function requeue(cup: Cup, matchId: string): Cup {
  return { ...cup, matches: cup.matches.map((m) => (m.id === matchId && m.state === "cancelled" ? { ...m, state: "pending" as const, code: null } : m)) };
}

/**
 * Команда выбыла из идущей сетки: проиграла матч, других матчей у неё не будет (матча за 3-е место нет).
 * В круговой все играют до последнего круга — там до конца никто не выбывает.
 */
export const teamOut = (cup: Cup | null | undefined, team: number): boolean =>
  !!cup && team >= 0 && cup.format === "bracket" && cup.state === "playing" && cup.matches.some((m) => m.state === "done" && (m.a === team || m.b === team) && m.winner !== team);

/** Игрок выбывшей команды: большое лобби его больше не держит */
export const playerOut = (cup: Cup | null | undefined, playerId: string): boolean => !!cup && teamOut(cup, cup.rosters.findIndex((r) => r.includes(playerId)));

export const roundTitle = (cup: Cup, round: number): string => {
  if (cup.format === "round") return `Круг ${round}`;
  const last = Math.max(...cup.matches.map((m) => m.round));
  return round === last ? "Финал" : round === last - 1 ? "Полуфинал" : round === last - 2 ? "Четвертьфинал" : `Круг ${round}`;
};
