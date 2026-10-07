"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRateLimited } from "@/lib/data";
import { fetchFaceitBySteamId } from "@/lib/faceit";
import { fetchSteamProfile } from "@/lib/steam";
import { db } from "@/lib/supabase";
import { markLoginRefreshed } from "@/lib/profile-sync";
import type { ActionResult } from "@/components/forms";

export async function refreshProfile(): Promise<ActionResult> {
  const player = await requirePlayer();
  // каждый вызов ходит во внешние Steam/FACEIT API — не чаще раза в 15 секунд
  if (await isRateLimited(player.id, "profile.refresh", 15)) return { error: "Профиль только что обновлялся — подождите немного" };
  await audit(player.id, "profile.refresh");
  const [profile, faceit] = await Promise.all([
    fetchSteamProfile(player.steam_id),
    fetchFaceitBySteamId(player.steam_id),
  ]);
  const now = new Date().toISOString();
  await db()
    .from("players")
    .update({
      ...(profile.ok && { nickname: profile.nickname, avatar_url: profile.avatarUrl ?? player.avatar_url }),
      ...(faceit && {
        faceit_id: faceit.id,
        faceit_nickname: faceit.nickname,
        faceit_level: faceit.level,
        faceit_elo: faceit.elo,
        faceit_updated_at: now,
      }),
    })
    .eq("id", player.id);
  if (profile.ok || faceit) await markLoginRefreshed(player.id);
  revalidatePath("/me");
  revalidatePath(`/players/${player.steam_id}`);
  if (!profile.ok) return { error: "Steam не ответил — попробуйте позже" };
  return faceit ? { success: "Профиль и FACEIT обновлены" } : { success: "Профиль Steam обновлён. FACEIT-профиль не найден." };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const player = await requirePlayer();
  await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("player_id", player.id).is("read_at", null);
  // только страница уведомлений этого игрока — не сбрасывать кэш всего сайта
  revalidatePath("/notifications");
  return null;
}

/** Отметить прочитанным одно уведомление — только своё (по player_id текущего игрока) */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const player = await requirePlayer();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Уведомление не найдено" };
  await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("player_id", player.id).is("read_at", null);
  return null;
}
