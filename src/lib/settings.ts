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
    hint: "Адрес, который получают игроки. Пусто — автоматически: внешний адрес роутера серверного ПК (UPnP), если он есть, иначе LAN-адрес агента.",
  },
  OBSERVER_STEAM_IDS: {
    label: "SteamID observer-аккаунтов",
    secret: false,
    hint: "Через запятую. Эти аккаунты пускаются на сервер матча зрителями (ПК 801–803).",
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
