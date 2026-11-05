import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "./supabase";
import { getStandings } from "./matches";
import { computePlacements, isPlayoffSide, type PlacementMatch } from "./awards-core";
import { getTournamentNominations } from "./nominations";
import type { Tournament } from "./types";
import { tr } from "./i18n/core";

/**
 * Награды считаются из результатов завершённых турниров (никаких выдуманных данных):
 * места 1–3 и номинации регламента — MVP, лучший снайпер, лучший рифлер (с решением судей). Хранить отдельно не нужно — пересчёт дешёвый,
 * завершённых турниров единицы; результат кэшируется (см. getAllAwards).
 */

export type AwardKind = "place" | "mvp" | "sniper" | "rifler";
export type Award = {
  kind: AwardKind;
  place?: 1 | 2 | 3;
  /** подпись значения: «12 клатчей», «ADR 96.4», «Swing +4.1» */
  value?: string;
  tournament: Pick<Tournament, "id" | "name" | "slug" | "starts_at">;
  teamId: string | null;
  playerIds: string[];
};

export const awardTitle = (a: Award) =>
  a.kind === "place" ? (a.place === 1 ? tr("Чемпион") : a.place === 2 ? tr("2 место") : tr("3 место")) : a.kind === "mvp" ? tr("MVP турнира") : a.kind === "sniper" ? tr("Лучший снайпер") : tr("Лучший рифлер");

async function tournamentAwards(t: Tournament): Promise<Award[]> {
  const meta = { id: t.id, name: t.name, slug: t.slug, starts_at: t.starts_at };
  const { data: matches } = await db()
    .from("matches")
    .select("bracket, round, status, team1_id, team2_id, winner_id")
    .eq("tournament_id", t.id);
  const list = (matches ?? []) as PlacementMatch[];
  const hasPlayoff = list.some((m) => isPlayoffSide(m.bracket));
  let ranking: string[] = [];
  if (!hasPlayoff) {
    const groups = await getStandings(t);
    if (groups.length === 1) ranking = groups[0].table.map((r) => r.teamId);
  }
  const placements = computePlacements(list, ranking);

  // составы призёров на этот турнир
  const { data: roster } = await db()
    .from("tournament_roster_players")
    .select("player_id, registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(team_id, status)")
    .eq("tournament_id", t.id)
    .eq("registration.status", "approved");
  const playersOf = (teamId: string) =>
    (roster ?? [])
      .filter((r) => r.registration.team_id === teamId)
      .map((r) => r.player_id);

  const awards: Award[] = placements.map((p) => ({ kind: "place", place: p.place, tournament: meta, teamId: p.teamId, playerIds: playersOf(p.teamId) }));

  // личные награды — номинации регламента (MVP, снайпер, рифлер): решение судей, без него — кандидат по статистике
  for (const n of await getTournamentNominations(t.id)) {
    if (n.key !== "mvp" && n.key !== "sniper" && n.key !== "rifler") continue;
    const w = n.winner;
    if (!w?.playerId) continue;
    awards.push({ kind: n.key, tournament: meta, teamId: w.team?.id ?? null, playerIds: [w.playerId], value: w.value ?? undefined });
  }
  return awards;
}

/** Тег кэша наград: сбрасывать, когда турнир завершается/переоткрывается или меняются его результаты */
export const AWARDS_TAG = "awards";

/**
 * Все награды по завершённым турнирам (новые сверху).
 * Пересчёт трогает каждый завершённый турнир, поэтому результат кэшируется между запросами (тег AWARDS_TAG)
 * и на всякий случай обновляется раз в час; в пределах запроса — один вызов (cache).
 */
export const getAllAwards = cache(
  unstable_cache(
    async (): Promise<Award[]> => {
      const { data } = await db().from("tournaments").select("*").eq("status", "finished").order("starts_at", { ascending: false });
      const all = await Promise.all(((data ?? []) as Tournament[]).map(tournamentAwards));
      return all.flat();
    },
    ["awards", "v2"],
    { tags: [AWARDS_TAG], revalidate: 3600 },
  ),
);

export async function getPlayerAwards(playerId: string) {
  return (await getAllAwards()).filter((a) => a.playerIds.includes(playerId));
}

/** Награды команды: места команды и личные награды её игроков в этих турнирах */
export async function getTeamAwards(teamId: string) {
  return (await getAllAwards()).filter((a) => a.teamId === teamId);
}

/** Место команды в турнире (для прогресса игрока) */
export async function getPlacementMap() {
  const map = new Map<string, 1 | 2 | 3>(); // `${tournamentId}:${teamId}`
  for (const a of await getAllAwards()) if (a.kind === "place" && a.teamId) map.set(`${a.tournament.id}:${a.teamId}`, a.place!);
  return map;
}
