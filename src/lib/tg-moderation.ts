import "server-only";
import { after } from "next/server";
import { audit } from "./audit";
import { db } from "./supabase";
import { SITE_URL, tgCall, tgEscape } from "./telegram";
import { findViolation, formatDuration, parseDuration, punishmentFor, type Violation } from "./tg-moderation-core";

/**
 * Модерация общего Telegram-чата игроков (бот — администратор группы).
 *  - мат, оскорбления, чужие ссылки и пересылки из каналов: сообщение удаляется, предупреждение;
 *    лестница: 1–2 — предупреждение, 3 — мут 1 ч, 4 — мут 24 ч, 5 — бан (за 30 дней);
 *  - флуд: больше 5 сообщений за 10 секунд — мут на 10 минут;
 *  - новички: «Я не бот» — до нажатия писать нельзя;
 *  - команды админа ответом на сообщение: /warn, /unwarn, /mute 1h, /unmute, /ban, /unban, /warns.
 * Админов группы бот не трогает. Журнал — audit_logs (tg.*), виден в пульте → Telegram.
 */

export type TgUser = { id: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string };
export type TgMessage = {
  message_id: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string };
  from?: TgUser;
  sender_chat?: { id: number; type: string; title?: string };
  reply_to_message?: TgMessage;
  new_chat_members?: TgUser[];
  forward_origin?: { type: string; chat?: { type: string } };
  forward_from_chat?: { type: string };
};
export type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };

const WARN_DAYS = 30;
const NOTICE_TTL_MS = 60_000;

const nameOf = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? `@${u.username}` : `id${u.id}`);
const mention = (u: TgUser) => `<a href="tg://user?id=${u.id}">${tgEscape(nameOf(u))}</a>`;

// ── права участника

const adminCache = new Map<string, { admin: boolean; at: number }>();
async function isChatAdmin(token: string, chatId: number, userId: number) {
  const key = `${chatId}:${userId}`;
  const hit = adminCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.admin;
  const r = await tgCall<{ status: string }>(token, "getChatMember", { chat_id: chatId, user_id: userId });
  const admin = !!r.ok && (r.result?.status === "creator" || r.result?.status === "administrator");
  adminCache.set(key, { admin, at: Date.now() });
  return admin;
}

const MUTED = {
  can_send_messages: false, can_send_audios: false, can_send_documents: false, can_send_photos: false, can_send_videos: false,
  can_send_video_notes: false, can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false,
};

async function mute(token: string, chatId: number, userId: number, seconds: number) {
  return tgCall(token, "restrictChatMember", { chat_id: chatId, user_id: userId, permissions: MUTED, use_independent_chat_permissions: true, until_date: Math.floor(Date.now() / 1000) + seconds });
}

/** Вернуть участнику права группы по умолчанию */
async function unmute(token: string, chatId: number, userId: number) {
  const chat = await tgCall<{ permissions?: Record<string, boolean> }>(token, "getChat", { chat_id: chatId });
  const permissions = chat.result?.permissions ?? Object.fromEntries(Object.keys(MUTED).map((k) => [k, true]));
  return tgCall(token, "restrictChatMember", { chat_id: chatId, user_id: userId, permissions, use_independent_chat_permissions: true });
}

// ── сообщения бота в чате

