"use server";

import { getCurrentPlayer } from "@/lib/auth";
import { isLang } from "@/lib/i18n/core";
import { db } from "@/lib/supabase";

/** Выбор ҚАЗ/РУС вошедшего игрока — в профиль, чтобы язык держался и на других устройствах. Гостю хватает cookie */
export async function saveLangChoice(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  const player = await getCurrentPlayer();
  if (!player || player.lang === lang) return;
  await db().from("players").update({ lang }).eq("id", player.id);
}
