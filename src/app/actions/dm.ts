"use server";

import { getCurrentPlayer, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRateLimited, sniffImage } from "@/lib/data";
import { DM_IMAGE_BUCKET, DM_IMAGE_MAX, blockState, cleanDmText, isUuid, markThreadRead } from "@/lib/dm";
import { db } from "@/lib/supabase";
import { SITE_URL, telegramConfig, tgEscape, tgSend } from "@/lib/telegram";
import { ONLINE_MS } from "@/lib/presence";
import { supportPlayerId } from "@/lib/support";
import { getT } from "@/lib/i18n/server";

type Result = { ok?: true; id?: number; error?: string };

/** Telegram-оповещение о личном сообщении: только если получатель не на сайте и не чаще раза в 10 минут от одного собеседника */
const DM_TG_EVERY_MS = 10 * 60_000;
const tgSent: Map<string, number> = ((globalThis as { __f16DmTg?: Map<string, number> }).__f16DmTg ??= new Map());

async function telegramPing(to: { id: string; last_seen_at: string | null }, fromNick: string, fromId: string, body: string) {
  // поддержка: администратору — всегда (раз в 2 минуты от одного игрока) и с текстом вопроса
  const support = to.id === (await supportPlayerId());
  if (!support && to.last_seen_at && Date.now() - new Date(to.last_seen_at).getTime() < ONLINE_MS) return;
  const key = `${fromId}>${to.id}`;
  if (Date.now() - (tgSent.get(key) ?? 0) < (support ? 2 * 60_000 : DM_TG_EVERY_MS)) return;
  const { data: prof } = await db().from("player_profiles").select("telegram_chat_id").eq("player_id", to.id).maybeSingle();
  if (!prof?.telegram_chat_id) return;
  const cfg = await telegramConfig();
  if (!cfg.token) return;
  tgSent.set(key, Date.now());
  const html = support ? `🆘 <b>Поддержка</b> — ${tgEscape(fromNick)}:
${tgEscape(body.slice(0, 500))}` : `✉️ Новое личное сообщение от <b>${tgEscape(fromNick)}</b>`;
  await tgSend(cfg.token, prof.telegram_chat_id, html, { text: support ? "Ответить" : "Открыть", url: `${SITE_URL}/messages?with=${fromId}` }).catch(() => {});
}

/** Общие проверки перед отправкой: вход, бан, получатель, запрет писать, блокировки, частота */
async function prepareSend(toId: string) {
  const t = await getT();
  const me = await getCurrentPlayer();
  if (!me) return { error: t("Войдите через Steam, чтобы писать сообщения") };
  if (me.is_banned) return { error: t("Ваш аккаунт заблокирован") };
  if (!isUuid(toId) || toId === me.id) return { error: t("Получатель не найден") };
  const [{ data: to }, { data: mine }] = await Promise.all([
    db().from("players").select("id, last_seen_at, is_banned").eq("id", toId).maybeSingle(),
    db().from("players").select("chat_muted").eq("id", me.id).maybeSingle(),
  ]);
  if (!to) return { error: t("Получатель не найден") };
  if (mine?.chat_muted) return { error: t("Администратор запретил вам писать сообщения") };
  const blocks = await blockState(me.id, toId);
  if (blocks.iBlocked) return { error: t("Вы заблокировали этого игрока — разблокируйте, чтобы написать") };
  if (blocks.blockedMe) return { error: t("Игрок ограничил сообщения от вас") };
  if (await isRateLimited(me.id, "dm.send", 1)) return { error: t("Не так быстро") };
  return { t, me, to };
}

export async function sendDirectMessage(toId: string, body: string): Promise<Result> {
  const text = cleanDmText(body);
  if (!text) return { error: (await getT())("Пустое сообщение") };
  const p = await prepareSend(toId);
  if ("error" in p) return { error: p.error };
  const { t, me, to } = p;
  const { data, error } = await db().from("direct_messages").insert({ sender_id: me.id, recipient_id: toId, body: text }).select("id").single();
  if (error || !data) return { error: t("Не удалось отправить — попробуйте ещё раз") };
  // ответил — значит прочитал входящие от этого собеседника
  await markThreadRead(me.id, toId);
  await telegramPing(to, me.nickname, me.id, text);
  return { ok: true, id: data.id };
}

