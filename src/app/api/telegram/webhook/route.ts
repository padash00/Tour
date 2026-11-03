import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { SITE_URL, setAppSettings, telegramConfig, telegramGroup, tgCall, tgEscape, tgSend } from "@/lib/telegram";
import type { Player } from "@/lib/types";
import { MODERATION_HELP, moderateGroupMessage, onCallback, type TgCallback, type TgMessage } from "@/lib/tg-moderation";

export const dynamic = "force-dynamic";

type TgUser = { id: number; username?: string; first_name?: string };
type Update = {
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
  /** бота добавили в группу / изменили права / удалили */
  my_chat_member?: { chat: { id: number; type: string; title?: string }; from: TgUser; new_chat_member: { status: string } };
  /** заявка на вступление в группу по ссылке «с одобрением» */
  chat_join_request?: { chat: { id: number; title?: string }; from: TgUser; user_chat_id?: number };
};

/** Игрок сайта, к которому привязан этот Telegram (id пользователя = id личного чата с ботом) */
async function playerByTelegram(userId: number) {
  const { data } = await db().from("player_profiles").select("player:players!player_profiles_player_id_fkey(*)").eq("telegram_chat_id", userId).maybeSingle();
  return ((data as { player: Player | null } | null)?.player ?? null) as Player | null;
}

/** Бота добавили в группу или убрали. Запоминаем группу, только если добавил админ сайта (с подтверждённым Telegram) */
async function onMyChatMember(token: string, u: NonNullable<Update["my_chat_member"]>) {
  const { chat, from, new_chat_member } = u;
  if (chat.type !== "group" && chat.type !== "supergroup") return;
  const group = await telegramGroup();
  const status = new_chat_member.status;
  if (status === "left" || status === "kicked") {
    if (group.id === chat.id) await setAppSettings({ TELEGRAM_GROUP_ID: "", TELEGRAM_GROUP_INVITE: "" });
    return;
  }
  if (group.id === chat.id) {
    await setAppSettings({ TELEGRAM_GROUP_TITLE: chat.title ?? group.title });
    return;
  }
  const admin = await playerByTelegram(from.id);
  if (!isAdmin(admin)) {
    // добавил не админ сайта — группу не запоминаем и молчим (из группы не выходим: могли ошибиться с аккаунтом)
    console.warn("tg: group add by non-admin", chat.id, from.id);
    return;
  }
  await setAppSettings({ TELEGRAM_GROUP_ID: String(chat.id), TELEGRAM_GROUP_TITLE: chat.title ?? "", TELEGRAM_GROUP_INVITE: "" });
  await audit(admin!.id, "telegram.group", undefined, { chat: chat.id, title: chat.title });
  await tgSend(
    token,
    from.id,
    status === "administrator"
      ? `✅ Группа <b>${tgEscape(chat.title ?? "")}</b> подключена как общий чат игроков. Дальше — F16 Control → Telegram: создать ссылку и пригласить всех.`
      : `Группа <b>${tgEscape(chat.title ?? "")}</b> запомнена, но бот там не администратор. Сделайте его администратором с правом «Приглашать по ссылке» — иначе он не сможет создать ссылку.`,
    { text: "Открыть пульт", url: `${SITE_URL}/admin/telegram` },
  );
}

/** Заявка в закрытый чат: игроков сайта принимаем, остальным объясняем, как подтвердить Telegram */
async function onJoinRequest(token: string, r: NonNullable<Update["chat_join_request"]>) {
  const group = await telegramGroup();
  if (group.id !== r.chat.id) return;
  const player = await playerByTelegram(r.from.id);
  if (player && !player.is_banned) {
    await tgCall(token, "approveChatJoinRequest", { chat_id: r.chat.id, user_id: r.from.id });
    return;
  }
  // написать в личку тому, кто подал заявку, бот может, даже если тот не запускал бота
  await tgSend(
    token,
    r.user_chat_id ?? r.from.id,
    `Чат <b>${tgEscape(group.title || "игроков F16 Arena")}</b> — для игроков сайта.\n\nВойдите на сайт через Steam → Анкета → «Подтвердить Telegram». После подтверждения бот сам примет вашу заявку.`,
    { text: "Открыть анкету", url: `${SITE_URL}/me/profile` },
  );
}

const LINK_TTL_MS = 30 * 60_000;

