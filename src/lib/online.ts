/** «В сети» и «был(а) …» по players.last_seen_at — общее для сервера и браузера */

import { intlLocale, type T } from "./i18n/core";

export const ONLINE_WINDOW_MS = 2 * 60_000;

export const isOnline = (lastSeen: string | null | undefined, now = Date.now()) => !!lastSeen && now - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;

/** «в сети» / «был(а) 5 мин назад» / «был(а) 3 ч назад» / «был(а) 3 ноября» */
export function seenLabel(t: T, lastSeen: string | null | undefined, now = Date.now()) {
  if (!lastSeen) return t("давно не заходил(а)");
  const ms = now - new Date(lastSeen).getTime();
  if (ms < ONLINE_WINDOW_MS) return t("в сети");
  const min = Math.round(ms / 60_000);
  if (min < 60) return t("был(а) {n} мин назад", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("был(а) {n} ч назад", { n: h });
  return t("был(а) {date}", { date: new Intl.DateTimeFormat(intlLocale(t.lang), { day: "numeric", month: "long", timeZone: "Asia/Almaty" }).format(new Date(lastSeen)) });
}
