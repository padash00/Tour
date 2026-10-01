"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SETTINGS, type SettingKey } from "@/lib/settings";
import { enqueueCommand } from "@/lib/server-control";
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

/** Добавить / убрать карту из библиотеки Workshop */
export async function editWorkshopMaps(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data } = await db().from("app_settings").select("value").eq("key", "WORKSHOP_MAPS").maybeSingle();
  let list: string[] = [];
  try {
    list = data?.value ? JSON.parse(data.value) : [];
  } catch {}
  const remove = String(formData.get("remove") ?? "");
  if (remove) {
    list = list.filter((x) => x !== remove);
  } else {
    const name = String(formData.get("name") ?? "").trim().replace(/[@,\s]+/g, "_");
    const link = String(formData.get("link") ?? "").trim();
    const id = link.match(/id=(\d+)/)?.[1] ?? link.match(/^\d+$/)?.[0];
    if (!name) return { error: "Введите название карты" };
    if (!id) return { error: "Нужна ссылка на карту в Workshop (…filedetails/?id=123) или её ID" };
    list = [...list.filter((x) => !x.endsWith(`@${id}`)), `${name}@${id}`];
    // сразу проверяем на сервере, грузится ли карта в CS2, и узнаём её внутреннее имя
    await enqueueCommand(null, "prefetch_maps", { workshop_ids: [id] }, admin.id);
  }
  await db().from("app_settings").upsert({ key: "WORKSHOP_MAPS", value: JSON.stringify(list), updated_by: admin.id, updated_at: new Date().toISOString() });
  await audit(admin.id, "settings.workshop_maps", undefined, { count: list.length });
  revalidatePath("/admin/settings");
  return { success: remove ? "Карта убрана" : "Карта добавлена — сервер проверяет, грузится ли она (до пары минут)" };
}
