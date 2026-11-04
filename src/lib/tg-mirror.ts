import "server-only";
import { db } from "./supabase";
import { tgCall } from "./telegram";
import type { TgMessage } from "./tg-moderation";

/*
 * Дубль «Объявлений» в «Общение»: всё, что организаторы публикуют в теме «Объявления», бот копирует
 * в тему «Общение» (copyMessage — без пометки «переслано», с тем же текстом, фото и форматированием).
 * Темы задаются командами /announce (в «Объявлениях») и /chat (в «Общении»). Альбомы копируются целиком.
 */

const ALBUM_WAIT_MS = 2500;

export async function mirrorThreads() {
  const { data } = await db().from("app_settings").select("key, value").in("key", ["TELEGRAM_ANNOUNCE_THREAD", "TELEGRAM_CHAT_THREAD"]);
  const m = new Map((data ?? []).map((r) => [r.key, Number(r.value) || null]));
  return { from: m.get("TELEGRAM_ANNOUNCE_THREAD") ?? null, to: m.get("TELEGRAM_CHAT_THREAD") ?? null };
}

/** Нужно ли копировать это сообщение (новое сообщение в «Объявлениях», не команда и не служебное) */
export function shouldMirror(msg: TgMessage & { media_group_id?: string }, from: number | null) {
  if (!from || !msg.is_topic_message || msg.message_thread_id !== from) return false;
  if (msg.from?.is_bot && msg.sender_chat?.id !== msg.chat.id) return false; // сообщения ботов (в т.ч. нашего) не дублируем
  if (msg.pinned_message || msg.new_chat_members?.length || msg.left_chat_member) return false;
  if ((msg.text ?? "").startsWith("/")) return false;
  return true;
}

async function claimed(key: string) {
  // отметка «уже скопировано» — повторная доставка вебхука не даст дубля
  const { data } = await db().from("audit_logs").select("id").eq("action", "tg.mirror").eq("payload->>key", key).limit(1);
  if (data?.length) return true;
  const { error } = await db().from("audit_logs").insert({ action: "tg.mirror", payload: { key } });
  return !!error;
}

export async function mirrorAnnouncement(token: string, msg: TgMessage & { media_group_id?: string }, to: number) {
  const chat = msg.chat.id;
  if (!msg.media_group_id) {
    if (await claimed(`${chat}:${msg.message_id}`)) return;
    const r = await tgCall(token, "copyMessage", { chat_id: chat, message_thread_id: to, from_chat_id: chat, message_id: msg.message_id });
    if (!r.ok) console.error("tg mirror", r.description);
    return;
  }
  // альбом приходит отдельными сообщениями: запоминаем части, ждём, и копирует все разом та часть, что пришла первой
  const mg = msg.media_group_id;
  await db().from("audit_logs").insert({ action: "tg.mirror_part", payload: { mg, msg: msg.message_id } });
  await new Promise((r) => setTimeout(r, ALBUM_WAIT_MS));
  const { data } = await db().from("audit_logs").select("payload").eq("action", "tg.mirror_part").eq("payload->>mg", mg).limit(20);
  const ids = [...new Set((data ?? []).map((d) => Number((d.payload as { msg?: number }).msg)).filter(Boolean))].sort((a, b) => a - b);
  if (ids[0] !== msg.message_id) return;
  if (await claimed(`${chat}:album:${mg}`)) return;
  const r = await tgCall(token, "copyMessages", { chat_id: chat, message_thread_id: to, from_chat_id: chat, message_ids: ids });
  if (!r.ok) console.error("tg mirror album", r.description);
}
