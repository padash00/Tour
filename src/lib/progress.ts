import "server-only";
import { db } from "./supabase";
import { aggregatePlayers, getStatRows, type MapStatRow } from "./stats";
import { getPlacementMap } from "./awards";
import { trend, type Trend } from "./awards-core";
import { modeOf } from "./modes";
import type { Tournament } from "./types";

/**
 * Прогресс игрока по турнирам: рейтинг, K/D, ADR, место команды, лучшая карта,
 * тренд к прошлому турниру. Только реальные данные из статистики матчей.
 */
export type ProgressItem = {
  tournament: Pick<Tournament, "id" | "name" | "slug" | "starts_at">;
  maps: number;
  rating: number;
  kd: number;
  adr: number;
  place: 1 | 2 | 3 | null;
  bestMap: { map: string; rating: number } | null;
  trend: { rating: Trend; kd: Trend; adr: Trend };
};

type Row = MapStatRow & { match: { tournament_id: string } };

export async function getPlayerProgress(playerId: string): Promise<ProgressItem[]> {
  const rows = (await getStatRows({ playerId })) as Row[];
  if (rows.length === 0) return [];
  const tIds = [...new Set(rows.map((r) => r.match.tournament_id))];
  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  const [{ data: ts }, { data: maps }, placements] = await Promise.all([
    db().from("tournaments").select("id, name, slug, starts_at").in("id", tIds),
    db().from("match_maps").select("match_id, map_number, map_name").in("match_id", matchIds),
    getPlacementMap(),
  ]);
  const mapName = new Map((maps ?? []).map((m) => [`${m.match_id}:${m.map_number}`, m.map_name as string]));

  const items = ((ts ?? []) as ProgressItem["tournament"][])
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
    .map((t) => {
      const mine = rows.filter((r) => r.match.tournament_id === t.id);
      const agg = aggregatePlayers(mine)[0];
      // лучшая карта турнира — по рейтингу на карте (карты одного названия усредняются)
      const byMap = new Map<string, MapStatRow[]>();
      for (const r of mine) {
        const name = mapName.get(`${r.match_id}:${r.map_number}`);
        if (!name) continue;
        byMap.set(name, [...(byMap.get(name) ?? []), r]);
      }
      const best = [...byMap.entries()]
        .map(([map, list]) => ({ map, rating: aggregatePlayers(list)[0]?.rating ?? 0 }))
        .sort((a, b) => b.rating - a.rating)[0];
      const teamId = mine.find((r) => r.team_id)?.team_id ?? null;
      return {
        tournament: t,
        maps: agg?.maps ?? 0,
        rating: agg?.rating ?? 0,
        kd: agg?.kd ?? 0,
        adr: agg?.adr ?? 0,
        place: teamId ? (placements.get(`${t.id}:${teamId}`) ?? null) : null,
        bestMap: best ?? null,
        trend: { rating: "flat" as Trend, kd: "flat" as Trend, adr: "flat" as Trend },
      };
    });
  items.forEach((it, i) => {
    const prev = items[i - 1];
    it.trend = { rating: trend(it.rating, prev?.rating), kd: trend(it.kd, prev?.kd), adr: trend(it.adr, prev?.adr) };
  });
  return items.reverse(); // новые сверху
}

/**
 * Состав команды из её прошлой одобренной заявки на турнир того же режима —
 * для «Подать заявку тем же составом». Только те, кто сейчас в команде и не заблокирован.
 */
export async function getPreviousRoster(
  teamId: string,
  tournament: Pick<Tournament, "id" | "format">,
  currentMembers: { player_id: string; player: { nickname: string; is_banned: boolean } }[],
) {
  const { data } = await db()
    .from("tournament_registrations")
    .select("id, created_at, tournament:tournaments!inner(id, name, format, status), roster:tournament_roster_players!tournament_roster_players_registration_id_fkey(player_id, role)")
    .eq("team_id", teamId)
    .eq("status", "approved")
    .neq("tournament_id", tournament.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const prev = (data ?? []).find((r) => r.tournament.format === tournament.format && r.tournament.status !== "draft" && r.roster.length);
  if (!prev) return null;
  const mode = modeOf(tournament.format);
  const ok = new Map(currentMembers.filter((m) => !m.player.is_banned).map((m) => [m.player_id, m.player.nickname]));
  const main = prev.roster.filter((r) => r.role === "main" && ok.has(r.player_id)).map((r) => r.player_id);
  const sub = prev.roster.filter((r) => r.role === "sub" && ok.has(r.player_id)).map((r) => r.player_id).slice(0, mode.subs);
  if (main.length !== mode.size) return null; // кого-то из основы уже нет в команде — тогда только ручной выбор
  return { tournamentName: prev.tournament.name, main, sub, names: [...main, ...sub].map((id) => ok.get(id)!) };
}
