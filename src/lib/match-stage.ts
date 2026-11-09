import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import type { StageRound } from "./bracket";

/**
 * Раунды сетки турнира — только то, что нужно для подписи стадии матча (matchStage):
 * «Финал верхней сетки» и т.п. зависят от числа раундов верхней/нижней сетки.
 * Вместо всех матчей турнира с командами — две маленькие колонки.
 */
export const getStageRounds = cache(async (tournamentId: string): Promise<StageRound[]> => {
  const { data } = await db().from("matches").select("bracket, round, is_walkover, team1_id, team2_id").eq("tournament_id", tournamentId).in("bracket", ["upper", "lower"]);
  return (data ?? []) as StageRound[];
});
