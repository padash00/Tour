import "server-only";
import { after } from "next/server";
import { audit } from "./audit";
import { isAdmin } from "./auth";
import type { Player } from "./types";
import { db } from "./supabase";
import { SITE_URL, setAppSettings, tgCall, tgEscape } from "./telegram";
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
  left_chat_member?: TgUser;
  forward_origin?: { type: string; chat?: { type: string } };
  forward_from_chat?: { type: string };
  photo?: unknown[];
  video?: unknown;
  document?: { mime_type?: string };
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
async function warn(token: string, msg: TgMessage, target: TgUser, reason: string, text: string, by: string, match?: string) {
  await audit(null, "tg.warn", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason, match: match ?? null, text: text.slice(0, 1500), by });
  const n = await warnCount(target.id);
  const p = punishmentFor(n);
  if (p.action === "mute") await mute(token, msg.chat.id, target.id, p.seconds!);
  if (p.action === "ban") await tgCall(token, "banChatMember", { chat_id: msg.chat.id, user_id: target.id });
  if (p.action !== "warn") await audit(null, p.action === "ban" ? "tg.ban" : "tg.mute", undefined, { user: String(target.id), name: nameOf(target), username: target.username ?? null, reason: `${n}-е предупреждение`, seconds: p.seconds ?? null, by });
  await tellAdmins(token, target, `${p.label} (${n}/5): ${reason}`, text, match);
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
    await audit(null, "tg.captcha", undefined, { user: String(u.id), name: nameOf(u), username: u.username ?? null, by: "бот" });
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
  if (data.startsWith("pardon:")) {
    if (!(await isSiteAdmin(cb.from.id))) {
      await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: "Только для администраторов" });
      return;
    }
    const uid = Number(data.slice(7));
    const n = await warnCount(uid);
    for (let i = 0; i < Math.max(1, n); i++) await audit(null, "tg.unwarn", undefined, { user: String(uid), by: nameOf(cb.from), reason: "снято из лички бота" });
    await tgCall(token, "unbanChatMember", { chat_id: groupId, user_id: uid, only_if_banned: true });
    await unmute(token, groupId, uid);
    await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: "Наказание снято" });
    if (cb.message) await tgCall(token, "editMessageReplyMarkup", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [[{ text: "✅ Снято", callback_data: "noop" }]] } });
    return;
  }
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

// ── уведомление админам сайта (с подтверждённым Telegram) о каждом наказании — с кнопкой отмены

async function siteAdminChats(): Promise<number[]> {
  const { data } = await db().from("player_profiles").select("telegram_chat_id, player:players!player_profiles_player_id_fkey(*)").not("telegram_chat_id", "is", null);
  return ((data ?? []) as unknown as { telegram_chat_id: number; player: Player | null }[]).filter((r) => isAdmin(r.player)).map((r) => r.telegram_chat_id);
}

async function isSiteAdmin(tgUserId: number) {
  return (await siteAdminChats()).includes(tgUserId);
}

async function tellAdmins(token: string, target: TgUser, what: string, text: string, match?: string) {
  const chats = await siteAdminChats().catch(() => []);
  const html = `🛡 <b>Модерация чата</b>
${mention(target)}${target.username ? ` (@${tgEscape(target.username)})` : ""} — ${tgEscape(what)}${match ? `
Слово: «${tgEscape(match)}»` : ""}${text ? `

<i>${tgEscape(text.slice(0, 900))}</i>` : ""}`;
  await Promise.allSettled(chats.map((c) => tgCall(token, "sendMessage", { chat_id: c, text: html, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "↩️ Снять наказание", callback_data: `pardon:${target.id}` }]] } })));
}

// ── команды админа

