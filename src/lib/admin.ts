import { env } from "./env";
import type { Player } from "./types";

/**
 * Админ сайта: флаг в профиле или SteamID из ADMIN_STEAM_IDS. Отдельно от auth.ts: тот тянет next/navigation,
 * а эта проверка нужна и модулям, которые работают вне запроса страницы (бот Telegram, разбор демок) и в офлайн-тестах.
 */
export function isAdmin(player: Player | null): boolean {
  if (!player || player.is_banned) return false;
  return player.is_admin || env.adminSteamIds.includes(player.steam_id);
}
