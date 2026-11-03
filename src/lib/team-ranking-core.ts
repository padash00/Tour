/**
 * Рейтинг команд F16 (по мотивам HLTV) — чистая логика без базы, покрыта тестом scripts/test-team-ranking.mts.
 *
 * Очки = Достижения + Форма.
 *  - Достижения: место в турнире (1 — 100, 2 — 70, 3 — 50, 4 — 40; остальные — 10 за выход в плей-офф
 *    и +5 за каждую победу в плей-офф, но не больше 35; только группа — 5 и +2 за победу, не больше 15).
 *  - Форма: каждая победа — 6 очков × сила соперника (его ELO на момент матча / 1000).
 *  - Вес турнира: официальный ×2, LAN ×1, онлайн ×0.5.
 *  - Свежесть: до 3 месяцев ×1, до 6 — ×0.75, до года — ×0.5, старше года не считается.
 *  Командный ELO (старт 1000, K = 32) ведётся по всем сыгранным матчам и нужен для силы соперника.
 *  Технические победы (неявка) в форму и ELO не идут.
 */
import { computePlacements, isPlayoffSide, type PlacementMatch } from "./awards-core";

export type RankMatch = PlacementMatch & {
  id: string;
  tournamentId: string;
  finishedAt: string | null;
  walkover: boolean;
};

export type RankTournament = {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
  official: boolean;
  lan: boolean;
  finished: boolean;
  /** итоговая таблица для турнира без плей-офф (круговая, швейцарка) — первые три места */
  ranking?: string[];
};

export type TeamResult = { tournamentId: string; name: string; slug: string; date: string; place: number | null; points: number };

export type RankedTeam = {
  teamId: string;
  rank: number;
  points: number;
  achievement: number;
  form: number;
  elo: number;
  wins: number;
  losses: number;
  lastMatchAt: string;
  results: TeamResult[];
};

const DAY = 86_400_000;
export const ACTIVE_DAYS = 180;

export function tournamentWeight(t: Pick<RankTournament, "official" | "lan">) {
  return t.official ? 2 : t.lan ? 1 : 0.5;
}

export function decay(date: string, now: number) {
  const age = (now - new Date(date).getTime()) / DAY;
  if (age < 0) return 1;
  if (age < 90) return 1;
  if (age < 180) return 0.75;
  if (age < 365) return 0.5;
  return 0;
}

const PLACE_POINTS: Record<number, number> = { 1: 100, 2: 70, 3: 50, 4: 40 };

/** Очки за турнир без учёта веса и свежести, и место (1–4) если есть */
export function achievementOf(matches: RankMatch[], ranking: string[] = []) {
  const done = matches.filter((m) => m.status === "finished");
  const out = new Map<string, { place: number | null; base: number }>();
  const teams = new Set<string>();
  for (const m of done) for (const id of [m.team1_id, m.team2_id]) if (id) teams.add(id);

  const places = new Map<string, number>(computePlacements(matches, ranking).map((p) => [p.teamId, p.place]));
  // 4-е место — проигравший матча за 3-е
  const third = done.find((m) => m.bracket === "third_place" && m.winner_id && m.team1_id && m.team2_id);
  if (third && places.size) {
    const loser = third.winner_id === third.team1_id ? third.team2_id! : third.team1_id!;
    if (!places.has(loser)) places.set(loser, 4);
  }

  for (const id of teams) {
    const place = places.get(id) ?? null;
    if (place) {
      out.set(id, { place, base: PLACE_POINTS[place] });
      continue;
    }
    const mine = done.filter((m) => m.team1_id === id || m.team2_id === id);
    const playoff = mine.filter((m) => isPlayoffSide(m.bracket));
    const winsIn = (list: RankMatch[]) => list.filter((m) => m.winner_id === id && !m.walkover).length;
    const base = playoff.length ? Math.min(35, 10 + 5 * winsIn(playoff)) : Math.min(15, 5 + 2 * winsIn(mine));
    out.set(id, { place: null, base });
  }
  return out;
}

/**
 * Рейтинг на момент `now`: учитываются только матчи, завершённые до `now`.
 * eligible — какие команды показывать (не распущены, не «одиночки»).
 */
export function rankTeams(tournaments: RankTournament[], matches: RankMatch[], now: number, eligible: (teamId: string) => boolean): RankedTeam[] {
  const until = (m: RankMatch) => !!m.finishedAt && new Date(m.finishedAt).getTime() <= now;
  const played = matches.filter((m) => m.status === "finished" && until(m));
  const byTournament = new Map<string, RankMatch[]>();
  for (const m of played) byTournament.set(m.tournamentId, [...(byTournament.get(m.tournamentId) ?? []), m]);
  const tById = new Map(tournaments.map((t) => [t.id, t]));

  type Acc = { achievement: number; form: number; wins: number; losses: number; last: number; results: TeamResult[] };
  const acc = new Map<string, Acc>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { achievement: 0, form: 0, wins: 0, losses: 0, last: 0, results: [] }));
    return a;
  };

  // ── ELO и форма — по матчам по порядку
  const elo = new Map<string, number>();
  const eloOf = (id: string) => elo.get(id) ?? 1000;
  for (const m of [...played].sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))) {
    if (!m.team1_id || !m.team2_id || !m.winner_id) continue;
    const t = tById.get(m.tournamentId);
    const at = new Date(m.finishedAt!).getTime();
    for (const id of [m.team1_id, m.team2_id]) get(id).last = Math.max(get(id).last, at);
    if (m.walkover || !t) continue;
    const winner = m.winner_id;
    const loser = winner === m.team1_id ? m.team2_id : m.team1_id;
    const ew = eloOf(winner);
    const el = eloOf(loser);
    const d = decay(m.finishedAt!, now);
    if ((now - at) / DAY < ACTIVE_DAYS) {
      get(winner).wins++;
      get(loser).losses++;
    }
    get(winner).form += 6 * (el / 1000) * tournamentWeight(t) * d;
    const expected = 1 / (1 + 10 ** ((el - ew) / 400));
    elo.set(winner, ew + 32 * (1 - expected));
    elo.set(loser, el - 32 * (1 - expected));
  }

  // ── достижения — по турнирам
  for (const [tid, list] of byTournament) {
    const t = tById.get(tid);
    if (!t) continue;
    const ranking = t.finished ? t.ranking : undefined;
    const date = list.reduce((max, m) => (m.finishedAt! > max ? m.finishedAt! : max), t.startsAt);
    const k = tournamentWeight(t) * decay(date, now);
    for (const [teamId, r] of achievementOf(list, ranking)) {
      const points = r.base * k;
      const a = get(teamId);
      a.achievement += points;
      a.results.push({ tournamentId: t.id, name: t.name, slug: t.slug, date, place: r.place, points: Math.round(points) });
    }
  }

  const list = [...acc.entries()]
    .filter(([id, a]) => eligible(id) && a.last > 0 && (now - a.last) / DAY < ACTIVE_DAYS)
    .map(([teamId, a]) => ({
      teamId,
      rank: 0,
      points: Math.round(a.achievement + a.form),
      achievement: Math.round(a.achievement),
      form: Math.round(a.form),
      elo: Math.round(eloOf(teamId)),
      wins: a.wins,
      losses: a.losses,
      lastMatchAt: new Date(a.last).toISOString(),
      results: a.results.sort((x, y) => y.date.localeCompare(x.date)),
    }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points || b.elo - a.elo || b.lastMatchAt.localeCompare(a.lastMatchAt));
  list.forEach((x, i) => (x.rank = i + 1));
  return list;
}
