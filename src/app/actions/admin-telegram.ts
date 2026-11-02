"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/supabase";
import { SITE_URL, telegramConfig, tgCall, tgEscape, tgSend } from "@/lib/telegram";
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
    allowed_updates: ["message"],
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

  let ok = 0;
  // Telegram: не больше ~30 сообщений в секунду — шлём пачками по 20 с паузой
  for (let i = 0; i < chats.length; i += 20) {
    const res = await Promise.allSettled(chats.slice(i, i + 20).map((c) => tgSend(cfg.token, c, `📣 ${tgEscape(text)}`, { text: "Открыть сайт", url: SITE_URL })));
    ok += res.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    if (i + 20 < chats.length) await new Promise((r) => setTimeout(r, 1100));
  }
  await audit(admin.id, "telegram.broadcast", undefined, { audience, sent: ok, total: chats.length, text: text.slice(0, 200) });
  return { success: `Отправлено: ${ok} из ${chats.length}` };
}
