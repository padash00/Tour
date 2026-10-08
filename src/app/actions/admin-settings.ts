"use server";

import { isIP } from "node:net";
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
  // Object.hasOwn: «constructor»/«__proto__» не должны проходить как ключи настроек
  if (!Object.hasOwn(SETTINGS, key)) return { error: "Неизвестная настройка" };
  const clear = formData.get("clear") === "1";
  const value = String(formData.get("value") ?? "").trim();

  if (clear) {
    await db().from("app_settings").delete().eq("key", key);
  } else {
    if (!value) return { error: "Введите значение" };
    if (key === "OBSERVER_STEAM_IDS" && !value.split(",").every((s) => /^\d{17}$/.test(s.trim()))) {
      return { error: "SteamID64 — 17 цифр, через запятую" };
    }
    if (key === "PLAYER_IP" && isIP(value) !== 4 && !/^(?=.{1,253}$)(?=.*[a-z])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value)) {
      return { error: "Укажите IPv4-адрес или имя сервера без http:// и номера порта" };
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

/** Анкета игрока обязательна для команды и заявок (app_settings.PROFILE_REQUIRED: «1» / «0», по умолчанию — да) */
export async function setProfileRequired(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const value = formData.get("on");
  if (value !== "0" && value !== "1") return { error: "Не удалось определить новое состояние" };
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "PROFILE_REQUIRED", value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.profile_required", undefined, { on: value === "1" });
  revalidatePath("/admin/settings");
  revalidatePath("/team/create");
  return { success: value === "1" ? "Анкета обязательна для команды и заявок" : "Анкета необязательна — только напоминание" };
}

/** Открытый вход на игровые серверы (app_settings.SERVER_OPEN_JOIN: «1» / «0», по умолчанию — открыт). Агент применяет сам */
export async function setServerOpenJoin(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const value = formData.get("on");
  if (value !== "0" && value !== "1") return { error: "Не удалось определить новое состояние" };
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "SERVER_OPEN_JOIN", value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.server_open_join", undefined, { on: value === "1" });
  revalidatePath("/admin/settings");
  return { success: value === "1" ? "На серверы может зайти любой — применится за несколько секунд" : "На серверы пускаем только игроков матча" };
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
    // имя уходит в маппул турнира и конфиг MatchZy: латиница, цифры, «_», «.», «-»
    const name = String(formData.get("name") ?? "")
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    const link = String(formData.get("link") ?? "").trim();
    const id = link.match(/id=(\d{1,20})/)?.[1] ?? link.match(/^\d{1,20}$/)?.[0];
    if (!name) return { error: "Введите название карты латиницей (например aim_map)" };
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

/** Картинки карт видны на страницах турниров, статистики, матчей и в админке — только их и обновляем */
function revalidateMapImages() {
  revalidatePath("/tournaments/[slug]", "page");
  revalidatePath("/stats");
  revalidatePath("/stats/[slug]", "page");
  revalidatePath("/matches/[id]", "page");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tournaments", "layout");
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
  revalidateMapImages();
  return { success: "Картинка сохранена" };
}

export async function removeMapImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const map = String(formData.get("map") ?? "");
  const images = await readJson<Record<string, string>>("MAP_IMAGES", {});
  delete images[map];
  await writeJson("MAP_IMAGES", images, admin.id);
  revalidateMapImages();
  return { success: "Картинка убрана" };
}

export async function toggleMapEnabled(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const map = String(formData.get("map") ?? "");
  if (!MAP_KEY.test(map)) return { error: "Неизвестная карта" };
  const enabledValue = formData.get("enabled");
  if (enabledValue !== "0" && enabledValue !== "1") return { error: "Не удалось определить состояние карты" };
  const enabled = enabledValue === "1";
  const disabled = await readJson<string[]>("MAPS_DISABLED", []);
  const next = enabled ? disabled.filter((m) => m !== map) : [...new Set([...disabled, map])];
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "MAPS_DISABLED", value: JSON.stringify(next), updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить доступность карты" };
  await audit(admin.id, "settings.map_toggle", undefined, { map, enabled });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/tournaments", "layout");
  return { success: enabled ? "Карта доступна в турнирах" : "Карта скрыта из выбора" };
}