async function notice(token: string, msg: TgMessage, html: string, ttl = NOTICE_TTL_MS, keyboard?: unknown) {
  const r = await tgCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: msg.chat.id,
    ...(msg.is_topic_message && msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  const id = r.result?.message_id;
  if (id && ttl > 0) after(() => new Promise<void>((res) => setTimeout(() => void tgCall(token, "deleteMessage", { chat_id: msg.chat.id, message_id: id }).finally(res), ttl)));
  return id;
}

const del = (token: string, chatId: number, messageId: number) => tgCall(token, "deleteMessage", { chat_id: chatId, message_id: messageId });

// ── предупреждения (audit_logs: tg.warn / tg.unwarn с payload.user)

async function warnCount(userId: number) {
  const since = new Date(Date.now() - WARN_DAYS * 86_400_000).toISOString();
  const { data } = await db().from("audit_logs").select("action").in("action", ["tg.warn", "tg.unwarn"]).eq("payload->>user", String(userId)).gte("created_at", since);
  const list = data ?? [];
  return Math.max(0, list.filter((x) => x.action === "tg.warn").length - list.filter((x) => x.action === "tg.unwarn").length);
}

/** Предупреждение + наказание по лестнице; сообщение в чат */
async function warn(token: string, msg: TgMessage, target: TgUser, reason: string, text: string, by: string) {
  await audit(null, "tg.warn", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason, text: text.slice(0, 300), by });
  const n = await warnCount(target.id);
  const p = punishmentFor(n);
  if (p.action === "mute") await mute(token, msg.chat.id, target.id, p.seconds!);
  if (p.action === "ban") await tgCall(token, "banChatMember", { chat_id: msg.chat.id, user_id: target.id });
  if (p.action !== "warn") await audit(null, p.action === "ban" ? "tg.ban" : "tg.mute", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason: `${n}-е предупреждение`, seconds: p.seconds ?? null, by });
  const next = n < 5 ? punishmentFor(n + 1).label : null;
  await notice(
    token,
    msg,
    p.action === "warn"
      ? `⚠️ ${mention(target)}, предупреждение ${n}/5: ${tgEscape(reason)}.${next ? `\nСледующее нарушение — ${next}.` : ""}`
      : p.action === "mute"
        ? `🔇 ${mention(target)} — ${p.label} (${n}-е предупреждение: ${tgEscape(reason)}).`
        : `⛔ ${mention(target)} заблокирован в чате (5-е предупреждение: ${tgEscape(reason)}).`,
  );
}

// ── флуд: в памяти процесса

const flood = new Map<number, number[]>();
function isFlood(userId: number) {
  const now = Date.now();
  const list = (flood.get(userId) ?? []).filter((t) => now - t < 10_000);
  list.push(now);
  flood.set(userId, list);
  if (flood.size > 5000) flood.clear();
  return list.length > 5;
}

// ── проверка новичков

let captchaOk: { ok: boolean; at: number } | null = null;
/** Кнопка «Я не бот» работает, только если вебхук получает callback_query — иначе новичок застрянет без права писать */
async function captchaEnabled(token: string) {
  if (captchaOk && Date.now() - captchaOk.at < 10 * 60_000) return captchaOk.ok;
  const r = await tgCall<{ allowed_updates?: string[] }>(token, "getWebhookInfo", {});
  captchaOk = { ok: !!r.result?.allowed_updates?.includes("callback_query"), at: Date.now() };
  return captchaOk.ok;
}

async function onNewMembers(token: string, msg: TgMessage) {
  if (!(await captchaEnabled(token))) return;
  for (const u of msg.new_chat_members ?? []) {
    if (u.is_bot) continue;
    await tgCall(token, "restrictChatMember", { chat_id: msg.chat.id, user_id: u.id, permissions: MUTED, use_independent_chat_permissions: true });
    await notice(
      token,
      msg,
      `👋 ${mention(u)}, добро пожаловать в чат игроков F16 Arena!\nНажмите кнопку, чтобы писать в чат. Правила: без мата, оскорблений и рекламы.`,
      5 * 60_000,
      { inline_keyboard: [[{ text: "✅ Я не бот", callback_data: `cap:${u.id}` }]] },
    );
  }
}

export async function onCallback(token: string, groupId: number, cb: TgCallback) {
  const data = cb.data ?? "";
  if (!data.startsWith("cap:") || cb.message?.chat.id !== groupId) {
    await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  const uid = Number(data.slice(4));
  if (uid !== cb.from.id) {
    await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: "Эта кнопка — для нового участника", show_alert: false });
    return;
  }
  await unmute(token, groupId, uid);
  await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: "Готово, можно писать! Удачной игры 🎯" });
  if (cb.message) await del(token, groupId, cb.message.message_id);
}

// ── команды админа

