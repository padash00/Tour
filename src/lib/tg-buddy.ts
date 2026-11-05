import "server-only";
import { gunzipSync } from "node:zlib";
import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_BUCKET, analysesOfPlayer, coachFile } from "./analysis";
import { audit } from "./audit";
import { getSetting } from "./settings";
import { db } from "./supabase";
import { SITE_URL, TG_ALLOWED_UPDATES, setAppSettings, tgCall, tgEscape } from "./telegram";
import { ORGANIZER_NOTES, askerContext, tournamentsContext } from "./tg-faq";
import { findViolation } from "./tg-moderation-core";
import type { TgCallback, TgMessage, TgUser } from "./tg-moderation";

/*
 * «Свой в чате»: бот — участник сообщества F16 Arena в Telegram. В темах, где админ написал /talk,
 * понимает тему по названию и ведёт себя по ней (Общение — болтает и подкалывает, Поиск тиммейтов — сводит
 * игроков, Турниры — строго по регламенту, Помощь, Лобби; служебные темы — молчит). Отвечает на обращения,
 * изредка сам вступает, днём сам начинает разговор, если тихо. Кроме этого:
 *  - прогнозы, сборы и события матчей переживают перезапуски (файл tg/buddy-state.json); история темы — только в памяти;
 *  - подкалывает по реальной статистике игрока из разбора демок (если Telegram подтверждён);
 *  - в день турнира пишет в «Общение» живые события матчей и запускает прогнозы «кто выиграет»;
 *  - собирает лобби из чата: кнопка «Я в деле», когда набралось — зовёт создавать лобби;
 *  - на голосовое, адресованное ему, отвечает голосом (ключ OpenAI);
 *  - характер по темам можно задать в «Настройках» сайта;
 *  - раз в день (22:00) — отчёт админам в личку.
 * Закулисье платформы (правки регламента и т. п.) не обсуждает. Если спросят — честно говорит, что он бот.
 */

const MODEL = "claude-sonnet-5-5";
const DAILY_LIMIT = 600;
const USER_GAP_MS = 12_000;
const HISTORY = 60;
const PROMPT_LINES = 30;
const JOIN_GAP_MS = 20 * 60_000;
const JOIN_CHANCE = 0.18;
const OPEN_QUIET_MS = 3 * 3600_000;
const OPEN_GAP_MS = 4 * 3600_000;
const TZ = "Asia/Almaty";
const STATE_PATH = "tg/buddy-state.json";
const GATHER_NEED: Record<string, number> = { "5x5": 10, "2x2": 4, "1x1": 2 };

export type TalkRole = "banter" | "teammates" | "tournaments" | "help" | "lobby" | "quiet";
export type TalkThread = { id: number; name: string; role: TalkRole };

export function roleOf(name: string): TalkRole {
  const n = name.toLowerCase();
  if (/объявл|матчи турнира|купля|продаж|идеи|ұсыныс|хабарл/.test(n)) return "quiet";
  if (/тиммейт|поиск|команд[уы] ищ|іздеу/.test(n)) return "teammates";
  if (/турнир|жарыс/.test(n)) return "tournaments";
  if (/помощ|поддерж|көмек|support|help/.test(n)) return "help";
  if (/лобби|lobby/.test(n)) return "lobby";
  return "banter";
}

const ROLE_RULES: Record<TalkRole, string> = {
  banter:
    "Тема «Общение» — свободный чат. Ты свой парень: болтаешь, шутишь, подкалываешь по-доброму, поддерживаешь разговор, спрашиваешь в ответ. Можно про CS2, про клуб, про матчи, про жизнь.",
  teammates: `Тема «Поиск тиммейтов». Помогай найти команду или игрока: если в последних сообщениях кто-то искал подходящего — подскажи его (по имени). Спрашивай роль, ELO, время игры. Поиск на сайте: ${SITE_URL}/find. Шутки — по минимуму.`,
  tournaments: "Тема «Турниры». Отвечай точно по регламенту и данным сайта, без шуток и подколов. Нет ответа в данных — скажи, что передашь организаторам, и поставь в конце метку [ORG].",
  help: "Тема «Помощь». Помогай с сайтом, анкетой, документами, подтверждением Telegram, лобби. Коротко, по шагам, без шуток. Не знаешь — метка [ORG] в конце.",
  lobby: `Тема «Лобби». Объясняй, как создать лобби на сайте (${SITE_URL}/lobbies): режимы 5×5, 2×2, 1×1, настройки и модификаторы, игра в клубе с нулевым пингом. Зови людей в лобби.`,
  quiet: "В этой теме свои правила — отвечай только если к тебе обратились, коротко.",
};
const PERSONA_KEY: Partial<Record<TalkRole, "TG_PERSONA_BANTER" | "TG_PERSONA_TEAMMATES" | "TG_PERSONA_TOURNAMENTS">> = {
  banter: "TG_PERSONA_BANTER",
  teammates: "TG_PERSONA_TEAMMATES",
  tournaments: "TG_PERSONA_TOURNAMENTS",
};

