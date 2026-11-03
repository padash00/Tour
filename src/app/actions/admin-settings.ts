"use server";

import { isIP } from "node:net";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SKIN_PARTS, SETTINGS, type SettingKey } from "@/lib/settings";
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
    if ((key === "PLAYER_IP" || key === "INTERNET_IP") && isIP(value) !== 4 && !/^(?=.{1,253}$)(?=.*[a-z])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value)) {
      return { error: "Укажите IPv4-адрес или имя сервера без http:// и номера порта" };
    }
    if ((key === "BACKUP_RETENTION_DAYS" || key === "DEMO_RETENTION_DAYS") && !/^\d{1,3}$/.test(value)) {
      return { error: "Число дней, например 30" };
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

/** Скины F16 на игровых серверах (app_settings.SERVER_SKINS: «1» / «0»). Агент ставит или убирает плагины, когда матчей нет */
export async function setServerSkins(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const value = formData.get("on");
  if (value !== "0" && value !== "1") return { error: "Не удалось определить новое состояние" };
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "SERVER_SKINS", value, updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.server_skins", undefined, { on: value === "1" });
  revalidatePath("/admin/settings");
  return {
    success:
      value === "1"
        ? "Скины включатся в течение минуты: свободные серверы перезапустятся. Если идёт матч — после него"
        : "Скины выключатся в течение минуты: свободные серверы перезапустятся. Если идёт матч — после него",
  };
}

/** Какие виды скинов разрешены (app_settings.SERVER_SKIN_PARTS). Агент применит, когда на серверах нет матчей */
export async function saveSkinParts(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parts = Object.fromEntries(SKIN_PARTS.map((p) => [p.key, formData.get(p.key) === "on"]));
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "SERVER_SKIN_PARTS", value: JSON.stringify(parts), updated_by: admin.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.server_skin_parts", undefined, parts);
  revalidatePath("/admin/settings");
  return { success: "Сохранено. Применится в течение минуты, свободные серверы перезапустятся; если идёт матч — после него" };
}

/** Меню скинов: обычное или окна F16 с мышью + номер аддона окон в Workshop. Агент применит, когда нет матчей */
export async function saveSkinsMenu(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const mode = formData.get("mode") === "panorama" ? "panorama" : "text";
  const addon = String(formData.get("addon") ?? "").trim().replace(/.*[?&]id=(\d+).*/, "$1");
  if (addon && !/^\d{5,15}$/.test(addon)) return { error: "Номер аддона — число из адреса страницы Workshop (…?id=ЧИСЛО)" };
  if (mode === "panorama" && !addon) return { error: "Для окон нужен номер аддона: сначала опубликуйте аддон F16 UI в Workshop" };
  const now = new Date().toISOString();
  const { error } = await db()
    .from("app_settings")
    .upsert([
      { key: "SERVER_SKINS_MENU", value: mode, updated_by: admin.id, updated_at: now },
      { key: "SERVER_UI_ADDON", value: addon, updated_by: admin.id, updated_at: now },
    ]);
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.server_skins_menu", undefined, { mode, addon });
  revalidatePath("/admin/settings");
  return { success: `${mode === "panorama" ? "Окна F16" : "Обычное меню"} — применится в течение минуты, свободные серверы перезапустятся` };
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

// ── наблюдатели трансляции: список SteamID в OBSERVER_STEAM_IDS (через запятую)

async function observerList(): Promise<string[]> {
  const { data } = await db().from("app_settings").select("value").eq("key", "OBSERVER_STEAM_IDS").maybeSingle();
  return String(data?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));
}

async function saveObservers(ids: string[], adminId: string) {
  if (!ids.length) return db().from("app_settings").delete().eq("key", "OBSERVER_STEAM_IDS");
  return db().from("app_settings").upsert({ key: "OBSERVER_STEAM_IDS", value: ids.join(","), updated_by: adminId, updated_at: new Date().toISOString() });
}

/** SteamID64 из числа или ссылки: /profiles/7656…, /id/ник (через Steam API), steamid.io и т. п. */
async function resolveSteamId(raw: string): Promise<string | null> {
  const direct = /(7656119\d{10})/.exec(raw)?.[1];
  if (direct) return direct;
  const vanity = /steamcommunity\.com\/id\/([\w-]+)/i.exec(raw)?.[1] ?? (/^[\w-]{2,32}$/.test(raw.trim()) ? raw.trim() : null);
  if (!vanity) return null;
  const { data } = await db().from("app_settings").select("value").eq("key", "STEAM_API_KEY").maybeSingle();
  const key = data?.value || process.env.STEAM_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { response?: { success?: number; steamid?: string } };
    return j.response?.success === 1 && j.response.steamid ? j.response.steamid : null;
  } catch {
    return null;
  }
}

export async function addObserver(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const raw = String(formData.get("steam") ?? "").trim();
  if (!raw) return { error: "Вставьте SteamID или ссылку на профиль Steam" };
  const id = await resolveSteamId(raw);
  if (!id) return { error: "Не нашёл аккаунт: нужен SteamID64 (17 цифр) или ссылка steamcommunity.com/profiles/… или /id/…" };
  const list = await observerList();
  if (list.includes(id)) return { error: "Этот аккаунт уже в наблюдателях" };
  if (list.length >= 20) return { error: "Не больше 20 наблюдателей" };
  const { error } = await saveObservers([...list, id], admin.id);
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.observer_add", undefined, { steam_id: id });
  revalidatePath("/admin/settings");
  return { success: `Наблюдатель добавлен: ${id}` };
}

export async function removeObserver(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("steamId") ?? "");
  const list = await observerList();
  if (!list.includes(id)) return { error: "Его уже нет в списке" };
  const { error } = await saveObservers(list.filter((x) => x !== id), admin.id);
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, "settings.observer_remove", undefined, { steam_id: id });
  revalidatePath("/admin/settings");
  return { success: "Наблюдатель убран" };
}

