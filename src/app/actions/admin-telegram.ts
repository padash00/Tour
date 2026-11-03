"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/supabase";
import { SITE_URL, TG_ALLOWED_UPDATES, setAppSettings, telegramConfig, telegramGroup, tgCall, tgEscape, tgSend } from "@/lib/telegram";
import type { ActionResult } from "@/components/forms";

/** Подключить бота: секрет вебхука (если нет) и setWebhook на сайт */
export async function adminTelegramConnect(): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const cfg = await telegramConfig();
  if (!cfg.token) return { error: "Сначала впишите токен бота в «Настройки»" };
  let secret = cfg.secret;
  if (!secret) {
    secret = randomBytes(24).toString("hex");
    await db().from("app_settings").upsert({ key: "TELEGRAM_WEBHOOK_SECRET", value: secret });
  }
  const me = await tgCall<{ username: string }>(cfg.token, "getMe", {});
  if (!me.ok) return { error: `Telegram не принял токен: ${me.description ?? "ошибка"}` };
  if (me.result?.username) await db().from("app_settings").upsert({ key: "TELEGRAM_BOT_USERNAME", value: me.result.username });
  const r = await tgCall(cfg.token, "setWebhook", {
    url: `${SITE_URL}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: TG_ALLOWED_UPDATES,
    drop_pending_updates: false,
  });
  if (!r.ok) return { error: `Не удалось подключить: ${r.description ?? "ошибка"}` };
  await audit(admin.id, "telegram.connect", undefined, { bot: me.result?.username });
  return { success: `Бот @${me.result?.username} подключён` };
}

/** Рассылка: всем подтвердившим Telegram или участникам турнира (одобренные заявки — весь состав) */
export async function adminTelegramBroadcast(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const text = String(formData.get("text") ?? "").trim();
  const audience = String(formData.get("audience") ?? "all");
  if (text.length < 3) return { error: "Введите текст сообщения" };
  if (text.length > 3500) return { error: "Слишком длинно — до 3500 символов" };
  const cfg = await telegramConfig();
  if (!cfg.token) return { error: "Бот не подключён" };

  let playerIds: string[] | null = null;
  if (audience.startsWith("t:")) {
    const tournamentId = audience.slice(2);
    const { data: regs } = await db()
      .from("tournament_registrations")
      .select("id, status, team_id")
      .eq("tournament_id", tournamentId)
      .in("status", ["pending", "approved"]);
    const teamIds = (regs ?? []).map((r) => r.team_id);
    if (!teamIds.length) return { error: "В этом турнире нет заявок" };
    const { data: members } = await db().from("team_members").select("player_id").in("team_id", teamIds).is("left_at", null);
    playerIds = [...new Set((members ?? []).map((m) => m.player_id))];
  }
  let q = db().from("player_profiles").select("telegram_chat_id").not("telegram_chat_id", "is", null);
  if (playerIds) q = q.in("player_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const chats = (data ?? []).map((r) => r.telegram_chat_id).filter((c): c is number => typeof c === "number");
  if (!chats.length) return { error: "Некому отправить — никто из выбранных ещё не подтвердил Telegram" };

  const ok = await sendBatched(cfg.token, chats, `📣 ${tgEscape(text)}`, { text: "Открыть сайт", url: SITE_URL });
  await audit(admin.id, "telegram.broadcast", undefined, { audience, sent: ok, total: chats.length, text: text.slice(0, 200) });
  return { success: `Отправлено: ${ok} из ${chats.length}` };
}

/** Включить / выключить модерацию общего чата ботом */
export async function adminTelegramModeration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const on = formData.get("on") === "1";
  await setAppSettings({ TELEGRAM_MODERATION: on ? "1" : "" });
  await audit(admin.id, "telegram.moderation", undefined, { on });
  return { success: on ? "Модерация чата включена" : "Модерация чата выключена — бот ничего не удаляет и никого не наказывает" };
}

/** Снять все наказания бота в общем чате: разбан, снятие мута, обнуление предупреждений */
export async function adminTelegramPardonAll(): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const cfg = await telegramConfig();
  const group = await telegramGroup();
  if (!cfg.token || !group.id) return { error: "Бот или группа не подключены" };
  const { pardonAll } = await import("@/lib/tg-moderation");
  const n = await pardonAll(cfg.token, group.id, admin.nickname);
  await audit(admin.id, "telegram.pardon_all", undefined, { users: n });
  return { success: n ? `Наказания сняты: ${n} чел. — разбан, снят мут, предупреждения обнулены` : "Наказанных нет" };
}

/** Снять наказание одному участнику общего чата: предупреждение, мут, бан или всё сразу */
export async function adminTelegramPardonUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const uid = Number(formData.get("user"));
  const op = String(formData.get("op")) as "unwarn" | "unmute" | "unban" | "all";
  const name = String(formData.get("name") ?? "");
  if (!Number.isFinite(uid) || !["unwarn", "unmute", "unban", "all"].includes(op)) return { error: "Неверные данные" };
  const cfg = await telegramConfig();
  const group = await telegramGroup();
  if (!cfg.token || !group.id) return { error: "Бот или группа не подключены" };
  const { pardonUser } = await import("@/lib/tg-moderation");
  await pardonUser(cfg.token, group.id, uid, op, admin.nickname, name);
  await audit(admin.id, "telegram.pardon_user", undefined, { user: String(uid), op });
  const label = { unwarn: "одно предупреждение снято", unmute: "мут снят", unban: "разбанен — может вернуться в чат", all: "все наказания сняты" }[op];
  return { success: `${name || uid}: ${label}` };
}

/** Показать окно «Вступите в Telegram-чат» всем ещё раз (кроме тех, кого бот видит в группе) */
export async function adminResetJoinRound(): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  await setAppSettings({ TELEGRAM_JOIN_ROUND: new Date().toISOString() });
  await audit(admin.id, "telegram.join_round", undefined, {});
  return { success: "Окно снова увидят все игроки, кроме тех, кто уже в группе (у кого подтверждён Telegram)" };
}

/** Напомнить всем, кто не вступил в общий чат: уведомление на сайте (+ Telegram тем, у кого он подтверждён) */
export async function adminRemindJoinChat(): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const { joinStats } = await import("@/lib/tg-chat-join");
  const { notify } = await import("@/lib/audit");
  const s = await joinStats();
  const members = new Set(s.memberIds);
  const targets = [...new Set([...s.notClicked.filter((id) => !members.has(id)), ...s.linkedNotMembers.map((x) => x.player_id)])];
  if (!targets.length) return { success: "Все уже вступили или нажали «Вступить» 🎉" };
  for (let i = 0; i < targets.length; i += 300) {
    await notify(targets.slice(i, i + 300), "Вступите в Telegram-чат игроков F16 Arena", "Объявления турниров, расписание, поиск тиммейтов и ответы на вопросы — всё в общем чате. Нажмите, чтобы вступить.", "/tg");
  }
  await audit(admin.id, "telegram.remind_join", undefined, { players: targets.length });
  return { success: `Напоминание отправлено: ${targets.length} игрокам (на сайте; у кого подтверждён Telegram — ещё и от бота)` };
}

/** Telegram: не больше ~30 сообщений в секунду — шлём пачками по 20 с паузой. Возвращает, сколько дошло */
async function sendBatched(token: string, chats: number[], html: string, button?: { text: string; url: string }) {
  let ok = 0;
  for (let i = 0; i < chats.length; i += 20) {
    const res = await Promise.allSettled(chats.slice(i, i + 20).map((c) => tgSend(token, c, html, button)));
    ok += res.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    if (i + 20 < chats.length) await new Promise((r) => setTimeout(r, 1100));
  }
  return ok;
}

/** Общий чат: новая ссылка-приглашение от бота (старая отзывается). closed — вступление по заявке, бот принимает игроков сайта */
export async function adminTelegramGroupLink(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const closed = formData.get("closed") === "on";
  const cfg = await telegramConfig();
  if (!cfg.token) return { error: "Бот не подключён" };
  const group = await telegramGroup();
  if (!group.id) return { error: "Группа ещё не подключена — добавьте бота в группу администратором" };
  const r = await tgCall<{ invite_link: string }>(cfg.token, "createChatInviteLink", { chat_id: group.id, name: "F16 Arena — сайт", creates_join_request: closed });
  if (!r.ok || !r.result?.invite_link) {
    return { error: `Telegram не дал создать ссылку: ${r.description ?? "ошибка"}. Проверьте, что бот — администратор группы с правом «Приглашать по ссылке».` };
  }
  if (group.invite && group.invite !== r.result.invite_link) await tgCall(cfg.token, "revokeChatInviteLink", { chat_id: group.id, invite_link: group.invite });
  await setAppSettings({ TELEGRAM_GROUP_INVITE: r.result.invite_link, TELEGRAM_GROUP_CLOSED: closed ? "1" : "" });
  await audit(admin.id, "telegram.group_link", undefined, { closed });
  return { success: closed ? "Ссылка создана: вступление по заявке, бот принимает игроков сайта" : "Ссылка создана: вступить может любой, у кого она есть" };
}

/** Пригласить в общий чат всех, кто подтвердил Telegram: личное сообщение от бота с кнопкой «Вступить» */
export async function adminTelegramInviteAll(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const note = String(formData.get("text") ?? "").trim().slice(0, 1500);
  const cfg = await telegramConfig();
  if (!cfg.token) return { error: "Бот не подключён" };
  const group = await telegramGroup();
  if (!group.invite) return { error: "Сначала создайте ссылку на чат" };
  const { data } = await db().from("player_profiles").select("telegram_chat_id").not("telegram_chat_id", "is", null);
  const chats = (data ?? []).map((r) => r.telegram_chat_id).filter((c): c is number => typeof c === "number");
  if (!chats.length) return { error: "Некому отправить — никто ещё не подтвердил Telegram" };
  const text = `💬 <b>Общий чат игроков F16 Arena</b>${group.title ? ` — «${tgEscape(group.title)}»` : ""}

${note ? tgEscape(note) : "Объявления турниров, поиск тиммейтов, лобби и общение — всё в одном чате. Заходите!"}`;
  const ok = await sendBatched(cfg.token, chats, text, { text: "Вступить в чат", url: group.invite });
  await audit(admin.id, "telegram.group_invite_all", undefined, { sent: ok, total: chats.length });
  return { success: `Приглашение отправлено: ${ok} из ${chats.length}` };
}

/** Пригласить в Telegram-чат ВСЕХ игроков сайта: уведомление на сайте (колокольчик) + личка от бота тем, кто подтвердил Telegram */
export async function adminChatInviteEveryone(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/telegram");
  const note = String(formData.get("text") ?? "").trim().slice(0, 1000);
  const group = await telegramGroup();
  const title = "Общий чат игроков F16 Arena в Telegram";
  const body = note || "Турниры, лобби, поиск тиммейтов и новости клуба — всё в одном чате. Заходите!";

  const { data: players } = await db().from("players").select("id").eq("is_banned", false);
  const ids = (players ?? []).map((p) => p.id);
  if (!ids.length) return { error: "Игроков нет" };
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await db().from("notifications").insert(ids.slice(i, i + 500).map((player_id) => ({ player_id, title, body, link: "/tg" })));
    if (error) return { error: `Уведомления на сайте: ${error.message}` };
  }

  let tg = 0;
  let tgTotal = 0;
  const cfg = await telegramConfig();
  if (cfg.token) {
    const { data } = await db().from("player_profiles").select("telegram_chat_id").not("telegram_chat_id", "is", null);
    const chats = (data ?? []).map((r) => r.telegram_chat_id).filter((c): c is number => typeof c === "number");
    tgTotal = chats.length;
    tg = await sendBatched(cfg.token, chats, `💬 <b>${tgEscape(title)}</b>

${tgEscape(body)}`, { text: "Вступить в чат", url: group.invite });
  }
  await audit(admin.id, "telegram.chat_invite_everyone", undefined, { site: ids.length, tg, tgTotal });
  return { success: `Уведомление на сайте: ${ids.length} игрокам · в Telegram: ${tg} из ${tgTotal}` };
}
