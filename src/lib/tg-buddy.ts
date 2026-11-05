import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { audit } from "./audit";
import { getSetting } from "./settings";
import { db } from "./supabase";
import { SITE_URL, setAppSettings, tgCall } from "./telegram";
import { ORGANIZER_NOTES, askerContext, tournamentsContext } from "./tg-faq";
import { findViolation } from "./tg-moderation-core";
import type { TgMessage } from "./tg-moderation";

/*
 * «Свой в чате»: бот — участник сообщества F16 Arena в Telegram. В темах, где админ написал /talk,
 * он понимает, что это за тема, и ведёт себя по ней: в «Общении» болтает и подкалывает, в «Поиске тиммейтов»
 * сводит игроков, в «Турнирах» отвечает строго по регламенту, в «Лобби» объясняет лобби. Отвечает, когда к нему
 * обращаются (ответ на его сообщение, @упоминание, «бот, …»), изредка сам вступает в разговор, а когда в
 * «болтательных» темах тихо — сам начинает разговор (раз в несколько часов, днём). Знает турниры, регламент,
 * разъяснения организаторов и последние сообщения темы. Если спросят прямо — говорит, что он бот клуба.
 */

const MODEL = "claude-sonnet-5-5";
const DAILY_LIMIT = 500;
const USER_GAP_MS = 12_000;
const HISTORY = 25;
const JOIN_GAP_MS = 20 * 60_000; // сам вступает не чаще раза в 20 минут на тему
const JOIN_CHANCE = 0.18;
const OPEN_QUIET_MS = 3 * 3600_000; // сам начинает разговор, если в теме тихо 3 часа
const OPEN_GAP_MS = 4 * 3600_000;
const TZ = "Asia/Almaty";

export type TalkRole = "banter" | "teammates" | "tournaments" | "help" | "lobby" | "quiet";
export type TalkThread = { id: number; name: string; role: TalkRole };

/** Роль темы по названию */
export function roleOf(name: string): TalkRole {
  const n = name.toLowerCase();
  if (/объявл|матчи турнира|купля|продаж|идеи|ұсыныс|хабарл/.test(n)) return "quiet";
  if (/тиммейт|поиск|команд[уы] ищ|іздеу/.test(n)) return "teammates";
  if (/турнир|турнир|жарыс/.test(n)) return "tournaments";
  if (/помощ|поддерж|көмек|support|help/.test(n)) return "help";
  if (/лобби|lobby/.test(n)) return "lobby";
  return "banter";
}

const ROLE_RULES: Record<TalkRole, string> = {
  banter:
    "Тема «Общение» — свободный чат. Здесь ты свой парень: болтаешь, шутишь, подкалываешь по-доброму, поддерживаешь разговор, спрашиваешь в ответ. Можно про CS2, про клуб, про матчи, про жизнь.",
  teammates:
    `Тема «Поиск тиммейтов». Помогай найти команду или игрока: если в последних сообщениях кто-то искал подходящего — подскажи его (по имени из сообщений). Спрашивай роль, ELO, время игры. Напоминай про поиск на сайте: ${SITE_URL}/find. Шутки — по минимуму.`,
  tournaments:
    "Тема «Турниры». Отвечай точно по регламенту и данным сайта, без шуток и подколов. Нет ответа в данных — скажи, что передашь организаторам, и поставь в конце метку [ORG].",
  help: "Тема «Помощь». Помогай с сайтом, анкетой, документами, подтверждением Telegram, лобби. Коротко, по шагам, без шуток. Не знаешь — метка [ORG] в конце.",
  lobby: `Тема «Лобби». Объясняй, как создать лобби на сайте (${SITE_URL}/lobbies): режимы 5×5, 2×2, 1×1, настройки и модификаторы, игра в клубе с нулевым пингом. Можно звать людей в лобби. Шутки — по делу.`,
  quiet: "В этой теме свои правила — отвечай только если к тебе обратились, коротко.",
};

