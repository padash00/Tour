import "server-only";
import { db } from "./supabase";

/*
 * Telegram-бот F16 Arena: подтверждение Telegram игрока (/start <токен>) и уведомления.
 * Токен, имя бота и секрет вебхука — в app_settings (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET).
 */

export const SITE_URL = "https://tournament.f16-arena.kz";

export async function telegramConfig() {
  const { data } = await db().from("app_settings").select("key, value").in("key", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"]);
  const m = new Map((data ?? []).map((r) => [r.key, String(r.value ?? "")]));
  return {
    token: m.get("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN || "",
    username: (m.get("TELEGRAM_BOT_USERNAME") || process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, ""),
    secret: m.get("TELEGRAM_WEBHOOK_SECRET") || "",
  };
}

export async function tgCall<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    return (await r.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : String(e) };
  }
}

/** Экранирование для parse_mode HTML */
export const tgEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function tgSend(token: string, chatId: number, html: string, button?: { text: string; url: string }) {
  return tgCall(token, "sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
  });
}

/** Дубль уведомлений сайта в Telegram тем, кто подтвердил Telegram. Ошибки глотаем — уведомление на сайте уже есть. */
export async function notifyTelegram(playerIds: string[], title: string, body?: string, link?: string) {
  if (playerIds.length === 0) return;
  try {
    const cfg = await telegramConfig();
    if (!cfg.token) return;
    const { data } = await db().from("player_profiles").select("telegram_chat_id").in("player_id", [...new Set(playerIds)]).not("telegram_chat_id", "is", null);
    const chats = (data ?? []).map((r) => r.telegram_chat_id).filter((c): c is number => typeof c === "number");
    if (!chats.length) return;
    const text = `🔔 <b>${tgEscape(title)}</b>${body ? `\n${tgEscape(body)}` : ""}`;
    const url = link ? (link.startsWith("http") ? link : `${SITE_URL}${link}`) : undefined;
    await Promise.allSettled(chats.map((c) => tgSend(cfg.token, c, text, url ? { text: "Открыть на сайте", url } : undefined)));
  } catch (e) {
    console.error("telegram notify failed", e);
  }
}

/*
 * Общий чат игроков в Telegram. Админ создаёт группу и добавляет туда бота администратором —
 * бот сам запоминает группу (my_chat_member). Ссылку-приглашение создаёт бот (createChatInviteLink).
 * «Только для игроков сайта» — ссылка с заявкой: бот принимает тех, кто подтвердил Telegram на сайте.
 * Всё хранится в app_settings: TELEGRAM_GROUP_ID, TELEGRAM_GROUP_TITLE, TELEGRAM_GROUP_INVITE, TELEGRAM_GROUP_CLOSED.
 */
export const GROUP_KEYS = ["TELEGRAM_GROUP_ID", "TELEGRAM_GROUP_TITLE", "TELEGRAM_GROUP_INVITE", "TELEGRAM_GROUP_CLOSED"] as const;

export async function telegramGroup() {
  const { data } = await db().from("app_settings").select("key, value").in("key", [...GROUP_KEYS]);
  const m = new Map((data ?? []).map((r) => [r.key, String(r.value ?? "")]));
  const id = Number(m.get("TELEGRAM_GROUP_ID") || "");
  return {
    id: Number.isFinite(id) && id !== 0 ? id : null,
    title: m.get("TELEGRAM_GROUP_TITLE") || "",
    invite: m.get("TELEGRAM_GROUP_INVITE") || "",
    closed: m.get("TELEGRAM_GROUP_CLOSED") === "1",
  };
}

export async function setAppSettings(values: Record<string, string>) {
  await db().from("app_settings").upsert(Object.entries(values).map(([key, value]) => ({ key, value })));
}

/** Какие обновления бот получает от Telegram (вебхук) */
export const TG_ALLOWED_UPDATES = ["message", "my_chat_member", "chat_join_request"];
