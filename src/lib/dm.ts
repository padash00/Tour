import "server-only";
import { db } from "./supabase";

/*
 * Личные сообщения: любой вошедший игрок может написать любому. Блокировка — односторонняя (blocker не получает
 * сообщений от blocked и сам ему не пишет). Админ читает переписку только по жалобе (dm_reports).
 */

export const DM_MAX_LEN = 1000;
export const DM_PAGE = 60;

export type DmPeer = { id: string; nickname: string; avatar_url: string | null; steam_id: string; last_seen_at: string | null };
/** image — есть картинка: её отдаёт /api/dm/image/<id> (путь в хранилище наружу не уходит) */
export type DmMessage = { id: number; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null; image: boolean };
type DmRow = Omit<DmMessage, "image"> & { image_path: string | null };
const toMessage = ({ image_path, ...m }: DmRow): DmMessage => ({ ...m, image: !!image_path });
const MSG = "id, sender_id, recipient_id, body, created_at, read_at, image_path";

/** Картинки в сообщениях: закрытое хранилище, до 3 МБ, PNG / JPG / WEBP */
export const DM_IMAGE_BUCKET = "dm-images";
export const DM_IMAGE_MAX = 3 * 1024 * 1024;
export type DmConversation = { peer: DmPeer; last: DmMessage; unread: number };

const PEER = "id, nickname, avatar_url, steam_id, last_seen_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** id попадают в строку фильтра PostgREST (.or) — только настоящие uuid, иначе исключение */
const ids = (...v: string[]) => {
  for (const x of v) if (!isUuid(x)) throw new Error("bad id");
};

/** Текст сообщения: без управляющих символов (переносы строк можно), без лишних пустых строк, не длиннее лимита */
export function cleanDmText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DM_MAX_LEN);
}

export async function dmUnreadCount(playerId: string): Promise<number> {
  const { count } = await db().from("direct_messages").select("id", { count: "exact", head: true }).eq("recipient_id", playerId).is("read_at", null);
  return count ?? 0;
}

/** Блокировки между двумя игроками: кто кого */
export async function blockState(me: string, other: string) {
  ids(me, other);
  const { data } = await db().from("dm_blocks").select("blocker_id, blocked_id").or(`and(blocker_id.eq.${me},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${me})`);
  return {
    iBlocked: (data ?? []).some((b) => b.blocker_id === me),
    blockedMe: (data ?? []).some((b) => b.blocker_id === other),
  };
}

/** Диалоги игрока: собеседник, последнее сообщение и сколько непрочитанных от него (свежие сверху) */
export async function listConversations(me: string): Promise<DmConversation[]> {
  ids(me);
  // последние 500 сообщений игрока хватает, чтобы собрать список диалогов
  const { data } = await db()
    .from("direct_messages")
    .select(MSG)
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order("id", { ascending: false })
    .limit(500);
  const byPeer = new Map<string, { last: DmMessage; unread: number }>();
  for (const m of ((data ?? []) as DmRow[]).map(toMessage)) {
    const peer = m.sender_id === me ? m.recipient_id : m.sender_id;
    const cur = byPeer.get(peer) ?? { last: m, unread: 0 };
    if (m.recipient_id === me && !m.read_at) cur.unread++;
    byPeer.set(peer, cur);
  }
  if (!byPeer.size) return [];
  const { data: peers } = await db().from("players").select(PEER).in("id", [...byPeer.keys()]);
  const map = new Map(((peers ?? []) as DmPeer[]).map((p) => [p.id, p]));
  return [...byPeer.entries()]
    .filter(([id]) => map.has(id))
    .map(([id, v]) => ({ peer: map.get(id)!, ...v }))
    .sort((a, b) => b.last.id - a.last.id);
}

/** Переписка двух игроков: последние сообщения (или только новее afterId) по возрастанию */
export async function listThread(me: string, other: string, afterId?: number): Promise<DmMessage[]> {
  ids(me, other);
  let q = db()
    .from("direct_messages")
    .select(MSG)
    .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
    .order("id", { ascending: false })
    .limit(DM_PAGE);
  if (afterId) q = q.gt("id", afterId);
  const { data } = await q;
  return ((data ?? []) as DmRow[]).map(toMessage).reverse();
}

export async function getPeer(id: string): Promise<DmPeer | null> {
  const { data } = await db().from("players").select(PEER).eq("id", id).maybeSingle();
  return (data as DmPeer | null) ?? null;
}

/** Прочитано: все сообщения от other ко мне */
export async function markThreadRead(me: string, other: string) {
  await db().from("direct_messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", me).eq("sender_id", other).is("read_at", null);
}