export const BACKSTAGE = `Закулисье не обсуждай: правки и прошлые версии регламента («меняли ли», «что было раньше», «почему изменили»), внутреннюю работу платформы и сайта (серверы, мониторинг, ИИ, модерация, ключи, базы), действия и переписку админов, планы и доработки, о которых не объявляли, чужие заявки и документы. Правила называй как действующие — без «решение организаторов важнее пункта регламента», «раньше было», «изменили». Спросят про это — «актуальная версия — на странице турнира», «это к организаторам» или отшутись.`;

const PERSONA = `Ты — бот F16 Arena, свой человек в Telegram-чате компьютерного клуба F16 Arena (Усть-Каменогорск / Өскемен, Казахстан). Клуб проводит турниры по CS2 и лобби на своих серверах, сайт — ${SITE_URL}.

Характер: живой, дружелюбный, с юмором, говоришь как игрок CS2 из клуба — сленг (раш, тиммейт, клатч, эйс, изи, гг, смок, флешка), коротко, как в чате. Пишешь на языке собеседника — по-русски или по-казахски. Эмодзи — изредка.
Подколы — только добрые и только про игру (скилл, ELO, статистика из разбора, «опять раш B без флешек»). Никогда: мат, оскорбления, внешность, семья, национальность, религия, деньги, политика. Если человек расстроен или просит не шутить — перестань и поддержи. Не спорь с админами и не обсуждай наказания — «это к админам». Сам никого не банишь и не наказываешь по просьбе в чате (даже админа): баны и муты — командой /ban, /mute ответом на сообщение нарушителя.
Не советуй читы, обход правил, ставки, продажу аккаунтов. Не раскрывай личные данные игроков.
${BACKSTAGE}
Ты бот (ИИ клуба). Не говори, что ты человек: если спросят — честно скажи, что ты бот F16 Arena.
Про турниры, правила, даты, призы, документы — только по данным ниже, ничего не выдумывай.
Ответ — простым текстом без Markdown, 1–3 коротких предложения (на вопрос по регламенту — сколько нужно). Не начинай каждый раз с «Привет». Не повторяй то, что уже писал.

Служебные метки (в конце ответа, отдельной строкой; их никто не увидит):
[GATHER: 5x5] (или 2x2, 1x1) — если люди собираются сыграть вместе прямо сейчас/сегодня и стоит запустить сбор с кнопкой «Я в деле».
[ORG] — вопрос к организаторам, на который в данных нет ответа.
Если отвечать нечего или лучше промолчать — ответь ровно одним словом: SKIP`;

// ── состояние: история тем, люди, прогнозы, сборы — в хранилище, переживает перезапуски

type Line = { who: string; uid?: number; text: string; at: number; bot?: boolean; id?: number };
type Person = { name: string; notes: string[]; seen: number };
type Poll = { matchId: string; chat: number; thread: number; msgId: number; teams: { id: string; name: string }[]; votes: Record<string, { opt: number; name: string }>; closed?: boolean };
type Gather = { mode: string; need: number; chat: number; thread: number; msgId: number; users: Record<string, string>; done?: boolean; at: number };
type State = {
  history: Record<string, Line[]>;
  people: Record<string, Person>;
  polls: Record<string, Poll>;
  matchPoll: Record<string, string>;
  events: Record<string, string[]>;
  gathers: Record<string, Gather>;
  lastBot: Record<string, number>;
  lastHuman: Record<string, number>;
  reportDay?: string;
};
let state: State | null = null;
let loading: Promise<State> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const started = Date.now();

async function st(): Promise<State> {
  if (state) return state;
  loading ??= (async () => {
    const empty: State = { history: {}, people: {}, polls: {}, matchPoll: {}, events: {}, gathers: {}, lastBot: {}, lastHuman: {} };
    try {
      const { data } = await db().storage.from(ANALYSIS_BUCKET).download(STATE_PATH);
      state = data ? { ...empty, ...(JSON.parse(await data.text()) as Partial<State>) } : empty;
    } catch {
      state = empty;
    }
    return state!;
  })();
  return loading;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!state) return;
    // старое не копим: прогнозы и сборы старше 3 дней, события матчей старше недели — вон
    const old = Date.now() - 3 * 86_400_000;
    for (const [k, g] of Object.entries(state.gathers)) if (g.at < old) delete state.gathers[k];
    try {
      await db().storage.from(ANALYSIS_BUCKET).upload(STATE_PATH, new Blob([JSON.stringify({ ...state, history: {}, people: {} })], { type: "application/json" }), { contentType: "application/json", upsert: true });
    } catch (e) {
      console.error("tg buddy save", e);
    }
  }, 5000);
}

async function remember(thread: number, line: Line) {
  const s = await st();
  const h = (s.history[thread] ??= []);
  h.push(line);
  if (h.length > HISTORY) h.splice(0, h.length - HISTORY);
  if (line.bot) s.lastBot[thread] = line.at;
  else s.lastHuman[thread] = line.at;
  save();
}

