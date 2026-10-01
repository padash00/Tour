/**
 * Форматы турнира кроме чистой сетки на выбывание:
 * круговая система (Round Robin), группы + плей-офф, швейцарская система (+ плей-офф).
 * Чистые функции: расписание, пары, таблица.
 */

export type FormatKind =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "groups_playoff"
  | "swiss"
  | "swiss_playoff";

export const FORMATS: Record<FormatKind, { title: string; text: string; stage: "elimination" | "group" | "swiss"; playoff: boolean }> = {
  single_elimination: { title: "Single Elimination", text: "Проиграл — выбыл. Быстро и жёстко.", stage: "elimination", playoff: false },
  double_elimination: { title: "Double Elimination", text: "Выбывание после двух поражений: верхняя и нижняя сетка, гранд-финал.", stage: "elimination", playoff: false },
  round_robin: { title: "Круговая система", text: "Каждый играет с каждым. Победитель — первый в таблице.", stage: "group", playoff: false },
  groups_playoff: { title: "Группы + плей-офф", text: "Круговые группы, лучшие из каждой группы выходят в плей-офф.", stage: "group", playoff: true },
  swiss: { title: "Швейцарская система", text: "Пары по одинаковому счёту. N побед — выход, N поражений — вылет.", stage: "swiss", playoff: false },
  swiss_playoff: { title: "Швейцарка + плей-офф", text: "Как на мейджорах: швейцарская стадия, вышедшие играют плей-офф.", stage: "swiss", playoff: true },
};

export const isFormat = (s: string): s is FormatKind => s in FORMATS;

// ───────────────────────── круговая система

/** Метод «кругового» расписания: каждый с каждым, по турам. null — выходной (нечётное число). */
export function roundRobinRounds<T>(teams: T[]): [T, T][][] {
  const list: (T | null)[] = [...teams];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a != null && b != null) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    // фиксируем первого, остальных вращаем
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** Змейкой по посеву: A B C D D C B A … */
export function splitGroups<T>(seeded: T[], groups: number): T[][] {
  const out: T[][] = Array.from({ length: groups }, () => []);
  seeded.forEach((t, i) => {
    const lap = Math.floor(i / groups);
    const pos = i % groups;
    out[lap % 2 ? groups - 1 - pos : pos].push(t);
  });
  return out;
}

export const groupLabel = (i: number) => String.fromCharCode(65 + i);

// ───────────────────────── таблица

export type StageMatch = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
  status: string;
  round: number;
  group_label?: string | null;
  maps: { team1_score: number; team2_score: number; winner_id: string | null; status: string }[];
  team1_score: number;
  team2_score: number;
};

export type StandingRow = {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  mapWins: number;
  mapLosses: number;
  roundsFor: number;
  roundsAgainst: number;
  buchholz: number;
  seed: number;
  status: "active" | "advanced" | "eliminated";
};

/**
 * Таблица группы / швейцарки. Сортировка: победы → (швейцарка: Бухгольц) → личная встреча (при равенстве двух)
 * → разница карт → разница раундов → посев.
 */
export function standings(teamIds: string[], matches: StageMatch[], opts: { swiss?: boolean; swissWins?: number } = {}): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id, i) => [
      id,
      { teamId: id, played: 0, wins: 0, losses: 0, mapWins: 0, mapLosses: 0, roundsFor: 0, roundsAgainst: 0, buchholz: 0, seed: i + 1, status: "active" },
    ]),
  );
  const opponents = new Map<string, string[]>(teamIds.map((id) => [id, []]));
  for (const m of matches) {
    // бай (швейцарка, нечётное число команд): матч без соперника — свободная победа
    if (m.status === "finished" && m.winner_id && (!m.team1_id || !m.team2_id)) {
      const r = rows.get(m.winner_id);
      if (r) {
        r.played++;
        r.wins++;
      }
      continue;
    }
    if (m.status !== "finished" || !m.team1_id || !m.team2_id || !m.winner_id) continue;
    for (const [me, other, side] of [
      [m.team1_id, m.team2_id, 1],
      [m.team2_id, m.team1_id, 2],
    ] as const) {
      const r = rows.get(me);
      if (!r) continue;
      r.played++;
      if (m.winner_id === me) r.wins++;
      else r.losses++;
      opponents.get(me)!.push(other);
      r.mapWins += side === 1 ? m.team1_score : m.team2_score;
      r.mapLosses += side === 1 ? m.team2_score : m.team1_score;
      for (const map of m.maps.filter((x) => x.status === "finished")) {
        r.roundsFor += side === 1 ? map.team1_score : map.team2_score;
        r.roundsAgainst += side === 1 ? map.team2_score : map.team1_score;
      }
    }
  }
  for (const r of rows.values()) {
    r.buchholz = (opponents.get(r.teamId) ?? []).reduce((s, o) => s + (rows.get(o)?.wins ?? 0) - (rows.get(o)?.losses ?? 0), 0);
    if (opts.swiss && opts.swissWins) {
      if (r.wins >= opts.swissWins) r.status = "advanced";
      else if (r.losses >= opts.swissWins) r.status = "eliminated";
    }
  }
  const h2h = (a: string, b: string) => {
    const m = matches.find(
      (x) => x.status === "finished" && ((x.team1_id === a && x.team2_id === b) || (x.team1_id === b && x.team2_id === a)),
    );
    return m?.winner_id === a ? -1 : m?.winner_id === b ? 1 : 0;
  };
  const list = [...rows.values()];
  return list.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (opts.swiss && b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    const tied = list.filter((x) => x.wins === a.wins && x.losses === a.losses);
    if (tied.length === 2) {
      const h = h2h(a.teamId, b.teamId);
      if (h) return h;
    }
    const md = b.mapWins - b.mapLosses - (a.mapWins - a.mapLosses);
    if (md) return md;
    const rd = b.roundsFor - b.roundsAgainst - (a.roundsFor - a.roundsAgainst);
    if (rd) return rd;
    return a.seed - b.seed;
  });
}

