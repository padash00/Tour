"use server";

import { getCurrentPlayer, isAdmin, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cleanChatText } from "@/lib/chat";
import { isRateLimited } from "@/lib/data";
import { db } from "@/lib/supabase";
import { getT } from "@/lib/i18n/server";

type Result = { ok?: true; error?: string };

/** Отправить сообщение в общий чат: только вошедшие, не заблокированные и без запрета чата; не чаще раза в 3 с */
export async function sendChatMessage(body: string): Promise<Result> {
  const t = await getT();
  const player = await getCurrentPlayer();
  if (!player) return { error: t("Войдите через Steam, чтобы писать в чат") };
  if (player.is_banned) return { error: t("Ваш аккаунт заблокирован") };
  const { data: me } = await db().from("players").select("chat_muted").eq("id", player.id).maybeSingle();
  if (me?.chat_muted) return { error: t("Администратор запретил вам писать в чат") };
  const text = cleanChatText(body);
  if (!text) return { error: t("Пустое сообщение") };
  if (await isRateLimited(player.id, "chat.send", 3)) return { error: t("Не так быстро — подождите пару секунд") };
  const { error } = await db().from("chat_messages").insert({ player_id: player.id, body: text });
  if (error) return { error: t("Не удалось отправить — попробуйте ещё раз") };
  return { ok: true };
}

/** Админ: удалить сообщение (мягко — остаётся в базе для разбора) */
export async function deleteChatMessage(id: number): Promise<Result> {
  const admin = await requireAdmin("/chat");
  const { data: msg } = await db().from("chat_messages").select("player_id, body").eq("id", id).maybeSingle();
  if (!msg) return { error: "Сообщение не найдено" };
  await db().from("chat_messages").update({ deleted_at: new Date().toISOString(), deleted_by: admin.id }).eq("id", id);
  await audit(admin.id, "chat.delete", { type: "player", id: msg.player_id }, { body: msg.body.slice(0, 120) });
  return { ok: true };
}

/** Админ: запретить или разрешить игроку писать в чат; при запрете — убрать его сообщения за последний час */
export async function setChatMuted(playerId: string, muted: boolean): Promise<Result> {
  const admin = await requireAdmin("/chat");
  const { data: target } = await db().from("players").select("*").eq("id", playerId).maybeSingle();
  if (!target) return { error: "Игрок не найден" };
  if (isAdmin(target) && muted) return { error: "Нельзя запретить чат администратору" };
  await db().from("players").update({ chat_muted: muted }).eq("id", playerId);
  if (muted) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    await db().from("chat_messages").update({ deleted_at: new Date().toISOString(), deleted_by: admin.id }).eq("player_id", playerId).is("deleted_at", null).gte("created_at", since);
  }
  await audit(admin.id, muted ? "chat.mute" : "chat.unmute", { type: "player", id: playerId });
  return { ok: true };
}