async function onCommand(token: string, msg: TgMessage, text: string) {
  const [rawCmd, arg] = text.trim().split(/\s+/, 2);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const known = ["/warn", "/unwarn", "/mute", "/unmute", "/ban", "/unban", "/warns"];
  if (!known.includes(cmd)) return false;
  await del(token, msg.chat.id, msg.message_id);
  const target = msg.reply_to_message?.from;
  const by = msg.from ? nameOf(msg.from) : "админ";
  if (!target || target.is_bot) {
    await notice(token, msg, `Команду ${cmd} нужно отправить <b>ответом</b> на сообщение нарушителя.`, 15_000);
    return true;
  }
  if (cmd !== "/warns" && cmd !== "/unban" && cmd !== "/unmute" && (await isChatAdmin(token, msg.chat.id, target.id))) {
    await notice(token, msg, "Это администратор — к нему команды не применяются.", 15_000);
    return true;
  }
  const original = msg.reply_to_message!;
  const origText = original.text ?? original.caption ?? "";
  switch (cmd) {
    case "/warn":
      await del(token, msg.chat.id, original.message_id);
      await warn(token, msg, target, text.slice(rawCmd.length).trim() || "нарушение правил чата", origText, by);
      break;
    case "/unwarn":
      await audit(null, "tg.unwarn", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, by });
      await notice(token, msg, `✅ ${mention(target)}: одно предупреждение снято. Осталось: ${await warnCount(target.id)}.`);
      break;
    case "/warns":
      await notice(token, msg, `${mention(target)}: предупреждений за ${WARN_DAYS} дней — ${await warnCount(target.id)}/5.`);
      break;
    case "/mute": {
      const sec = parseDuration(arg) ?? 3600;
      await mute(token, msg.chat.id, target.id, sec);
      await audit(null, "tg.mute", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason: "команда админа", seconds: sec, by });
      await notice(token, msg, `🔇 ${mention(target)} — мут на ${formatDuration(sec)}.`);
      break;
    }
    case "/unmute":
      await unmute(token, msg.chat.id, target.id);
      await audit(null, "tg.unmute", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, by });
      await notice(token, msg, `🔊 ${mention(target)} снова может писать.`);
      break;
    case "/ban":
      await del(token, msg.chat.id, original.message_id);
      await tgCall(token, "banChatMember", { chat_id: msg.chat.id, user_id: target.id });
      await audit(null, "tg.ban", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason: "команда админа", text: origText.slice(0, 300), by });
      await notice(token, msg, `⛔ ${mention(target)} заблокирован в чате.`);
      break;
    case "/unban":
      await tgCall(token, "unbanChatMember", { chat_id: msg.chat.id, user_id: target.id, only_if_banned: true });
      await audit(null, "tg.unban", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, by });
      await notice(token, msg, `✅ ${mention(target)} разблокирован — может вернуться в чат.`);
      break;
  }
  return true;
}

// ── главное

/** Сообщение (новое или изменённое) в общем чате. Ничего не бросает наружу. */
export async function moderateGroupMessage(token: string, msg: TgMessage, edited = false) {
  if (msg.new_chat_members?.length) return onNewMembers(token, msg);
  const from = msg.from;
  if (!from || from.is_bot) return;
  // анонимный админ пишет от имени группы
  if (msg.sender_chat?.id === msg.chat.id) return;
  const text = msg.text ?? msg.caption ?? "";
  const admin = await isChatAdmin(token, msg.chat.id, from.id);
  if (admin) {
    if (!edited && text.startsWith("/")) await onCommand(token, msg, text);
    return;
  }

  if (!edited && isFlood(from.id)) {
    await del(token, msg.chat.id, msg.message_id);
    // мутим один раз на волну флуда
    if ((flood.get(from.id)?.length ?? 0) === 6) {
      await mute(token, msg.chat.id, from.id, 600);
      await audit(null, "tg.mute", undefined, { user: String(from.id), name: nameOf(from), username: from.username ?? null, reason: "флуд", seconds: 600, by: "бот" });
      await notice(token, msg, `🔇 ${mention(from)} — мут на 10 минут за флуд.`);
    }
    return;
  }

  // пересылка из чужого канала или сообщение от имени канала — реклама
  const fromChannel = msg.sender_chat?.type === "channel" || msg.forward_origin?.type === "channel" || msg.forward_from_chat?.type === "channel";
  const v: Violation | null = findViolation(text) ?? (fromChannel ? { kind: "link", reason: "реклама и пересылки из каналов запрещены", match: "канал" } : null);
  if (!v) return;
  await del(token, msg.chat.id, msg.message_id);
  await warn(token, msg, from, v.reason, text, "бот");
}

/** Подсказка в личке боту для админа: как модерировать */
export const MODERATION_HELP =
  `Модерация чата игроков:\n• мат, оскорбления, реклама — сообщение удаляется, предупреждение (3-е — мут 1 ч, 4-е — 24 ч, 5-е — бан)\n• флуд — мут 10 минут\n• новички нажимают «Я не бот»\n\nКоманды ответом на сообщение: /warn [причина], /unwarn, /warns, /mute 1h, /unmute, /ban, /unban\nЖурнал — ${SITE_URL}/admin/telegram`;
