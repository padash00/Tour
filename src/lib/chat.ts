import "server-only";
import { db } from "./supabase";

/** Общий чат сайта: последние сообщения (без удалённых) с ником и аватаром автора */
export type ChatMessage = { id: number; player_id: string; nickname: string; avatar_url: string | null; steam_id: string; body: string; created_at: string; is_admin: boolean };

export const CHAT_LIMIT = 80;
export const CHAT_MAX_LEN = 300;

export async function listChat(afterId?: number): Promise<ChatMessage[]> {
  let q = db()
    .from("chat_messages")
    .select("id, player_id, body, created_at, player:players!chat_messages_player_id_fkey(nickname, avatar_url, steam_id, is_admin)")
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(CHAT_LIMIT);
  if (afterId) q = q.gt("id", afterId);
  const { data } = await q;
  type Row = { id: number; player_id: string; body: string; created_at: string; player: { nickname: string; avatar_url: string | null; steam_id: string; is_admin: boolean } | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id,
      player_id: r.player_id,
      body: r.body,
      created_at: r.created_at,
      nickname: r.player?.nickname ?? "игрок",
      avatar_url: r.player?.avatar_url ?? null,
      steam_id: r.player?.steam_id ?? "",
      is_admin: !!r.player?.is_admin,
    }))
    .reverse();
}

/** Текст сообщения: без управляющих символов, без лишних пробелов, не длиннее лимита */
export function cleanChatText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s{3,}/g, "  ").trim().slice(0, CHAT_MAX_LEN);
}
