import "server-only";
import { isUuid } from "./dm";
import { getSetting } from "./settings";
import { db } from "./supabase";

/** Аккаунт поддержки: из настройки SUPPORT_PLAYER_ID, иначе — первый администратор сайта */
export async function supportPlayerId(): Promise<string | null> {
  const set = await getSetting("SUPPORT_PLAYER_ID");
  if (isUuid(set)) return set;
  const { data } = await db().from("players").select("id").eq("is_admin", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}