/** Закулисье — не обсуждаем (то же правило у помощника в tg-faq) */
export const BACKSTAGE = `Закулисье не обсуждай: правки и прошлые версии регламента («меняли ли», «что было раньше», «почему изменили»), внутреннюю работу платформы и сайта (серверы, мониторинг, ИИ, модерация, ключи, базы), действия и переписку админов, планы и доработки, о которых не объявляли, чужие заявки и документы. Правила называй как действующие — без «решение организаторов важнее пункта регламента», «раньше было», «изменили». Спросят про это — «актуальная версия — на странице турнира», «это к организаторам» или отшутись.`;

const PERSONA = `Ты — бот F16 Arena, свой человек в Telegram-чате компьютерного клуба F16 Arena (Усть-Каменогорск / Өскемен, Казахстан). Клуб проводит турниры по CS2 и лобби на своих серверах, сайт — ${SITE_URL}.

Характер: живой, дружелюбный, с юмором, говоришь как игрок CS2 из клуба — сленг (раш, тиммейт, клатч, эйс, изи, гг, нюк, афк, смок, флешка), коротко, как в чате. Пишешь на языке собеседника — по-русски или по-казахски (можно смешивать, как пишут в чате). Эмодзи — изредка.
Подколы — только добрые и только про игру (скилл, ELO, сыгранность, «опять раш B без флешек»). Никогда: мат, оскорбления, внешность, семья, национальность, религия, деньги, политика. Если человек расстроен или просит не шутить — перестань и поддержи. Не спорь с админами и не обсуждай наказания — «это к админам».
Не советуй читы, обход правил, ставки, продажу аккаунтов. Не раскрывай личные данные игроков.
${BACKSTAGE}
Ты бот (ИИ клуба). Не говори, что ты человек: если спросят — честно скажи, что ты бот F16 Arena.
Про турниры, правила, даты, призы, документы — только по данным ниже, ничего не выдумывай. Шутить можно, но факты — точные.
Ответ — простым текстом без Markdown, 1–3 коротких предложения (на вопрос по регламенту — сколько нужно, но без воды). Не начинай с обращения «Привет!» каждый раз. Не повторяй то, что уже писал в истории.
Если отвечать нечего или лучше промолчать — ответь ровно одним словом: SKIP`;

// ── история тем (в памяти процесса; после перезапуска сайта начинается заново)

type Line = { who: string; text: string; at: number; bot?: boolean; id?: number };
const history = new Map<number, Line[]>();
const lastBot = new Map<number, number>();
const lastHuman = new Map<number, number>();
const started = Date.now();

function remember(thread: number, line: Line) {
  const h = history.get(thread) ?? [];
  h.push(line);
  if (h.length > HISTORY) h.splice(0, h.length - HISTORY);
  history.set(thread, h);
  if (line.bot) lastBot.set(thread, line.at);
  else lastHuman.set(thread, line.at);
}

const nameOf = (m: TgMessage) => (m.from ? [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username || "игрок" : "игрок");
const timeStr = (ms: number) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

// ── лимиты

let day = "";
let used = 0;
const lastAsk = new Map<number, number>();
function budget(userId?: number) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAILY_LIMIT) return false;
  if (userId != null) {
    if (Date.now() - (lastAsk.get(userId) ?? 0) < USER_GAP_MS) return false;
    lastAsk.set(userId, Date.now());
  }
  used++;
  return true;
}

// ── темы с ботом (/talk)

export function parseTalkThreads(raw: string | null | undefined): TalkThread[] {
  try {
    const v = JSON.parse(raw || "[]") as { id: number; name: string }[];
    return v.filter((x) => Number.isFinite(x.id)).map((x) => ({ id: x.id, name: x.name, role: roleOf(x.name) }));
  } catch {
    return [];
  }
}

/** Название темы: в форумах сообщение без ответа «отвечает» на служебное сообщение создания темы */
export function topicName(msg: TgMessage): string | null {
  const root = msg.reply_to_message as (TgMessage & { forum_topic_created?: { name?: string } }) | undefined;
  return root?.forum_topic_created?.name ?? null;
}

export async function saveTalkThreads(list: TalkThread[]) {
  await setAppSettings({ TELEGRAM_TALK_THREADS: JSON.stringify(list.map(({ id, name }) => ({ id, name }))) });
}