// ───────────────────────── швейцарская система

/** Число раундов швейцарки для N команд и порога побед: худший случай — 2·wins − 1 */
export const swissMaxRounds = (wins: number) => 2 * wins - 1;

/**
 * Пары следующего раунда: внутри каждого «пула» с одинаковым счётом (W–L) — сильный против слабого
 * (по посеву/Бухгольцу), без повторных встреч, если это возможно.
 * Нечётный пул отдаёт команду «вниз» в следующий пул. Если в конце остаётся одна команда —
 * она получает бай (свободную победу): возвращается как пара [команда, null].
 * Бай достаётся самой слабой команде без бая (ключ `${id}:BYE` в played), иначе — самой слабой.
 */
export function swissPairings(table: StandingRow[], played: Set<string>, swissWins: number): [string, string | null][] {
  const active = table.filter((r) => r.status === "active");
  const pools = new Map<string, StandingRow[]>();
  for (const r of active) {
    const key = `${r.wins}-${r.losses}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key)!.push(r);
  }
  const keys = [...pools.keys()].sort((a, b) => {
    const [aw, al] = a.split("-").map(Number);
    const [bw, bl] = b.split("-").map(Number);
    return bw - aw || al - bl;
  });
  const key = (a: string, b: string) => [a, b].sort().join(":");
  const pairs: [string, string | null][] = [];
  let carry: StandingRow[] = [];
  // нечётное число активных — бай заранее: самый слабый (последний пул, последний по таблице) без бая
  if (active.length % 2) {
    const ranked = keys.flatMap((k) => [...pools.get(k)!].sort((a, b) => b.buchholz - a.buchholz || a.seed - b.seed));
    const pick = [...ranked].reverse().find((r) => !played.has(`${r.teamId}:BYE`)) ?? ranked[ranked.length - 1];
    pairs.push([pick.teamId, null]);
    for (const k of keys) pools.set(k, pools.get(k)!.filter((r) => r.teamId !== pick.teamId));
  }
  for (const k of keys) {
    const pool = [...carry, ...pools.get(k)!].sort((a, b) => b.buchholz - a.buchholz || a.seed - b.seed);
    carry = [];
    if (pool.length % 2) carry = [pool.pop()!];
    // сильнейший против слабейшего, затем подбираем без повторов
    const left = [...pool];
    while (left.length) {
      const a = left.shift()!;
      let idx = left.length - 1;
      while (idx > 0 && played.has(key(a.teamId, left[idx].teamId))) idx--;
      const [b] = left.splice(idx, 1);
      pairs.push([a.teamId, b.teamId]);
    }
  }
  void swissWins;
  return pairs;
}

/**
 * Первый раунд швейцарки: верхняя половина посева против нижней (1–9, 2–10 … для 16).
 * При нечётном числе последний посев получает бай — пара [команда, null].
 */
export function swissFirstRound(seeded: string[]): [string, string | null][] {
  const list = seeded.length % 2 ? seeded.slice(0, -1) : seeded;
  const half = list.length / 2;
  const pairs: [string, string | null][] = Array.from({ length: half }, (_, i) => [list[i], list[i + half]] as [string, string]);
  if (seeded.length % 2) pairs.push([seeded[seeded.length - 1], null]);
  return pairs;
}
