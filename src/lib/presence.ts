import "server-only";

/*
 * Кто сейчас на сайте. Каждая открытая вкладка опрашивает /api/me (viewer.tsx): вошедший игрок — раз в 15 с,
 * гость — раз в минуту, плюс при каждом переходе. Здесь запоминается последний сигнал: игрок, страница, время.
 * Хранится только в памяти процесса (сайт — один контейнер), в базу не пишется; после перезапуска сайта
 * список собирается заново за минуту. Гость — случайный id вкладки, без личных данных.
 */

export const ONLINE_MS = 2 * 60_000;
const MAX_ENTRIES = 5_000;

export type PresenceEntry = { playerId: string | null; path: string; at: number; since: number };

const store: Map<string, PresenceEntry> = ((globalThis as { __f16Presence?: Map<string, PresenceEntry> }).__f16Presence ??= new Map());

/** Чистая страница сайта без query и чужих адресов — для показа в пульте */
function cleanPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw.split(/[?#]/)[0].slice(0, 200);
}

export function touchPresence({ playerId, visitor, path }: { playerId: string | null; visitor: string | null; path: string | null }) {
  const key = playerId ? `p:${playerId}` : visitor && /^[a-z0-9-]{8,64}$/i.test(visitor) ? `g:${visitor}` : null;
  if (!key) return;
  const now = Date.now();
  const prev = store.get(key);
  const fresh = prev && now - prev.at < ONLINE_MS;
  store.set(key, { playerId, path: cleanPath(path), at: now, since: fresh ? prev.since : now });
  if (store.size > MAX_ENTRIES) prune(now);
}

function prune(now = Date.now()) {
  for (const [k, v] of store) if (now - v.at >= ONLINE_MS) store.delete(k);
}

/** Сейчас на сайте: вошедшие игроки (последний сигнал первым) и число гостей */
export function onlineNow() {
  const now = Date.now();
  prune(now);
  const players: PresenceEntry[] = [];
  let guests = 0;
  for (const v of store.values()) {
    if (v.playerId) players.push(v);
    else guests++;
  }
  players.sort((a, b) => b.at - a.at);
  return { players, guests, now };
}
