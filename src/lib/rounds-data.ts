import "server-only";
import { db } from "./supabase";
import { buildMapRounds, type MapRounds, type RoundRow } from "./rounds";

/** Раунды матча (все карты или выбранные); rosters — SteamID64 игроков команды 1 и 2 */
export async function getMatchRounds(
  matchId: string,
  rosters: { team1: string[]; team2: string[] },
  teamSize: number,
  mapNumbers?: number[],
): Promise<MapRounds[]> {
  let q = db().from("match_rounds").select("map_number, round_number, winner_side, events").eq("match_id", matchId);
  if (mapNumbers?.length) q = q.in("map_number", mapNumbers);
  const { data } = await q.order("map_number").order("round_number").limit(400);
  return buildMapRounds((data ?? []) as RoundRow[], new Set(rosters.team1), new Set(rosters.team2), teamSize);
}
