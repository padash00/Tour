import "server-only";
import { cache } from "react";
import { db } from "./supabase";

/** Настройки, которые админ меняет на сайте. Значение из базы важнее переменной окружения. */
export const SETTINGS = {
  STEAM_API_KEY: { label: "Steam Web API key", secret: true, hint: "steamcommunity.com/dev/apikey — ники и аватары игроков" },
  FACEIT_API_KEY: { label: "FACEIT API key", secret: true, hint: "developers.faceit.com — Server side key, уровень и ELO" },
  PLAYER_IP: {
    label: "IP сервера для игроков",
    secret: false,
    hint: "Адрес для игроков турниров и лобби, без порта. Для ПК в 192.168.100.* укажите адрес роутера с их стороны (например, 192.168.100.210). Пусто — автоматический выбор по типу сети.",
  },
  BACKUP_RETENTION_DAYS: {
    label: "Сколько дней хранить бэкапы раундов",
    secret: false,
    hint: "Агент удаляет на серверном ПК бэкапы раундов старше этого срока (файлы идущего матча не трогает). Пусто — 1 день.",
  },
  DEMO_RETENTION_DAYS: {
    label: "Сколько дней хранить демо",
    secret: false,
    hint: "Демо карт лежат на серверном ПК, игроки скачивают их со страницы матча. Старше этого срока агент удаляет. Пусто — 30 дней, максимум 365.",
  },
  OBSERVER_STEAM_IDS: {
    label: "SteamID observer-аккаунтов",
    secret: false,
    hint: "Через запятую. Эти аккаунты пускаются на сервер матча зрителями (ПК 801–803).",
  },
  MAX_PARALLEL_MATCHES: {
    label: "Турнирных матчей одновременно",
    secret: false,
    hint: "По местам в зале: 5×5 — мест / 10 (55 мест → 5). Автопилот не отправит на серверы больше матчей сразу, остальные ждут. Пусто — по числу серверов.",
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;

const loadAll = cache(async () => {
  const { data } = await db().from("app_settings").select("key, value");
  return new Map((data ?? []).map((r) => [r.key, r.value as string]));
});

export async function getSetting(key: SettingKey): Promise<string | null> {
  try {
    const v = (await loadAll()).get(key);
    if (v) return v;
  } catch {
    // таблицы может ещё не быть — берём из окружения
  }
  return process.env[key] || null;
}

export async function getSettingsStatus() {
  const stored = await loadAll().catch(() => new Map<string, string>());
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const value = stored.get(key) ?? process.env[key] ?? "";
    return {
      key,
      ...SETTINGS[key],
      source: stored.has(key) ? ("site" as const) : process.env[key] ? ("env" as const) : null,
      preview: !value ? "" : SETTINGS[key].secret ? `••••${value.slice(-4)}` : value,
    };
  });
}

/** Сколько турнирных матчей может идти на серверах одновременно (места в зале). null — без ограничения */
export async function getMaxParallelMatches(): Promise<number | null> {
  const n = Number.parseInt((await getSetting("MAX_PARALLEL_MATCHES")) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Библиотека карт Workshop: строки «name@id» (хранится в app_settings.WORKSHOP_MAPS как JSON) */
export async function getWorkshopMaps(): Promise<string[]> {
  try {
    const raw = (await loadAll()).get("WORKSHOP_MAPS");
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return list.filter((x) => /^[^@\s]+@\d+$/.test(x));
  } catch {
    return [];
  }
}

/** Картинки карт: { "de_mirage": url, "aim_map@3070549948": url } (app_settings.MAP_IMAGES) */
export async function getMapImages(): Promise<Record<string, string>> {
  try {
    const raw = (await loadAll()).get("MAP_IMAGES");
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Официальные карты, которые админ скрыл из выбора в турнирах (app_settings.MAPS_DISABLED) */
export async function getDisabledMaps(): Promise<string[]> {
  try {
    const raw = (await loadAll()).get("MAPS_DISABLED");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Виды скинов F16 — ключи совпадают с флагами WeaponPaints (Additional.<Key>Enabled) в агенте */
export const SKIN_PARTS = [
  { key: "skin", label: "Скины оружия", hint: "!skins — раскраски всего оружия" },
  { key: "knife", label: "Ножи", hint: "!knife — модель ножа" },
  { key: "glove", label: "Перчатки", hint: "!gloves" },
  { key: "agent", label: "Агенты", hint: "!agents — модели игроков; влияют на заметность" },
  { key: "music", label: "Музыка MVP", hint: "!music" },
  { key: "pins", label: "Значки", hint: "!pins — значок в таблице счёта" },
] as const;
export type SkinPart = (typeof SKIN_PARTS)[number]["key"];
export type SkinParts = Record<SkinPart, boolean>;

/** Разрешённые виды скинов (app_settings.SERVER_SKIN_PARTS, JSON). Нет записи — разрешено всё */
export async function getSkinParts(): Promise<SkinParts> {
  const all = Object.fromEntries(SKIN_PARTS.map((p) => [p.key, true])) as SkinParts;
  const { data } = await db().from("app_settings").select("value").eq("key", "SERVER_SKIN_PARTS").maybeSingle();
  try {
    const saved = data?.value ? (JSON.parse(data.value) as Partial<SkinParts>) : {};
    for (const p of SKIN_PARTS) if (typeof saved[p.key] === "boolean") all[p.key] = saved[p.key]!;
  } catch {}
  return all;
}

/** Скины F16 на игровых серверах (WeaponPaints): app_settings.SERVER_SKINS «1» — включены. Применяет агент */
export async function isServerSkins(): Promise<boolean> {
  const { data } = await db().from("app_settings").select("value").eq("key", "SERVER_SKINS").maybeSingle();
  return data?.value === "1";
}

/** Вход на игровые серверы для всех (наблюдатели, трансляция, тренировка). app_settings.SERVER_OPEN_JOIN «0» — только матч */
export async function isServerOpenJoin(): Promise<boolean> {
  const { data } = await db().from("app_settings").select("value").eq("key", "SERVER_OPEN_JOIN").maybeSingle();
  return data?.value !== "0";
}
