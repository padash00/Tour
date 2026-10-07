import "server-only";
import { cache } from "react";
import { db } from "./supabase";

/**
 * Раунды сетки турнира — только то, что нужно для подписи стадии матча (matchStage):
 * «Финал верхней сетки» и т.п. зависят от числа раундов верхней/нижней сетки.
 * Вместо всех матчей турнира с командами — две маленькие колонки.
 */
export const getStageRounds = cache(async (tournamentId: string): Promise<{ bracket: string; round: number }[]> => {
  const { data } = await db().from("matches").select("bracket, round").eq("tournament_id", tournamentId).in("bracket", ["upper", "lower"]);
  return (data ?? []) as { bracket: string; round: number }[];
});
