import "server-only";
import { modeOf } from "./modes";
import { db } from "./supabase";

/**
 * Примерное расписание турнира: когда начнётся каждый несыгранный матч и когда закончится турнир.
 *
 * Длительность карты — среднее по уже сыгранным матчам турнира (от старта до конца, делённое на карты),
 * пока их нет — среднее по режиму. Очередь раскладывается по свободным серверам с учётом того,
 * что участник не играет два матча сразу; между картами и матчами — запас на загрузку.
 */
const DEFAULT_MAP_MIN: Record<number, number> = { 1: 20, 2: 25, 5: 45 };
const BETWEEN_MATCHES_MIN = 5;
const MAP_CHANGE_MIN = 2;

type Row = {
  id: string;
  number: number;
  round: number;
  status: string;
  best_of: number;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number;
  team2_score: number;
  started_at: string | null;
  finished_at: string | null;
  maps: { status: string }[];
};

export type TournamentEta = { matchStart: Map<string, number>; finishAt: number | null; mapMinutes: number };

export async function tournamentEta(tournamentId: string): Promise<TournamentEta | null> {
  const [{ data: t }, { data: ms }, { data: inst }] = await Promise.all([
    db().from("tournaments").select("format, status, starts_at").eq("id", tournamentId).maybeSingle(),
    db()
      .from("matches")
      .select("id, number, round, status, best_of, team1_id, team2_id, team1_score, team2_score, started_at, finished_at, maps:match_maps(status)")
      .eq("tournament_id", tournamentId)
      .neq("status", "cancelled")
      .order("round")
      .order("number"),
    db().from("server_instances").select("role"),
  ]);
  if (!t || ["finished", "cancelled", "draft"].includes(t.status)) return null;
  const rows = (ms ?? []) as unknown as Row[];
  const size = modeOf(t.format).size;

  // средняя длительность карты по сыгранным матчам
  const played = rows.filter((m) => m.status === "finished" && m.started_at && m.finished_at);
  let mapMin = DEFAULT_MAP_MIN[size] ?? 30;
  const samples = played
    .map((m) => {
      const maps = Math.max(1, m.maps.filter((x) => x.status === "finished").length);
      return (new Date(m.finished_at!).getTime() - new Date(m.started_at!).getTime()) / 60_000 / maps;
    })
    .filter((x) => x > 3 && x < 120);
  if (samples.length) mapMin = samples.reduce((a, b) => a + b, 0) / samples.length;

  // серия обычно короче best_of: BO3 в среднем ~2,5 карты, BO5 ~4
  const expectedMaps = (bo: number) => (bo <= 1 ? 1 : bo === 3 ? 2.5 : bo === 5 ? 4 : bo);
  const now = Date.now();
  const servers = Math.max(1, (inst ?? []).filter((i) => i.role !== "reserve").length);
  const serverFree: number[] = [];
  const teamFree = new Map<string, number>();
  const matchStart = new Map<string, number>();
  let finishAt = 0;
  const start0 = Math.max(now, t.starts_at ? new Date(t.starts_at).getTime() : now);

  // идущие матчи занимают серверы до своего ожидаемого конца
  for (const m of rows.filter((x) => ["live", "ready", "veto"].includes(x.status))) {
    const playedMaps = m.maps.filter((x) => x.status === "finished").length;
    const left = Math.max(0.5, expectedMaps(m.best_of) - playedMaps);
    const begun = m.started_at ? new Date(m.started_at).getTime() : now;
    const end = Math.max(now + 60_000, begun + (playedMaps + left) * (mapMin + MAP_CHANGE_MIN) * 60_000);
    serverFree.push(end);
    for (const id of [m.team1_id, m.team2_id]) if (id) teamFree.set(id, end);
    finishAt = Math.max(finishAt, end);
  }
  while (serverFree.length < servers) serverFree.push(start0);

  // остальные — по порядку раундов: свободный сервер и свободные участники
  for (const m of rows.filter((x) => ["upcoming", "pending"].includes(x.status))) {
    serverFree.sort((a, b) => a - b);
    const ready = Math.max(
      serverFree[0],
      m.team1_id ? (teamFree.get(m.team1_id) ?? start0) : finishAt || start0,
      m.team2_id ? (teamFree.get(m.team2_id) ?? start0) : finishAt || start0,
    );
    const begin = ready + BETWEEN_MATCHES_MIN * 60_000;
    const end = begin + expectedMaps(m.best_of) * (mapMin + MAP_CHANGE_MIN) * 60_000;
    matchStart.set(m.id, begin);
    serverFree[0] = end;
    for (const id of [m.team1_id, m.team2_id]) if (id) teamFree.set(id, end);
    finishAt = Math.max(finishAt, end);
  }
  return { matchStart, finishAt: finishAt || null, mapMinutes: Math.round(mapMin) };
}
