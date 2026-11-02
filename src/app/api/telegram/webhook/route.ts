import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/supabase";
import { SITE_URL, telegramConfig, tgEscape, tgSend } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Update = { message?: { text?: string; chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string } } };

const LINK_TTL_MS = 30 * 60_000;

/** Вебхук Telegram-бота: /start <токен> привязывает Telegram к аккаунту, /status, /stop, /help */
export async function POST(req: Request) {
  const cfg = await telegramConfig();
  if (!cfg.token || !cfg.secret || req.headers.get("x-telegram-bot-api-secret-token") !== cfg.secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return NextResponse.json({ ok: true });
  const chat = msg.chat.id;
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
  const reply = (html: string, button?: { text: string; url: string }) => tgSend(cfg.token, chat, html, button);
  const linked = async () => {
    const { data } = await db().from("player_profiles").select("player_id, player:players(nickname)").eq("telegram_chat_id", chat).maybeSingle();
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
    await reply(
      `✅ Telegram подтверждён для <b>${tgEscape(p?.nickname ?? "игрока")}</b>.\n\nСюда будут приходить уведомления F16 Arena: приглашения в команду, решения по заявкам, матчи и объявления турниров.\n\nОтключить — /stop`,
      { text: "Открыть сайт", url: SITE_URL },
    );
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