/** Вебхук Telegram-бота: /start <токен> привязывает Telegram к аккаунту, /status, /stop, /help */
export async function POST(req: Request) {
  const cfg = await telegramConfig();
  if (!cfg.token || !cfg.secret || req.headers.get("x-telegram-bot-api-secret-token") !== cfg.secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => ({}))) as Update;
  if (update.my_chat_member) {
    await onMyChatMember(cfg.token, update.my_chat_member).catch((e) => console.error("tg my_chat_member", e));
    return NextResponse.json({ ok: true });
  }
  if (update.chat_join_request) {
    await onJoinRequest(cfg.token, update.chat_join_request).catch((e) => console.error("tg join request", e));
    return NextResponse.json({ ok: true });
  }
  // общий чат игроков — модерация
  const groupMsg = update.message ?? update.edited_message;
  if (update.callback_query || (groupMsg && groupMsg.chat.type !== "private")) {
    const group = await telegramGroup();
    if (group.id && update.callback_query) await onCallback(cfg.token, group.id, update.callback_query).catch((e) => console.error("tg callback", e));
    else if (group.id && groupMsg && groupMsg.chat.id === group.id) await moderateGroupMessage(cfg.token, groupMsg, !update.message).catch((e) => console.error("tg moderation", e));
    return NextResponse.json({ ok: true });
  }
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return NextResponse.json({ ok: true });
  const chat = msg.chat.id;
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
  const reply = (html: string, button?: { text: string; url: string }) => tgSend(cfg.token, chat, html, button);
  const linked = async () => {
    const { data } = await db().from("player_profiles").select("player_id, player:players!player_profiles_player_id_fkey(nickname)").eq("telegram_chat_id", chat).maybeSingle();
    return data as { player_id: string; player: { nickname: string } | null } | null;
  };

  if (cmd === "/start" && arg) {
    const { data: tok } = await db().from("telegram_link_tokens").select("player_id, created_at").eq("token", arg).maybeSingle();
    if (!tok || Date.now() - new Date(tok.created_at).getTime() > LINK_TTL_MS) {
      await reply("Ссылка устарела. Откройте анкету на сайте и нажмите «Подтвердить Telegram» ещё раз.", { text: "Открыть анкету", url: `${SITE_URL}/me/profile` });
      return NextResponse.json({ ok: true });
    }
    // один Telegram — один аккаунт: снимаем привязку у прежнего владельца этого чата
    await db().from("player_profiles").update({ telegram_chat_id: null, telegram_verified_at: null }).eq("telegram_chat_id", chat).neq("player_id", tok.player_id);
    const now = new Date().toISOString();
    const username = msg.from?.username ?? null;
    const { data: existing } = await db().from("player_profiles").select("player_id").eq("player_id", tok.player_id).maybeSingle();
    const patch = { telegram_chat_id: chat, telegram_verified_at: now, ...(username ? { telegram: username } : {}), updated_at: now };
    if (existing) await db().from("player_profiles").update(patch).eq("player_id", tok.player_id);
    else await db().from("player_profiles").insert({ player_id: tok.player_id, ...patch });
    await db().from("telegram_link_tokens").delete().eq("player_id", tok.player_id);
    const { data: p } = await db().from("players").select("nickname").eq("id", tok.player_id).maybeSingle();
    await audit(tok.player_id, "telegram.link", { type: "player", id: tok.player_id }, { username });
    // если игрок уже подал заявку в закрытый чат — принимаем; ошибку «заявки нет» глотаем
    const group = await telegramGroup();
    if (group.id) await tgCall(cfg.token, "approveChatJoinRequest", { chat_id: group.id, user_id: msg.from?.id ?? chat });
    await reply(
      `✅ Telegram подтверждён для <b>${tgEscape(p?.nickname ?? "игрока")}</b>.\n\nСюда будут приходить уведомления F16 Arena: приглашения в команду, решения по заявкам, матчи и объявления турниров.${group.invite ? "\n\nВступайте в общий чат игроков — там новости, поиск тиммейтов и объявления турниров." : ""}\n\nОтключить — /stop`,
      group.invite ? { text: "💬 Вступить в чат игроков", url: group.invite } : { text: "Открыть сайт", url: SITE_URL },
    );
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/mod") {
    const l = await linked();
    const { data: me } = l ? await db().from("players").select("*").eq("id", l.player_id).maybeSingle() : { data: null };
    await reply(isAdmin(me as Player | null) ? tgEscape(MODERATION_HELP) : "Команда для администраторов.");
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/status") {
    const l = await linked();
    await reply(l ? `Подключено к аккаунту <b>${tgEscape(l.player?.nickname ?? "?")}</b>. Уведомления приходят сюда.` : "Telegram пока не привязан. Откройте анкету на сайте и нажмите «Подтвердить Telegram».", l ? undefined : { text: "Открыть анкету", url: `${SITE_URL}/me/profile` });
    return NextResponse.json({ ok: true });
  }

  if (cmd === "/stop") {
    const l = await linked();
    if (l) {
      await db().from("player_profiles").update({ telegram_chat_id: null, telegram_verified_at: null }).eq("player_id", l.player_id);
      await audit(l.player_id, "telegram.unlink", { type: "player", id: l.player_id });
    }
    await reply("Уведомления отключены. Подключить снова — кнопка «Подтвердить Telegram» в анкете на сайте.");
    return NextResponse.json({ ok: true });
  }

  await reply(
    "Это бот турниров <b>F16 Arena</b>.\n\nЧтобы получать уведомления о командах, заявках и матчах, войдите на сайт через Steam → Анкета → «Подтвердить Telegram».\n\n/status — мой аккаунт\n/stop — отключить уведомления",
    { text: "Открыть анкету", url: `${SITE_URL}/me/profile` },
  );
  return NextResponse.json({ ok: true });
}