async function onCommand(token: string, msg: TgMessage, text: string) {
  const [rawCmd, arg] = text.trim().split(/\s+/, 2);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const known = ["/warn", "/unwarn", "/mute", "/unmute", "/ban", "/unban", "/warns"];
  if (cmd === "/market") {
    await del(token, msg.chat.id, msg.message_id);
    if (arg === "off") {
      await setAppSettings({ TELEGRAM_MARKET_THREAD: "" });
      await notice(token, msg, "Тема «Купля-продажа» отключена — здесь снова обычный чат.", 20_000);
      return true;
    }
    if (!msg.is_topic_message || !msg.message_thread_id) {
      await notice(token, msg, "Отправьте /market внутри темы «Купля-продажа».", 20_000);
      return true;
    }
    await setAppSettings({ TELEGRAM_MARKET_THREAD: String(msg.message_thread_id) });
    const id = await notice(token, msg, MARKET_RULES, 0);
    if (id) await tgCall(token, "pinChatMessage", { chat_id: msg.chat.id, message_id: id, disable_notification: true });
    return true;
  }
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
export async function moderateGroupMessage(token: string, msg: TgMessage, edited = false, marketThread: number | null = null) {
  // служебные «X теперь в группе» / «X покинул группу» — убираем, чтобы не засоряли чат
  if (msg.new_chat_members?.length || msg.left_chat_member) {
    await del(token, msg.chat.id, msg.message_id);
    if (msg.new_chat_members?.length) await onNewMembers(token, msg);
    return;
  }
  const text = msg.text ?? msg.caption ?? "";
  // анонимный админ пишет от имени группы (from — служебный бот) — команды выполняем, остальное не трогаем
  if (msg.sender_chat?.id === msg.chat.id) {
    if (!edited && text.startsWith("/")) await onCommand(token, msg, text);
    return;
  }
  const from = msg.from;
  if (!from || from.is_bot) return;
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

  // General — только для бота и админов: сообщения игроков удаляем и подсказываем, куда писать
  if (!msg.is_topic_message && !edited) {
    await del(token, msg.chat.id, msg.message_id);
    await notice(token, msg, `${mention(from)}, в General писать нельзя — выберите тему: 💬 Общение, 🔍 Поиск тиммейтов, 🏆 Турниры, 🛠 Помощь.`, 15_000);
    return;
  }

  // «Купля-продажа»: только объявления по шаблону, без обсуждений
  const inMarket = !!marketThread && msg.is_topic_message === true && msg.message_thread_id === marketThread;
  if (inMarket && !edited) {
    const problem = marketProblem(msg, text);
    if (problem) {
      await del(token, msg.chat.id, msg.message_id);
      await notice(token, msg, `${mention(from)}, ${problem}\n\n${MARKET_TEMPLATE}`, 30_000);
      return;
    }
    if (tooManyAds(from.id)) {
      await del(token, msg.chat.id, msg.message_id);
      await notice(token, msg, `${mention(from)}, не больше ${MARKET_PER_DAY} объявлений в сутки. Обновите старое объявление — отредактируйте его.`, 30_000);
      return;
    }
  }

  // пересылка из чужого канала или сообщение от имени канала — реклама
  const fromChannel = msg.sender_chat?.type === "channel" || msg.forward_origin?.type === "channel" || msg.forward_from_chat?.type === "channel";
  let v: Violation | null = findViolation(text) ?? (fromChannel ? { kind: "link", reason: "реклама и пересылки из каналов запрещены", match: "канал" } : null);
  // в «Купля-продажа» ссылки на маркеты и трейд разрешены — нельзя только чужие Telegram-каналы
  if (v && inMarket && v.kind === "link" && !/t\.me|telegram\.me/i.test(v.match)) v = null;
  if (!v) return;
  await del(token, msg.chat.id, msg.message_id);
  await warn(token, msg, from, v.reason, text, "бот", v.match);
}

// ── «Купля-продажа»

const MARKET_PER_DAY = 3;
const MARKET_TAG = /^\s*#(продаю|сатамын|куплю|аламын|обмен)(?![\p{L}\d_])/iu;
const MARKET_TEMPLATE =
  "<b>Шаблон объявления:</b>\n#продаю — фото + что продаёте + цена\n#куплю — что ищете + бюджет\n#обмен — фото + что меняете\n\nВопросы продавцу — в личку (нажмите на его имя).";
export const MARKET_RULES = `🛒 <b>Купля-продажа</b>\nЗдесь только объявления, без обсуждений — бот удаляет всё остальное.\n\n${MARKET_TEMPLATE}\n\nНе больше ${MARKET_PER_DAY} объявлений в сутки. Мат и чужие Telegram-каналы запрещены.`;

/** Что не так с объявлением; null — всё по шаблону */
function marketProblem(msg: TgMessage, text: string): string | null {
  const tag = MARKET_TAG.exec(text)?.[1]?.toLowerCase();
  if (!tag) return msg.reply_to_message && msg.reply_to_message.message_id !== msg.message_thread_id ? "обсуждения здесь нельзя — пишите продавцу в личку." : "объявление должно начинаться с #продаю, #куплю или #обмен.";
  const hasMedia = !!msg.photo?.length || !!msg.video || !!msg.document?.mime_type?.startsWith("image/");
  if ((tag === "продаю" || tag === "сатамын" || tag === "обмен") && !hasMedia) return "к объявлению #продаю и #обмен нужно фото.";
  if (text.replace(MARKET_TAG, "").trim().length < 5) return "добавьте описание и цену.";
  return null;
}

const ads = new Map<number, number[]>();
function tooManyAds(userId: number) {
  const now = Date.now();
  const list = (ads.get(userId) ?? []).filter((t) => now - t < 86_400_000);
  if (list.length >= MARKET_PER_DAY) return true;
  list.push(now);
  ads.set(userId, list);
  return false;
}

/** Подсказка в личке боту для админа: как модерировать */
export const MODERATION_HELP =
  `Модерация чата игроков:\n• мат, оскорбления, реклама — сообщение удаляется, предупреждение (3-е — мут 1 ч, 4-е — 24 ч, 5-е — бан)\n• флуд — мут 10 минут\n• новички нажимают «Я не бот»\n\nКоманды ответом на сообщение: /warn [причина], /unwarn, /warns, /mute 1h, /unmute, /ban, /unban\n/market — в теме «Купля-продажа»: бот пускает туда только объявления #продаю / #куплю / #обмен (/market off — выключить)\nЖурнал — ${SITE_URL}/admin/telegram`;

/** Амнистия: всем, кого бот наказывал, — разбан, снятие мута и обнуление предупреждений */
export async function pardonAll(token: string, groupId: number, by: string) {
  const { data } = await db().from("audit_logs").select("action, payload").in("action", ["tg.warn", "tg.mute", "tg.ban", "tg.captcha"]);
  const users = new Map<string, { name: string; username: string | null }>();
  for (const l of data ?? []) {
    const p = (l.payload ?? {}) as { user?: string; name?: string; username?: string | null };
    if (p.user) users.set(p.user, { name: p.name ?? p.user, username: p.username ?? null });
  }
  let done = 0;
  for (const [user, u] of users) {
    const id = Number(user);
    await tgCall(token, "unbanChatMember", { chat_id: groupId, user_id: id, only_if_banned: true });
    await unmute(token, groupId, id);
    const n = await warnCount(id);
    for (let i = 0; i < n; i++) await audit(null, "tg.unwarn", undefined, { user, name: u.name, username: u.username, by, reason: "амнистия" });
    done++;
  }
  return done;
}

export type PardonOp = "unwarn" | "unmute" | "unban" | "all";

/** Снять наказание одному участнику из пульта */
export async function pardonUser(token: string, groupId: number, uid: number, op: PardonOp, by: string, name?: string) {
  if (op === "unwarn") await audit(null, "tg.unwarn", undefined, { user: String(uid), name: name ?? null, by, reason: "снято в пульте" });
  if (op === "all") {
    const n = await warnCount(uid);
    for (let i = 0; i < n; i++) await audit(null, "tg.unwarn", undefined, { user: String(uid), name: name ?? null, by, reason: "снято в пульте" });
  }
  if (op === "unban" || op === "all") {
    await tgCall(token, "unbanChatMember", { chat_id: groupId, user_id: uid, only_if_banned: true });
    await audit(null, "tg.unban", undefined, { user: String(uid), name: name ?? null, by });
  }
  if (op === "unmute" || op === "unban" || op === "all") {
    await unmute(token, groupId, uid);
    if (op === "unmute") await audit(null, "tg.unmute", undefined, { user: String(uid), name: name ?? null, by });
  }
}