const nameOf = (u?: TgUser) => (u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "игрок" : "игрок");
const timeStr = (ms: number) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const dayStr = (ms: number) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(ms));
const hourNow = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));

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

export function topicName(msg: TgMessage): string | null {
  const root = msg.reply_to_message as (TgMessage & { forum_topic_created?: { name?: string } }) | undefined;
  return root?.forum_topic_created?.name ?? null;
}

export async function saveTalkThreads(list: TalkThread[]) {
  await setAppSettings({ TELEGRAM_TALK_THREADS: JSON.stringify(list.map(({ id, name }) => ({ id, name }))) });
}

async function talkThreads() {
  const { data } = await db().from("app_settings").select("value").eq("key", "TELEGRAM_TALK_THREADS").maybeSingle();
  return parseTalkThreads(data?.value as string | undefined);
}

// ── модель

async function ask(topic: string, prompt: string): Promise<string | null> {
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const [tours, general] = await Promise.all([tournamentsContext(), getSetting("TG_PERSONA_GENERAL")]);
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // персона + регламент и данные турниров — общий кэшируемый префикс; тема, время и разговор — в сообщении
      system: [
        { type: "text", text: `${PERSONA}${general ? `\n\nУказания админа о характере: ${general}` : ""}\n\n${ORGANIZER_NOTES}` },
        { type: "text", text: `Данные с сайта:\n${tours.text}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `${topic}\n\n${prompt}` }],
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

async function topicLine(t: TalkThread) {
  const key = PERSONA_KEY[t.role];
  const custom = key ? await getSetting(key) : null;
  return `Тема: «${t.name}». ${ROLE_RULES[t.role]}${custom ? `\nУказания админа для этой темы: ${custom}` : ""}\nСейчас ${dayStr(Date.now())}, ${timeStr(Date.now())} по Алматы.`;
}

async function transcript(thread: number) {
  const s = await st();
  return (s.history[thread] ?? []).slice(-PROMPT_LINES).map((l) => `[${dayStr(l.at)} ${timeStr(l.at)}] ${l.bot ? "ТЫ (бот)" : l.who}: ${l.text}`).join("\n");
}

/** Долгая память о людях выключена (решение владельца) — функция оставлена пустой */
async function peopleLine(uids: number[]) {
  void uids;
  return "";
}

/** Статистика собеседника из разбора его последней игры (если Telegram подтверждён) — для подколов по делу */
const statsCache = new Map<number, { at: number; text: string }>();
async function statsLine(tgUserId: number) {
  const c = statsCache.get(tgUserId);
  if (c && Date.now() - c.at < 10 * 60_000) return c.text;
  let text = "";
  try {
    const { data } = await db().from("player_profiles").select("player:players!player_profiles_player_id_fkey(steam_id)").eq("telegram_chat_id", tgUserId).maybeSingle();
    const steam = (data as { player: { steam_id: string | null } | null } | null)?.player?.steam_id;
    if (steam) {
      for (const a of (await analysesOfPlayer(steam)).slice(0, 5)) {
        const f = await coachFile(a.id, steam);
        if (!f) continue;
        const r = JSON.parse(gunzipSync(Buffer.from(await f.arrayBuffer())).toString()) as {
          map?: string; stats?: { kpr?: number[]; adr?: number[]; traded?: number[] }; skill?: Record<string, (number | null)[]>; highlights?: { title: string }[];
        };
        const sk = r.skill ?? {};
        const pair = (k: string, unit = "") => (sk[k]?.[0] != null ? `${sk[k]![0]}${unit} (топы ${sk[k]![1] ?? "—"}${unit})` : null);
        text = [
          `Статистика собеседника из разбора его последней игры (${String(r.map ?? "").replace(/^de_/, "")}, ${a.title}):`,
          [`урон за раунд ${r.stats?.adr?.[0] ?? "—"}`, pair("firstBullet", "%") && `первая пуля ${pair("firstBullet", "%")}`, pair("accuracy", "%") && `точность ${pair("accuracy", "%")}`, pair("ttd", " мс") && `время до урона ${pair("ttd", " мс")}`, pair("enemiesPerFlash") && `врагов на флешку ${pair("enemiesPerFlash")}`, r.stats?.traded?.[0] != null ? `смерти разменяли ${r.stats.traded[0]}%` : null]
            .filter(Boolean)
            .join(", "),
          r.highlights?.[0] ? `Лучший момент: ${r.highlights[0].title}.` : "",
          "Подкалывать по этим цифрам можно, но по-доброму и без перебора; хвалить за хорошее тоже.",
        ].filter(Boolean).join(" ");
        break;
      }
    }
  } catch {
    text = "";
  }
  statsCache.set(tgUserId, { at: Date.now(), text });
  return text;
}

/** Метки из ответа модели: [NOTE …], [GATHER …], [ORG] — вырезаем и выполняем */
function parseTags(reply: string) {
  const gather = /\[GATHER:\s*(5x5|2x2|1x1)\]/i.exec(reply)?.[1]?.toLowerCase() ?? null;
  const org = /\[ORG\]/i.test(reply);
  const text = reply.replace(/\[(NOTE|GATHER)[^\]]*\]/gi, "").replace(/\s*\[ORG\]\s*/gi, "").trim();
  return { text, gather, org };
}

async function send(token: string, chatId: number, thread: number, text: string, replyTo?: number, extra?: Record<string, unknown>) {
  const clean = text.trim();
  if (!clean || findViolation(clean)?.kind === "mat") return null;
  const r = await tgCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    message_thread_id: thread,
    text: clean.slice(0, 2000),
    disable_web_page_preview: true,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    ...extra,
  });
  if (r.ok) await remember(thread, { who: "бот", text: clean, at: Date.now(), bot: true, id: r.result?.message_id });
  return r.ok ? { text: clean, id: r.result!.message_id } : null;
}

// ── голос: ответ голосом на голосовое (OpenAI TTS)

async function sendVoiceReply(token: string, chatId: number, thread: number, text: string, replyTo: number) {
  const key = await getSetting("STT_API_KEY");
  if (!key?.startsWith("sk-")) return false;
  for (const model of ["gpt-4o-mini-tts", "tts-1"]) {
    try {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, voice: "onyx", input: text.slice(0, 900), response_format: "opus" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) continue;
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("message_thread_id", String(thread));
      form.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
      form.append("voice", new Blob([await r.arrayBuffer()], { type: "audio/ogg" }), "voice.ogg");
      const sent = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
      if (sent.ok) {
        await remember(thread, { who: "бот", text: `🎤 ${text}`, at: Date.now(), bot: true });
        return true;
      }
    } catch (e) {
      console.error("tg tts", e);
    }
  }
  return false;
}

// ── сбор лобби из чата

async function startGather(token: string, chatId: number, thread: number, mode: string, starter?: TgUser) {
  const s = await st();
  // уже идёт сбор в этой теме — не плодим
  if (Object.values(s.gathers).some((g) => g.thread === thread && !g.done && Date.now() - g.at < 3 * 3600_000)) return;
  const need = GATHER_NEED[mode] ?? 10;
  const id = Math.random().toString(36).slice(2, 8);
  const users: Record<string, string> = starter ? { [starter.id]: nameOf(starter) } : {};
  const r = await tgCall<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    message_thread_id: thread,
    text: gatherText(mode, need, users),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "✋ Я в деле", callback_data: `gather:${id}:in` }, { text: "Передумал", callback_data: `gather:${id}:out` }]] },
  });
  if (!r.ok || !r.result) return;
  s.gathers[id] = { mode, need, chat: chatId, thread, msgId: r.result.message_id, users, at: Date.now() };
  save();
}

function gatherText(mode: string, need: number, users: Record<string, string>) {
  const list = Object.values(users);
  return `🎮 <b>Собираем ${mode.replace("x", "×")}</b> — ${list.length}/${need}\n${list.length ? list.map((n, i) => `${i + 1}. ${tgEscape(n)}`).join("\n") : "Пока никого — жми кнопку!"}`;
}

/** Нажатие «Я в деле» / «Передумал». true — нажатие наше */
export async function onBuddyCallback(token: string, cb: TgCallback) {
  const m = /^gather:([a-z0-9]+):(in|out)$/.exec(cb.data ?? "");
  if (!m) return false;
  const s = await st();
  const g = s.gathers[m[1]];
  if (!g || g.done) {
    await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: "Сбор уже закрыт" });
    return true;
  }
  if (m[2] === "in") g.users[cb.from.id] = nameOf(cb.from);
  else delete g.users[cb.from.id];
  const full = Object.keys(g.users).length >= g.need;
  await tgCall(token, "editMessageText", {
    chat_id: g.chat,
    message_id: g.msgId,
    text: gatherText(g.mode, g.need, g.users) + (full ? "\n\n✅ Собрались!" : ""),
    parse_mode: "HTML",
    ...(full ? {} : { reply_markup: { inline_keyboard: [[{ text: "✋ Я в деле", callback_data: `gather:${m[1]}:in` }, { text: "Передумал", callback_data: `gather:${m[1]}:out` }]] } }),
  });
  await tgCall(token, "answerCallbackQuery", { callback_query_id: cb.id, text: m[2] === "in" ? "Записал!" : "Убрал из списка" });
  if (full) {
    g.done = true;
    const mentions = Object.entries(g.users).map(([uid, n]) => `<a href="tg://user?id=${uid}">${tgEscape(n)}</a>`).join(", ");
    await tgCall(token, "sendMessage", {
      chat_id: g.chat,
      message_thread_id: g.thread,
      parse_mode: "HTML",
      text: `🔥 ${g.mode.replace("x", "×")} собран: ${mentions}\nКто-нибудь один создаёт лобби на сайте и кидает код сюда — остальные заходят по коду. В клубе — нулевой пинг 😎`,
      reply_markup: { inline_keyboard: [[{ text: "Создать лобби", url: `${SITE_URL}/lobbies` }]] },
    });
  }
  save();
  return true;
}

// ── входящее сообщение в теме с ботом

const ADDRESS = /^\s*(бот|ботик|ботяра|f16|ф16)\b[\s,!:]*/i;

export async function onTalkMessage(token: string, msg: TgMessage, t: TalkThread, admin: boolean, wasDeleted: boolean) {
  // анонимный админ пишет от имени группы: from — служебный бот Telegram
  const anon = msg.sender_chat?.id === msg.chat.id;
  if (anon) {
    msg = { ...msg, from: { id: 1087968824, first_name: "Админ" } };
    admin = true;
  }
  if (!msg.from || (msg.from.is_bot && !anon)) return;
  const botId = Number(token.split(":")[0]);
  const repliedTo = msg.reply_to_message && msg.reply_to_message.message_id !== msg.message_thread_id ? msg.reply_to_message : null;
  const toBot = repliedTo?.from?.id === botId;

  // голосовое, адресованное боту (ответом на его сообщение) — расшифровываем, ответим голосом
  let text = (msg.text ?? msg.caption ?? "").trim();
  let voice = false;
  if (!text && msg.voice && toBot && msg.voice.duration <= 60) {
    const { transcribe } = await import("./tg-moderation");
    text = (await transcribe(token, msg.voice.file_id, "voice.ogg")) ?? "";
    voice = !!text;
  }
  if (!text || text.startsWith("/")) return;
  await remember(t.id, { who: nameOf(msg.from), uid: msg.from.id, text: (voice ? "🎤 " : "") + text.slice(0, 500), at: Date.now(), id: msg.message_id });
  if (wasDeleted || findViolation(text)) return;

  const username = (await getSetting("TELEGRAM_BOT_USERNAME"))?.replace(/^@/, "") ?? "";
  const mentioned = (!!username && text.toLowerCase().includes(`@${username.toLowerCase()}`)) || ADDRESS.test(text);
  const question = /\?/.test(text);
  const s = await st();

  let mode: "direct" | "question" | "join" | null = null;
  if (toBot || mentioned) mode = "direct";
  else if (t.role === "quiet") return;
  else if (question && (t.role === "tournaments" || t.role === "help" || t.role === "lobby")) mode = "question";
  else if ((t.role === "banter" || t.role === "teammates" || t.role === "lobby") && Date.now() - (s.lastBot[t.id] ?? 0) > JOIN_GAP_MS && Math.random() < JOIN_CHANCE) mode = "join";
  if (!mode) return;
  if (admin && mode !== "direct") return;
  if (!budget(mode === "join" ? undefined : msg.from.id)) return;

  void tgCall(token, "sendChatAction", { chat_id: msg.chat.id, message_thread_id: t.id, action: voice ? "record_voice" : "typing" });
  const tours = await tournamentsContext();
  const recentUids = (s.history[t.id] ?? []).slice(-PROMPT_LINES).map((l) => l.uid).filter((u): u is number => !!u);
  const [asker, stats, people] = await Promise.all([askerContext(msg.from.id, tours.ids), t.role === "banter" || t.role === "teammates" ? statsLine(msg.from.id) : Promise.resolve(""), peopleLine([msg.from.id, ...recentUids])]);
  const situation =
    mode === "direct"
      ? `${nameOf(msg.from)} обращается к тебе${voice ? " голосовым (ответ прозвучит голосом — пиши так, как говорят вслух, без ссылок и эмодзи)" : ""}${repliedTo && !voice ? ` (отвечает на «${String(repliedTo.text ?? repliedTo.caption ?? "").slice(0, 300)}»)` : ""}. Ответь ему.`
      : mode === "question"
        ? `${nameOf(msg.from)} задал вопрос. Если он к организаторам/про сайт — ответь; если игроки спрашивают друг друга о своём — SKIP.`
        : "Никто к тебе не обращался. Вступи в разговор, только если можешь добавить что-то живое и уместное (шутка, поддержка, подсказка, вопрос). Иначе — SKIP.";
  const reply = await ask(
    await topicLine(t),
    `Последние сообщения темы:\n${await transcript(t.id)}\n\n${people}\n\nО собеседнике: ${asker}\n${stats}\n\n${situation}\nПоследнее сообщение — от ${nameOf(msg.from)}: «${text.slice(0, 1500)}»`,
  );
  if (!reply) return;
  const tags = parseTags(reply);
  let sentText: string | null = null;
  if (voice && tags.text && (await sendVoiceReply(token, msg.chat.id, t.id, tags.text, msg.message_id))) sentText = tags.text;
  else sentText = (await send(token, msg.chat.id, t.id, tags.text, mode === "join" ? undefined : msg.message_id))?.text ?? null;
  if (tags.gather && (t.role === "banter" || t.role === "lobby" || t.role === "teammates")) await startGather(token, msg.chat.id, t.id, tags.gather, msg.from);
  if (sentText) await audit(null, "telegram.talk", undefined, { thread: t.name, mode, user: String(msg.from.id), name: nameOf(msg.from), text: text.slice(0, 500), answer: sentText.slice(0, 1000), org: tags.org || null }).catch(() => {});
}

// ── турнир: живые события матчей в «Общение» и прогнозы

type MatchInfo = { id: string; team1: { id: string; name: string } | null; team2: { id: string; name: string } | null; tournament: { name: string } | null; number: number | null };

async function matchInfo(matchId: string): Promise<MatchInfo | null> {
  const { data } = await db()
    .from("matches")
    .select("id, number, team1:teams!matches_team1_id_fkey(id, name), team2:teams!matches_team2_id_fkey(id, name), tournament:tournaments(name)")
    .eq("id", matchId)
    .maybeSingle();
  return (data as unknown as MatchInfo | null) ?? null;
}

export type TourEvent =
  | { kind: "map_start"; matchId: string; mapNumber: number; map: string | null }
  | { kind: "round"; matchId: string; mapNumber: number; s1: number; s2: number }
  | { kind: "map_end"; matchId: string; mapNumber: number; map: string | null; s1: number; s2: number; winner: 1 | 2 | null }
  | { kind: "series_end"; matchId: string; winner: 1 | 2 | null; s1: number; s2: number };

/** Событие матча турнира (из MatchZy) → пара строк в «Общение», прогноз до старта, итоги прогноза */
export async function tournamentEvent(ev: TourEvent) {
  const { telegramConfig, telegramGroup } = await import("./telegram");
  const [cfg, group] = await Promise.all([telegramConfig(), telegramGroup()]);
  if (!cfg.token || !group.id) return;
  const banter = (await talkThreads()).find((t) => t.role === "banter");
  if (!banter) return;
  const s = await st();
  const once = (key: string) => {
    const list = (s.events[ev.matchId] ??= []);
    if (list.includes(key)) return false;
    list.push(key);
    save();
    return true;
  };
  const m = await matchInfo(ev.matchId);
  if (!m?.team1 || !m.team2) return;
  if ((ev.kind === "map_start" || ev.kind === "map_end") && !ev.map) {
    const { data: mm } = await db().from("match_maps").select("map_name").eq("match_id", ev.matchId).eq("map_number", ev.mapNumber).maybeSingle();
    ev = { ...ev, map: mm?.map_name ?? null };
  }
  const t1 = m.team1.name, t2 = m.team2.name;

  // прогноз: с началом первой карты, закрывается после 3-го раунда
  if (ev.kind === "map_start" && ev.mapNumber === 1 && once("poll")) {
    const r = await tgCall<{ message_id: number; poll?: { id: string } }>(cfg.token, "sendPoll", {
      chat_id: group.id,
      message_thread_id: banter.id,
      question: `🔮 Прогноз: кто выиграет ${t1} vs ${t2}?`,
      options: [{ text: t1 }, { text: t2 }],
      is_anonymous: false,
    });
    if (r.ok && r.result?.poll) {
      s.polls[r.result.poll.id] = { matchId: ev.matchId, chat: group.id, thread: banter.id, msgId: r.result.message_id, teams: [m.team1, m.team2], votes: {} };
      s.matchPoll[ev.matchId] = r.result.poll.id;
      save();
    }
  }
  if (ev.kind === "round" && ev.s1 + ev.s2 >= 3) {
    const pid = s.matchPoll[ev.matchId];
    const p = pid ? s.polls[pid] : null;
    if (p && !p.closed) {
      p.closed = true;
      await tgCall(cfg.token, "stopPoll", { chat_id: p.chat, message_id: p.msgId });
      save();
    }
  }

  // что сказать: только яркое и не чаще нескольких сообщений за матч
  let fact: string | null = null;
  if (ev.kind === "map_start" && once(`start${ev.mapNumber}`)) fact = `Стартовала карта ${ev.mapNumber}${ev.map ? ` (${ev.map.replace(/^de_/, "")})` : ""}: ${t1} vs ${t2}${m.tournament ? `, турнир «${m.tournament.name}»` : ""}.`;
  if (ev.kind === "round") {
    const [hi, lo] = ev.s1 >= ev.s2 ? [ev.s1, ev.s2] : [ev.s2, ev.s1];
    const leader = ev.s1 >= ev.s2 ? t1 : t2;
    if (hi === 12 && lo < 12 && once(`mp${ev.mapNumber}`)) fact = `Матч-поинт у ${leader}: ${ev.s1}:${ev.s2} на карте ${ev.mapNumber}.`;
    else if (hi === 12 && lo === 12 && once(`ot${ev.mapNumber}`)) fact = `Овертайм! ${t1} ${ev.s1}:${ev.s2} ${t2}.`;
    else if (hi - lo >= 7 && lo <= 2 && hi >= 8 && once(`stomp${ev.mapNumber}`)) fact = `${leader} разносит: ${ev.s1}:${ev.s2}.`;
  }
  if (ev.kind === "map_end" && once(`end${ev.mapNumber}`)) fact = `${ev.winner === 1 ? t1 : ev.winner === 2 ? t2 : "?"} забирает карту ${ev.mapNumber}${ev.map ? ` (${ev.map.replace(/^de_/, "")})` : ""}: ${t1} ${ev.s1}:${ev.s2} ${t2}.`;
  if (ev.kind === "series_end" && once("series")) {
    const winner = ev.winner === 1 ? m.team1 : ev.winner === 2 ? m.team2 : null;
    fact = `Матч окончен: ${winner?.name ?? "?"} проходит дальше (${t1} ${ev.s1}:${ev.s2} ${t2}).`;
    // итоги прогноза
    const pid = s.matchPoll[ev.matchId];
    const p = pid ? s.polls[pid] : null;
    if (p && winner) {
      const opt = p.teams.findIndex((x) => x.id === winner.id);
      const right = Object.entries(p.votes).filter(([, v]) => v.opt === opt);
      const total = Object.keys(p.votes).length;
      if (total) {
        const names = right.slice(0, 15).map(([uid, v]) => `<a href="tg://user?id=${uid}">${tgEscape(v.name)}</a>`).join(", ");
        await tgCall(cfg.token, "sendMessage", {
          chat_id: p.chat,
          message_thread_id: p.thread,
          parse_mode: "HTML",
          text: right.length ? `🔮 Угадали ${right.length} из ${total}: ${names}${right.length > 15 ? " и другие" : ""} — красавчики!` : `🔮 Никто из ${total} не угадал — ${tgEscape(winner.name)} всех удивили 😅`,
        });
      }
    }
  }
  if (!fact || !budget()) return;
  const line = await ask(
    await topicLine(banter),
    `Идёт турнир. Событие: ${fact}\nНапиши в чат одно короткое живое сообщение об этом, как болельщик из клуба (без подколов игроков по личному, без ставок). Факты не меняй.`,
  );
  await send(cfg.token, group.id, banter.id, line ? parseTags(line).text : `🔥 ${fact}`);
}

/** Голос в прогнозе (poll_answer) */
export async function onPollAnswer(pa: { poll_id: string; user?: TgUser; option_ids: number[] }) {
  const s = await st();
  const p = s.polls[pa.poll_id];
  if (!p || !pa.user) return;
  if (!pa.option_ids.length) delete p.votes[pa.user.id];
  else p.votes[pa.user.id] = { opt: pa.option_ids[0], name: nameOf(pa.user) };
  save();
}

// ── фоновые задачи: бот сам начинает разговор, отчёт админам, подписка на голоса в прогнозах

async function freshNews() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const lines: string[] = [];
  const { data: games } = await db().from("lobby_games").select("id").gte("created_at", since).limit(100);
  if (games?.length) lines.push(`За сутки в лобби клуба сыграно карт: ${games.length}.`);
  const { data: an } = await db().from("demo_analyses").select("title, score_a, score_b, team_a, team_b").eq("kind", "match").gte("created_at", since).order("created_at", { ascending: false }).limit(5);
  for (const a of an ?? []) lines.push(`Сыграна карта: ${a.team_a} ${a.score_a}:${a.score_b} ${a.team_b} (повтор и разбор — на сайте, «Разбор игры»).`);
  const { data: teams } = await db().from("teams").select("name").gte("created_at", since).eq("is_solo", false).limit(10);
  if (teams?.length) lines.push(`Новые команды за сутки: ${teams.map((x) => x.name).join(", ")}.`);
  return lines.join("\n") || "Свежих событий за сутки нет.";
}

let webhookChecked = 0;
/** Голоса в прогнозах приходят только если вебхук подписан на poll_answer — дописываем подписку сами (тот же адрес и секрет) */
async function ensurePollUpdates(token: string, secret: string) {
  if (Date.now() - webhookChecked < 3600_000) return;
  webhookChecked = Date.now();
  const info = await tgCall<{ url?: string; allowed_updates?: string[] }>(token, "getWebhookInfo", {});
  const url = info.result?.url;
  if (!url || !secret || info.result?.allowed_updates?.includes("poll_answer")) return;
  await tgCall(token, "setWebhook", { url, secret_token: secret, allowed_updates: TG_ALLOWED_UPDATES, drop_pending_updates: false });
}

/** Вызывается из фоновых задач сайта (раз в несколько минут) */
export async function talkOpenTick() {
  const { telegramConfig, telegramGroup } = await import("./telegram");
  const [cfg, group] = await Promise.all([telegramConfig(), telegramGroup()]);
  if (!cfg.token || !group.id) return;
  await ensurePollUpdates(cfg.token, cfg.secret).catch(() => {});
  const s = await st();
  const threads = await talkThreads();
  const hour = hourNow();

  // отчёт админам — раз в день в 22:00
  const today = new Date().toLocaleDateString("ru-RU", { timeZone: TZ });
  if (hour === 22 && s.reportDay !== today) {
    s.reportDay = today;
    save();
    await dailyReport(cfg.token, threads).catch((e) => console.error("tg report", e));
  }

  if (hour < 12 || hour >= 22) return;
  for (const t of threads.filter((x) => x.role === "banter" || x.role === "teammates")) {
    const lastB = s.lastBot[t.id] ?? started;
    const quietSince = Math.max(s.lastHuman[t.id] ?? started, lastB);
    if (Date.now() - quietSince < OPEN_QUIET_MS || Date.now() - lastB < OPEN_GAP_MS) continue;
    if (!budget()) return;
    const reply = await ask(
      await topicLine(t),
      `В теме давно тихо. Начни разговор сам — одно живое сообщение, как участник чата: вопрос к людям, повод зайти в клуб или собрать лобби, подогрей интерес к турниру (сколько дней осталось, сколько команд), отметь свежую игру. Не повторяй свои прошлые сообщения.\n\nСвежие события:\n${await freshNews()}\n\n${await peopleLine([])}\n\nПоследние сообщения темы:\n${(await transcript(t.id)) || "—"}`,
    );
    s.lastBot[t.id] = Date.now(); // даже если промолчал — не дёргать модель каждый тик
    save();
    if (!reply) continue;
    const tags = parseTags(reply);
    const sent = await send(cfg.token, group.id, t.id, tags.text);
    if (tags.gather) await startGather(cfg.token, group.id, t.id, tags.gather);
    if (sent) await audit(null, "telegram.talk", undefined, { thread: t.name, mode: "open", answer: sent.text.slice(0, 1000) }).catch(() => {});
  }
}

/** Отчёт админам в личку: о чём говорили, что спрашивали, что бот не смог ответить, кого наказали */
async function dailyReport(token: string, threads: TalkThread[]) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: logs } = await db()
    .from("audit_logs")
    .select("action, payload, created_at")
    .in("action", ["telegram.talk", "telegram.faq", "tg.warn", "tg.mute", "tg.ban"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(400);
  const list = (logs ?? []) as { action: string; payload: Record<string, unknown> | null }[];
  const count = (a: string) => list.filter((l) => l.action === a).length;
  const org = list.filter((l) => (l.action === "telegram.talk" && l.payload?.org) || (l.action === "telegram.faq" && /передал|организатор/i.test(String(l.payload?.answer ?? "")))).map((l) => `«${String(l.payload?.text ?? l.payload?.question ?? "").slice(0, 150)}»`);
  const punished = list.filter((l) => l.action !== "telegram.talk" && l.action !== "telegram.faq").map((l) => `${l.action === "tg.warn" ? "предупреждение" : l.action === "tg.mute" ? "мут" : "бан"}: ${l.payload?.name ?? l.payload?.user} — ${l.payload?.reason ?? ""}${l.payload?.by === "ИИ" ? " (ИИ)" : ""}`);
  const s = await st();
  const chat = threads.map((t) => `== ${t.name}\n${(s.history[t.id] ?? []).filter((l) => l.at > Date.now() - 86_400_000).slice(-40).map((l) => `${l.bot ? "бот" : l.who}: ${l.text}`).join("\n")}`).join("\n\n");
  const summary = await ask(
    "Это не чат: ты пишешь короткий отчёт для админов клуба.",
    `Сделай отчёт за сутки по чату игроков (5–8 пунктов, простым текстом): о чём говорили, что волнует игроков перед турниром, какие вопросы повторяются, на что жалуются, что стоит объявить или поправить. Без выдумок.\n\nВопросы без ответа: ${org.join("; ") || "нет"}\n\nСообщения:\n${chat.slice(0, 20_000)}`,
  );
  const text = [
    `📋 Отчёт чата за сутки (${dayStr(Date.now())})`,
    `Бот ответил: ${count("telegram.talk") + count("telegram.faq")} раз · предупреждений ${count("tg.warn")}, мутов ${count("tg.mute")}, банов ${count("tg.ban")}`,
    summary ? `\n${parseTags(summary).text}` : "",
    org.length ? `\n❓ Бот не знал ответа:\n${org.slice(0, 10).join("\n")}` : "",
    punished.length ? `\n🛡 Наказания:\n${punished.slice(0, 15).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  const { data } = await db().from("player_profiles").select("telegram_chat_id, player:players!player_profiles_player_id_fkey(is_admin)").not("telegram_chat_id", "is", null);
  const chats = ((data ?? []) as unknown as { telegram_chat_id: number; player: { is_admin: boolean } | null }[]).filter((r) => r.player?.is_admin).map((r) => r.telegram_chat_id);
  await Promise.allSettled(chats.map((c) => tgCall(token, "sendMessage", { chat_id: c, text: text.slice(0, 4000), disable_web_page_preview: true })));
}