/** Картинка в личном сообщении (FormData: to, file, body — подпись, необязательно). Тип файла — по содержимому. */
export async function sendDirectImage(form: FormData): Promise<Result> {
  const toId = String(form.get("to") ?? "");
  const file = form.get("file");
  const text = cleanDmText(form.get("body"));
  const t = await getT();
  if (!(file instanceof File) || file.size === 0) return { error: t("Выберите картинку") };
  if (file.size > DM_IMAGE_MAX) return { error: t("Картинка — не больше 3 МБ") };
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: t("Картинка — PNG, JPG или WEBP") };
  const p = await prepareSend(toId);
  if ("error" in p) return { error: p.error };
  const { me, to } = p;
  const path = `${me.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
  const up = await db().storage.from(DM_IMAGE_BUCKET).upload(path, bytes, { contentType: type });
  if (up.error) return { error: t("Не удалось загрузить картинку — попробуйте ещё раз") };
  const { data, error } = await db().from("direct_messages").insert({ sender_id: me.id, recipient_id: toId, body: text, image_path: path }).select("id").single();
  if (error || !data) {
    await db().storage.from(DM_IMAGE_BUCKET).remove([path]);
    return { error: t("Не удалось отправить — попробуйте ещё раз") };
  }
  await markThreadRead(me.id, toId);
  await telegramPing(to, me.nickname, me.id, text ? `📷 ${text}` : "📷 Фото");
  return { ok: true, id: data.id };
}

export async function markDmRead(otherId: string): Promise<Result> {
  const t = await getT();
  const me = await getCurrentPlayer();
  if (!me || !isUuid(otherId)) return { error: t("Нет доступа") };
  await markThreadRead(me.id, otherId);
  return { ok: true };
}

export async function setDmBlock(otherId: string, block: boolean): Promise<Result> {
  const t = await getT();
  const me = await getCurrentPlayer();
  if (!me || !isUuid(otherId) || otherId === me.id) return { error: t("Нет доступа") };
  if (block) await db().from("dm_blocks").upsert({ blocker_id: me.id, blocked_id: otherId });
  else await db().from("dm_blocks").delete().eq("blocker_id", me.id).eq("blocked_id", otherId);
  return { ok: true };
}

/** Жалоба на сообщение: админы получают уведомление и могут открыть переписку */
export async function reportDm(messageId: number, reason: string): Promise<Result> {
  const t = await getT();
  const me = await getCurrentPlayer();
  if (!me) return { error: t("Нет доступа") };
  const { data: msg } = await db().from("direct_messages").select("id, sender_id, recipient_id").eq("id", messageId).maybeSingle();
  if (!msg || msg.recipient_id !== me.id) return { error: t("Сообщение не найдено") };
  if (await isRateLimited(me.id, "dm.report", 30)) return { error: t("Жалоба уже отправлена — подождите немного") };
  await db().from("dm_reports").insert({ reporter_id: me.id, reported_id: msg.sender_id, message_id: msg.id, reason: cleanDmText(reason).slice(0, 300) || null });
  const { notify } = await import("@/lib/audit");
  const { data: admins } = await db().from("players").select("id").eq("is_admin", true);
  await notify((admins ?? []).map((a) => a.id), "Жалоба на личное сообщение", `${me.nickname} пожаловался на сообщение`, "/admin/messages");
  await audit(me.id, "dm.report", { type: "player", id: msg.sender_id }, { message: msg.id });
  return { ok: true };
}

/** Админ: закрыть жалобу */
export async function resolveDmReport(id: number): Promise<Result> {
  const admin = await requireAdmin("/admin/messages");
  await db().from("dm_reports").update({ resolved_at: new Date().toISOString(), resolved_by: admin.id }).eq("id", id);
  await audit(admin.id, "dm.report_resolve", undefined, { report: id });
  return { ok: true };
}