// ── модель

async function ask(system: string, prompt: string): Promise<string | null> {
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const tours = await tournamentsContext();
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // персона + регламент и данные турниров — общий кэшируемый префикс; тема, время и разговор — в сообщении
      system: [
        { type: "text", text: `${PERSONA}\n\n${ORGANIZER_NOTES}` },
        { type: "text", text: `Данные с сайта:\n${tours.text}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `${system}\n\n${prompt}` }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text || /^SKIP\b/i.test(text)) return null;
    return text;
  } catch (e) {
    console.error("tg buddy", e instanceof Error ? e.message : e);
    await audit(null, "telegram.faq_error", undefined, { reason: `бот в чате: ${String(e instanceof Error ? e.message : e).slice(0, 300)}` }).catch(() => {});
    return null;
  }
}

function transcript(thread: number) {
  return (history.get(thread) ?? []).map((l) => `[${timeStr(l.at)}] ${l.bot ? "ТЫ (бот)" : l.who}: ${l.text}`).join("\n");
}

async function send(token: string, chatId: number, thread: number, text: string, replyTo?: number) {
  const clean = text.replace(/\s*\[ORG\]\s*/gi, "").trim();
  // свой же ответ — через тот же фильтр мата
  if (!clean || findViolation(clean)?.kind === "mat") return null;
  const r = await tgCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    message_thread_id: thread,
    text: clean.slice(0, 2000),
    disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
  if (r.ok) remember(thread, { who: "бот", text: clean, at: Date.now(), bot: true, id: r.result?.message_id });
  return r.ok ? clean : null;
}

// ── входящее сообщение

const ADDRESS = /^\s*(бот|ботик|ботяра|f16|ф16)\b[\s,!:]*/i;

/** Каждое сообщение в теме с ботом: запомнить, решить — отвечать ли (вызывать после модерации, в after()) */
export async function onTalkMessage(token: string, msg: TgMessage, t: TalkThread, admin: boolean, wasDeleted: boolean) {
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (!msg.from || msg.from.is_bot || !text || text.startsWith("/")) return;
  remember(t.id, { who: nameOf(msg), text: text.slice(0, 500), at: Date.now(), id: msg.message_id });
  if (wasDeleted || findViolation(text)) return;

  const botId = Number(token.split(":")[0]);
  const repliedTo = msg.reply_to_message && msg.reply_to_message.message_id !== msg.message_thread_id ? msg.reply_to_message : null;
  const toBot = repliedTo?.from?.id === botId;
  const username = (await getSetting("TELEGRAM_BOT_USERNAME"))?.replace(/^@/, "") ?? "";
  const mentioned = (!!username && text.toLowerCase().includes(`@${username.toLowerCase()}`)) || ADDRESS.test(text);
  const question = /\?/.test(text);

  let mode: "direct" | "question" | "join" | null = null;
  if (toBot || mentioned) mode = "direct";
  else if (t.role === "quiet") return;
  else if (question && (t.role === "tournaments" || t.role === "help" || t.role === "lobby")) mode = "question";
  else if ((t.role === "banter" || t.role === "teammates") && Date.now() - (lastBot.get(t.id) ?? 0) > JOIN_GAP_MS && Math.random() < JOIN_CHANCE) mode = "join";
  if (!mode) return;
  // админов бот слышит, только когда к нему обращаются
  if (admin && mode !== "direct") return;
  if (!budget(mode === "join" ? undefined : msg.from.id)) return;

  void tgCall(token, "sendChatAction", { chat_id: msg.chat.id, message_thread_id: t.id, action: "typing" });
  const tours = await tournamentsContext();
  const asker = await askerContext(msg.from.id, tours.ids);
  const situation =
    mode === "direct"
      ? `${nameOf(msg)} обращается к тебе${repliedTo ? ` (отвечает на «${String(repliedTo.text ?? repliedTo.caption ?? "").slice(0, 300)}»)` : ""}. Ответь ему.`
      : mode === "question"
        ? `${nameOf(msg)} задал вопрос. Если он к организаторам/про сайт — ответь; если игроки спрашивают друг друга о своём — SKIP.`
        : "Никто к тебе не обращался. Вступи в разговор, только если можешь добавить что-то живое и уместное (шутка, поддержка, полезная подсказка, вопрос). Иначе — SKIP.";
  const reply = await ask(
    `Тема: «${t.name}». ${ROLE_RULES[t.role]}\nСейчас ${timeStr(Date.now())} по Алматы.`,
    `Последние сообщения темы:\n${transcript(t.id)}\n\nО собеседнике: ${asker}\n\n${situation}\nПоследнее сообщение — от ${nameOf(msg)}: «${text.slice(0, 1500)}»`,
  );
  if (!reply) return;
  const toOrganizers = /\[ORG\]/i.test(reply);
  const sent = await send(token, msg.chat.id, t.id, reply, mode === "join" ? undefined : msg.message_id);
  if (sent) await audit(null, "telegram.talk", undefined, { thread: t.name, mode, user: String(msg.from.id), text: text.slice(0, 500), answer: sent.slice(0, 1000), org: toOrganizers || null }).catch(() => {});
}

// ── бот сам начинает разговор (раз в несколько часов, днём, если в теме тихо)

async function freshNews() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const lines: string[] = [];
  const { data: games } = await db().from("lobby_games").select("id, map, created_at").gte("created_at", since).limit(50);
  if (games?.length) lines.push(`За сутки в лобби клуба сыграно карт: ${games.length}.`);
  const { data: an } = await db().from("demo_analyses").select("title, score_a, score_b, team_a, team_b, created_at").eq("kind", "match").gte("created_at", since).order("created_at", { ascending: false }).limit(5);
  for (const a of an ?? []) lines.push(`Сыграна карта: ${a.title} — ${a.team_a} ${a.score_a}:${a.score_b} ${a.team_b} (повтор и разбор на сайте, раздел «Разбор игры»).`);
  const { data: teams } = await db().from("teams").select("name, created_at").gte("created_at", since).eq("is_solo", false).limit(10);
  if (teams?.length) lines.push(`Новые команды за сутки: ${teams.map((x) => x.name).join(", ")}.`);
  return lines.join("\n") || "Свежих событий за сутки нет.";
}

/** Вызывается из фоновых задач сайта (раз в несколько минут). */
export async function talkOpenTick() {
  const { telegramConfig, telegramGroup } = await import("./telegram");
  const [cfg, group] = await Promise.all([telegramConfig(), telegramGroup()]);
  if (!cfg.token || !group.id) return;
  const { data } = await db().from("app_settings").select("value").eq("key", "TELEGRAM_TALK_THREADS").maybeSingle();
  const threads = parseTalkThreads(data?.value as string | undefined).filter((t) => t.role === "banter" || t.role === "teammates");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12 || hour >= 22) return;
  for (const t of threads) {
    const quietSince = Math.max(lastHuman.get(t.id) ?? started, lastBot.get(t.id) ?? started);
    if (Date.now() - quietSince < OPEN_QUIET_MS || Date.now() - (lastBot.get(t.id) ?? started) < OPEN_GAP_MS) continue;
    if (!budget()) return;
    const reply = await ask(
      `Тема: «${t.name}». ${ROLE_RULES[t.role]}\nСейчас ${timeStr(Date.now())} по Алматы.`,
      `В теме давно тихо. Начни разговор сам — одно живое сообщение, как участник чата: вопрос к людям, повод зайти в клуб или собрать лобби, подогрей интерес к турниру (сколько дней осталось, сколько команд), отметь свежую игру. Не повторяй свои прошлые сообщения.\n\nСвежие события:\n${await freshNews()}\n\nПоследние сообщения темы (если есть):\n${transcript(t.id) || "—"}`,
    );
    if (!reply) {
      lastBot.set(t.id, Date.now()); // не дёргать модель каждый тик
      continue;
    }
    const sent = await send(cfg.token, group.id, t.id, reply);
    if (sent) await audit(null, "telegram.talk", undefined, { thread: t.name, mode: "open", answer: sent.slice(0, 1000) }).catch(() => {});
  }
}
