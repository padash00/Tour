"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { fetchFaceitBySteamId } from "@/lib/faceit";
import { fetchSteamProfile } from "@/lib/steam";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

export async function refreshProfile(): Promise<ActionResult> {
  const player = await requirePlayer();
  const [profile, faceit] = await Promise.all([
    fetchSteamProfile(player.steam_id),
    fetchFaceitBySteamId(player.steam_id),
  ]);
  const now = new Date().toISOString();
  await db()
    .from("players")
    .update({
      nickname: profile.nickname,
      avatar_url: profile.avatarUrl ?? player.avatar_url,
      ...(faceit && {
        faceit_id: faceit.id,
        faceit_nickname: faceit.nickname,
        faceit_level: faceit.level,
        faceit_elo: faceit.elo,
        faceit_updated_at: now,
      }),
    })
    .eq("id", player.id);
  revalidatePath("/me");
  return faceit ? { success: "Профиль и FACEIT обновлены" } : { success: "Профиль Steam обновлён. FACEIT-профиль не найден." };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const player = await requirePlayer();
  await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("player_id", player.id).is("read_at", null);
  revalidatePath("/", "layout");
  return null;
}
