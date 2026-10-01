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

// ───────────────────────── карты: картинки и доступность

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("app_settings").select("value").eq("key", key).maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown, adminId: string) {
  await db()
    .from("app_settings")
    .upsert({ key, value: JSON.stringify(value), updated_by: adminId, updated_at: new Date().toISOString() });
}

const MAP_KEY = /^([a-z0-9_]+|[^@\s]+@\d+)$/;

export async function uploadMapImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const map = String(formData.get("map") ?? "");
  if (!MAP_KEY.test(map)) return { error: "Неизвестная карта" };
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "Выберите картинку" };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "Картинка — PNG, JPG или WEBP" };
  if (file.size > 3 * 1024 * 1024) return { error: "Картинка — не больше 3 МБ" };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `maps/${map.replace(/[^a-z0-9_]/gi, "_")}-${Date.now()}.${ext}`;
  const { error } = await db()
    .storage.from("tournament-covers")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) return { error: "Не удалось загрузить картинку" };
  const url = db().storage.from("tournament-covers").getPublicUrl(path).data.publicUrl;
  const images = await readJson<Record<string, string>>("MAP_IMAGES", {});
  images[map] = url;
  await writeJson("MAP_IMAGES", images, admin.id);
  await audit(admin.id, "settings.map_image", undefined, { map });
  revalidatePath("/", "layout");
  return { success: "Картинка сохранена" };
}

export async function removeMapImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const map = String(formData.get("map") ?? "");
  const images = await readJson<Record<string, string>>("MAP_IMAGES", {});
  delete images[map];
  await writeJson("MAP_IMAGES", images, admin.id);
  revalidatePath("/", "layout");
  return { success: "Картинка убрана" };
}

export async function toggleMapEnabled(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const map = String(formData.get("map") ?? "");
  if (!MAP_KEY.test(map)) return { error: "Неизвестная карта" };
  const disabled = await readJson<string[]>("MAPS_DISABLED", []);
  const next = disabled.includes(map) ? disabled.filter((m) => m !== map) : [...disabled, map];
  await writeJson("MAPS_DISABLED", next, admin.id);
  await audit(admin.id, "settings.map_toggle", undefined, { map, enabled: !next.includes(map) });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tournaments", "layout");
  return { success: next.includes(map) ? "Карта скрыта из выбора" : "Карта доступна в турнирах" };
}
