"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SETTINGS, type SettingKey } from "@/lib/settings";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

export async function saveSetting(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const key = String(formData.get("key")) as SettingKey;
  if (!(key in SETTINGS)) return { error: "Неизвестная настройка" };
  const clear = formData.get("clear") === "1";
  const value = String(formData.get("value") ?? "").trim();

  if (clear) {
    await db().from("app_settings").delete().eq("key", key);
  } else {
    if (!value) return { error: "Введите значение" };
    if (key === "OBSERVER_STEAM_IDS" && !value.split(",").every((s) => /^\d{17}$/.test(s.trim()))) {
      return { error: "SteamID64 — 17 цифр, через запятую" };
    }
    if (value.length > 500) return { error: "Слишком длинное значение" };
    const { error } = await db()
      .from("app_settings")
      .upsert({ key, value, updated_by: admin.id, updated_at: new Date().toISOString() });
    if (error) return { error: "Не удалось сохранить" };
  }
  // сами значения ключей в журнал не пишем
  await audit(admin.id, clear ? "settings.clear" : "settings.set", undefined, { key });
  revalidatePath("/admin/settings");
  return { success: clear ? "Удалено" : "Сохранено" };
}
