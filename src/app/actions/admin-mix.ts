"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/supabase";
import { currentSeason } from "@/lib/twenty-core";

const SEASON = /^\d{4}-(0[1-9]|1[0-2])$/;
type Result = { error?: string; ok?: true };

/** Отметить (или снять отметку), что приз сезона «Микса» за это место выплачен */
export async function setSeasonPrizePaid(season: string, place: number, paid: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!SEASON.test(season) || ![1, 2, 3].includes(place)) return { error: "Такого места в итогах сезона нет" };
  const { data } = await db()
    .from("mix_season_results")
    .update({ paid_at: paid ? new Date().toISOString() : null, paid_by: paid ? admin.id : null })
    .eq("season", season)
    .eq("place", place)
    .select("steam_id, prize")
    .throwOnError();
  if (!data?.length) return { error: "Итоги этого сезона ещё не зафиксированы" };
  await audit(admin.id, paid ? "mix.prize_paid" : "mix.prize_unpaid", { type: "mix_season", id: season }, { place, steam_id: data[0].steam_id, prize: data[0].prize });
  revalidatePath("/twenty");
  return { ok: true };
}

/**
 * Пересчитать итоги завершённого сезона по текущей истории игр (например, после отмены игры с нарушением).
 * Старая тройка стирается, новая запишется при следующем открытии раздела. Пока хоть один приз отмечен выплаченным — нельзя.
 */
export async function refixSeason(season: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!SEASON.test(season) || season >= currentSeason()) return { error: "Пересчитать можно только завершённый сезон" };
  const { data } = await db().from("mix_season_results").select("place, steam_id, paid_at").eq("season", season).throwOnError();
  if (!data?.length) return { error: "Итоги этого сезона ещё не зафиксированы" };
  if (data.some((r) => r.paid_at)) return { error: "Сначала снимите отметки о выплате призов этого сезона" };
  await db().from("mix_season_results").delete().eq("season", season).is("paid_at", null).throwOnError();
  await audit(admin.id, "mix.season_refix", { type: "mix_season", id: season }, { was: data.map((r) => `${r.place}:${r.steam_id}`) });
  revalidatePath("/twenty");
  return { ok: true };
}
