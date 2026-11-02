/** «В сети» и «был(а) …» по players.last_seen_at — общее для сервера и браузера */

export const ONLINE_WINDOW_MS = 2 * 60_000;

export const isOnline = (lastSeen: string | null | undefined, now = Date.now()) => !!lastSeen && now - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;

/** «в сети» / «был(а) 5 мин назад» / «был(а) 3 ч назад» / «был(а) 3 ноября» */
export function seenLabel(lastSeen: string | null | undefined, now = Date.now()) {
  if (!lastSeen) return "давно не заходил(а)";
  const ms = now - new Date(lastSeen).getTime();
  if (ms < ONLINE_WINDOW_MS) return "в сети";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `был(а) ${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `был(а) ${h} ч назад`;
  return `был(а) ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Almaty" }).format(new Date(lastSeen))}`;
}
