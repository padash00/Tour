"use server";

import { getCurrentPlayer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { isTheme } from "@/lib/theme";

/** Выбор темы вошедшего игрока — в профиль, чтобы тема держалась и на других устройствах. Гостю хватает cookie */
export async function saveThemeChoice(theme: string): Promise<void> {
  if (!isTheme(theme)) return;
  const player = await getCurrentPlayer();
  if (!player) return;
  await db().from("players").update({ theme }).eq("id", player.id);
}
