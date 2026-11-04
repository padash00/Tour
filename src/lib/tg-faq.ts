import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { audit } from "./audit";
import { eloAverage } from "./data";
import { getSetting } from "./settings";
import { db } from "./supabase";
import { SITE_URL, tgCall } from "./telegram";
import { findViolation } from "./tg-moderation-core";
import type { TgMessage } from "./tg-moderation";

/**
 * ИИ-помощник в общем Telegram-чате: отвечает на вопросы игроков о турнирах в темах, где админ написал /faq.
 * Знает данные турниров с сайта, регламент и разъяснения организаторов; если игрок подтвердил Telegram —
 * его команду и статус заявки. Не знает ответа — так и говорит. Ключ — ANTHROPIC_API_KEY в «Настройках».
 */

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = 400;
const USER_GAP_MS = 20_000;

const TZ = "Asia/Almaty";
const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

const STATUS: Record<string, string> = {
  registration: "идёт приём заявок",
  registration_closed: "приём заявок закрыт",
  checkin: "идёт check-in",
  live: "турнир идёт",
  finished: "завершён",
};
const REG_STATUS: Record<string, string> = { pending: "на рассмотрении", approved: "одобрена", rejected: "отклонена", withdrawn: "отозвана" };

const INSTRUCTIONS = `Ты — помощник организаторов турниров по CS2 компьютерного клуба F16 Arena (Усть-Каменогорск / Өскемен). Ты отвечаешь игрокам в Telegram-чате F16 Arena Community.

Как отвечать:
- Отвечай на языке вопроса: по-русски или по-казахски.
- Коротко и по делу: 1–5 предложений, простым текстом без Markdown (без звёздочек и решёток). Можно эмодзи, ссылку на сайт.
- Опирайся ТОЛЬКО на данные ниже (страница турнира, регламент, разъяснения организаторов, данные игрока). Ничего не выдумывай: дат, правил, призов, решений.
- Если ответа в данных нет или вопрос требует решения организатора (одобрить заявку, сделать исключение, поменять правила, спор о результате) — скажи, что передал вопрос организаторам и они ответят здесь, и добавь в самом конце ответа отдельной строкой метку [ORG] (её увидят только организаторы). Не обещай одобрения и исключений.
- Про другие команды и игроков сообщай только публичное (название команды, статус заявки). Никаких личных данных (ФИО, телефоны, даты рождения).
- Если сообщение — не вопрос к организаторам (болтовня, приветствие, поиск тиммейтов, объявление, шутка, спор игроков между собой), ответь ровно одним словом: SKIP

Разъяснения организаторов (действуют вместе с регламентом):
- Сайт турниров: ${SITE_URL}. Информация на странице турнира — официальная.
- Как участвовать: войти на сайт через Steam → заполнить анкету (ФИО, дата рождения, телефон, место учёбы или работы) → капитан создаёт команду и приглашает игроков по ссылке → капитан подаёт заявку на турнир.
- Заявок больше, чем мест. Команды отбираются по среднему FACEIT ELO основного состава: сумма ELO 5 игроков основы делится на 5, игрок без FACEIT или без калибровки считается как 0. Средний ELO видно на странице команды на сайте. Решение о допуске принимают организаторы, статус заявки виден на странице турнира.
- Документы на каждого игрока (бумагой): учащимся — ТОЛЬКО справка с места учёбы, студенческий билет НЕ нужен (решение организаторов, это важнее п. 3.4 регламента); работающим — справка с места работы; тем, кто не учится и не работает, — удостоверение личности. Справку с места учёбы обычно выдаёт деканат/учебная часть, во многих вузах её можно заказать через eGov или личный кабинет студента.
- Куда сдавать документы и подписанную заявку: можно оставить администратору компьютерного клуба F16 Arena (г. Усть-Каменогорск, ул. 30 Гвардейской дивизии, 24/1) в любое время работы клуба, до 13 ноября 22:00.
- Печатная заявка (Приложение №1): после одобрения команды капитан скачивает её на сайте (раздел «Моё» или страница турнира → «Заявка»), распечатывает, подписывает у руководителя организации, ставит печать (если есть) и приносит организатору вместе с документами игроков.
- Форма одежды не обязательна: единая командная форма — по желанию, приходить можно в обычной одежде (пункт регламента о форме не требуется).
- Prime-статус в CS2 не важен — можно и без Prime. Главное: играть со своего личного Steam-аккаунта, с которого игрок зарегистрирован на сайте. Менять аккаунт нельзя, играть под чужим аккаунтом запрещено (п. 2.6 регламента). Новый аккаунт создавать не нужно.
- Участник должен проживать, учиться или работать именно в г. Усть-Каменогорске. Прописка в другом населённом пункте ВКО (области) НЕ подходит. Временная прописка (временная регистрация) в Усть-Каменогорске тоже НЕ подходит — нужна постоянная прописка в городе, либо справка с места учёбы или работы в Усть-Каменогорске. Вместо справки с места прописки (адресной справки) можно принести удостоверение личности — организаторы его принимают.
- Запасные игроки разрешены (решение организаторов, это важнее п. 2.3 регламента): 5 игроков основы и до 2 запасных. Запасной вписывается в состав команды на сайте и сдаёт такие же документы, как основные игроки. На средний ELO команды запасные не влияют — считается только основа.
- Команда может участвовать и без вуза/предприятия — как молодёжное объединение или инициативная группа (п. 2.2 регламента). Детали оформления в таком случае — уточнить у организаторов в теме «Помощь».
- Срок подачи заявок и документов — указан на странице турнира ниже (если в тексте регламента другая дата, верна дата на странице турнира).
- Состав команды правит капитан на сайте; когда команда подала заявку на официальный турнир, состав, название и тег меняют только организаторы — нужно написать им.
- Чат: темы «Объявления» (только организаторы), «Турниры», «Поиск тиммейтов», «Лобби», «Общение», «Помощь», «Купля-продажа» (только объявления #продаю / #куплю / #обмен), «Идеи и предложения» (только с #идея), «Матчи турнира». Мат, оскорбления и реклама запрещены — бот выдаёт предупреждения.
- Тема «Матчи турнира» (закрыта, пишет только бот): в день турнира бот сообщает, какая команда за какими ПК садится, и держит в закрепе табло «Зал сейчас» — кто где сидит и что сейчас идёт (садятся, бан-пик, игра, счёт). Игроки, у кого Telegram подтверждён на сайте, отмечены в сообщении и получают уведомление в личку.
- Рассадка в клубе: одна команда — один блок ПК (ПК 1–5, 6–10 … 26–30 в зоне Standart Premium; 31–36, 37–41, 42–47, 48–53 в зоне Standart). Места назначает платформа автоматически, соперники всегда сидят далеко друг от друга, чтобы не слышать коллы и не видеть экраны. Самим пересаживаться нельзя — только по сообщению бота. Команда, которая выиграла, обычно остаётся на своих ПК. Свои ПК видны и на странице матча на сайте (схема зала, ваши места подсвечены).
- Порядок матча в клубе: пришло сообщение — команда садится за свои ПК и входит в свой Steam → капитан на странице матча на сайте нажимает «Команда села — Готов» → бан-пик начинается, когда готовы оба капитана, или сам через 10 минут после вызова (кто не успел — за того карты банятся автоматически, 60 секунд на ход) → сервер, подключение, игра. Между матчами у команды не меньше 10 минут перерыва.`;

// ── данные турниров с сайта

let toursCache: { at: number; value: { text: string; ids: string[] } } | null = null;
/** Данные турниров — кэш на минуту: вопросы идут пачками, база не дёргается на каждый */
async function tournamentsContext() {
  if (toursCache && Date.now() - toursCache.at < 60_000) return toursCache.value;
  const value = await loadTournamentsContext();
  toursCache = { at: Date.now(), value };
  return value;
}

async function loadTournamentsContext() {
  const { data } = await db()
    .from("tournaments")
    .select("id, name, slug, status, format, is_lan, is_official, starts_at, checkin_opens_at, checkin_closes_at, registration_closes_at, location, city, max_teams, entry_fee, prize_pool, description, requirements, rules")
    .in("status", ["registration", "registration_closed", "checkin", "live"])
    .order("starts_at", { ascending: true })
    .limit(3);
  const list = data ?? [];
  if (!list.length) return { text: "Сейчас нет открытых турниров. Анонсы — в теме «Объявления» и на сайте.", ids: [] as string[] };
  const parts: string[] = [];
  for (const t of list) {
    const { data: regs } = await db().from("tournament_registrations").select("status").eq("tournament_id", t.id);
    const count = (s: string) => (regs ?? []).filter((r) => r.status === s).length;
    parts.push(
      [
        `### Турнир «${t.name}» — ${STATUS[t.status] ?? t.status}`,
        `Страница: ${SITE_URL}/tournaments/${t.slug}`,
        `Формат: ${t.format}, ${t.is_lan ? "LAN в клубе F16 Arena" : "онлайн"}${t.is_official ? ", официальный турнир" : ""}${t.location || t.city ? `, место: ${[t.location, t.city].filter(Boolean).join(", ")}` : ""}`,
        `Приём заявок до: ${when(t.registration_closes_at)}`,
        `Регистрация у судей (check-in): ${when(t.checkin_opens_at)} — ${when(t.checkin_closes_at)}`,
        `Начало матчей: ${when(t.starts_at)}`,
        `Мест: ${t.max_teams}; заявок одобрено ${count("approved")}, на рассмотрении ${count("pending")}`,
        t.entry_fee ? `Взнос: ${t.entry_fee}` : "",
        t.prize_pool ? `Призовой фонд: ${t.prize_pool}` : "",
        t.description ? `Описание:\n${t.description}` : "",
        t.requirements ? `Требования:\n${t.requirements}` : "",
        t.rules ? `Регламент:\n${String(t.rules).slice(0, 30_000)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return { text: parts.join("\n\n"), ids: list.map((t) => t.id) };
}

/** Кто спрашивает: если Telegram подтверждён на сайте — ник, команда, заявки */
async function askerContext(tgUserId: number, tournamentIds: string[]) {
  const { data: prof } = await db().from("player_profiles").select("player_id, player:players!player_profiles_player_id_fkey(nickname, faceit_elo)").eq("telegram_chat_id", tgUserId).maybeSingle();
  const p = prof as { player_id: string; player: { nickname: string; faceit_elo: number | null } | null } | null;
  if (!p) return "Спрашивающий не подтвердил Telegram на сайте — его команду и заявку не видно. Если нужен статус заявки, пусть посмотрит на странице турнира или подтвердит Telegram в анкете.";
  const lines = [`Спрашивающий — игрок сайта «${p.player?.nickname ?? "?"}», FACEIT ELO: ${p.player?.faceit_elo ?? "нет / без калибровки"}.`];
  const { data: m } = await db().from("team_members").select("role, team:teams(id, name, tag)").eq("player_id", p.player_id).is("left_at", null).eq("is_solo", false).maybeSingle();
  const team = (m as { role: string; team: { id: string; name: string; tag: string } | null } | null)?.team;
  if (!team) {
    lines.push("В команде не состоит.");
    return lines.join(" ");
  }
  lines.push(`Команда: ${team.name} [${team.tag}], роль: ${m!.role === "captain" ? "капитан" : m!.role === "substitute" ? "запасной" : "основа"}.`);
  const { data: members } = await db().from("team_members").select("role, player:players(faceit_elo)").eq("team_id", team.id).is("left_at", null);
  const mains = ((members ?? []) as unknown as { role: string; player: { faceit_elo: number | null } | null }[]).filter((x) => x.role !== "substitute");
  lines.push(`Средний ELO основы: ${eloAverage(mains.map((x) => x.player?.faceit_elo)) ?? "нет данных"} (${mains.length} в основе).`);
  if (tournamentIds.length) {
    const { data: regs } = await db().from("tournament_registrations").select("status, note, tournament:tournaments(name)").eq("team_id", team.id).in("tournament_id", tournamentIds);
    for (const r of (regs ?? []) as unknown as { status: string; note: string | null; tournament: { name: string } | null }[]) {
      lines.push(`Заявка на «${r.tournament?.name}»: ${REG_STATUS[r.status] ?? r.status}${r.note ? ` (комментарий: ${r.note})` : ""}.`);
    }
    if (!(regs ?? []).length) lines.push("Заявок на текущие турниры у команды нет.");
  }
  return lines.join(" ");
}

// ── ограничения

let day = "";
let usedToday = 0;
const lastAsk = new Map<number, number>();
function allowed(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    usedToday = 0;
  }
  if (usedToday >= DAILY_LIMIT) return false;
  const last = lastAsk.get(userId) ?? 0;
  if (Date.now() - last < USER_GAP_MS) return false;
  lastAsk.set(userId, Date.now());
  usedToday++;
  return true;
}

/** Похоже ли сообщение на вопрос — чтобы не звать модель на каждое «ок» */
function looksLikeQuestion(text: string) {
  const t = text.trim().toLowerCase();
  if (t.length < 8 || t.startsWith("/")) return false;
  return /\?/.test(t) || /^(как|когда|где|что|кто|сколько|можно|нужно|надо|почему|зачем|какой|какая|какие|куда|есть ли|подскажите|скажите|а если|қашан|қалай|қайда|не\b|неше|кім|бола ма|керек пе)/i.test(t);
}

/** Ответ помощника без отправки в Telegram (проверка из пульта / скрипта) */
export async function previewAnswer(question: string, tgUserId?: number) {
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) return { error: "нет ключа ANTHROPIC_API_KEY" };
  const tours = await tournamentsContext();
  const asker = tgUserId ? await askerContext(tgUserId, tours.ids) : "Спрашивающий не подтвердил Telegram на сайте.";
  const answer = await askClaude(apiKey, tours.text, asker, "", question);
  return { answer };
}

async function askClaude(apiKey: string, toursText: string, asker: string, replied: string, text: string) {
  const client = new Anthropic({ apiKey });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Данные с сайта на ${when(new Date().toISOString())}:

${toursText}` },
    ],
    messages: [
      {
        role: "user",
        content: `${asker}
${replied ? `Игрок отвечает на сообщение: «${replied.slice(0, 1000)}»
` : ""}
Вопрос игрока:
${text.slice(0, 2000)}`,
      },
    ],
  });
  if (res.stop_reason === "refusal") return "";
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Ответить на вопрос в теме с помощником (вызывать после модерации; сообщения админов не трогаем) */
export async function answerQuestion(token: string, msg: TgMessage, faqThreads: number[], isAdmin: boolean) {
  let text = (msg.text ?? msg.caption ?? "").trim();
  if (!msg.from || msg.from.is_bot) return;
  if (!msg.is_topic_message || !msg.message_thread_id || !faqThreads.includes(msg.message_thread_id)) return;
  // админам помощник не отвечает, кроме проверки: /ask вопрос
  const ask = /^\/ask(?:@\w+)?\s+([\s\S]+)/i.exec(text);
  if (isAdmin && !ask) return;
  if (ask) text = ask[1].trim();
  else if (!looksLikeQuestion(text) || findViolation(text)) return;
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await audit(null, "telegram.faq_error", undefined, { reason: "нет ключа ANTHROPIC_API_KEY" });
    return;
  }
  if (!ask && !allowed(msg.from.id)) return;

  // «печатает…» сразу — игрок видит, что ответ идёт
  void tgCall(token, "sendChatAction", { chat_id: msg.chat.id, message_thread_id: msg.message_thread_id, action: "typing" });
  const tours = await tournamentsContext();
  const asker = await askerContext(msg.from.id, tours.ids);
  // ответ, на который реагирует игрок, — для контекста «а это как?»
  const replied = msg.reply_to_message && msg.reply_to_message.message_id !== msg.message_thread_id ? (msg.reply_to_message.text ?? msg.reply_to_message.caption ?? "") : "";

  let answer = "";
  try {
    answer = await askClaude(apiKey, tours.text, asker, replied, text);
  } catch (e) {
    const reason =
      e instanceof Anthropic.AuthenticationError
        ? "неверный ключ ANTHROPIC_API_KEY"
        : e instanceof Anthropic.RateLimitError
          ? "лимит Claude API"
          : e instanceof Anthropic.APIError
            ? `Claude API ${e.status}: ${e.message}`
            : String(e instanceof Error ? e.message : e);
    console.error("tg faq", reason);
    await audit(null, "telegram.faq_error", undefined, { reason: reason.slice(0, 500), question: text.slice(0, 300) }).catch(() => {});
    return;
  }
  if (!answer || /^SKIP\b/i.test(answer)) return;
  // [ORG] — бот не знает ответа: убираем метку и пишем организаторам в личку
  const toOrganizers = /\[ORG\]/i.test(answer);
  answer = answer.replace(/\s*\[ORG\]\s*/gi, "").trim();

  await tgCall(token, "sendMessage", {
    chat_id: msg.chat.id,
    message_thread_id: msg.message_thread_id,
    text: `🤖 ${answer.slice(0, 3500)}`,
    disable_web_page_preview: true,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
  });
  if (toOrganizers) await tellOrganizers(token, msg, text).catch(() => {});
  await audit(null, "telegram.faq", undefined, { user: String(msg.from.id), username: msg.from.username ?? null, question: text.slice(0, 1000), answer: answer.slice(0, 2000) });
}

/** Вопрос, на который помощник не знает ответа, — админам сайта в личку со ссылкой на сообщение */
async function tellOrganizers(token: string, msg: TgMessage, question: string) {
  const { data } = await db().from("player_profiles").select("telegram_chat_id, player:players!player_profiles_player_id_fkey(is_admin)").not("telegram_chat_id", "is", null);
  const chats = ((data ?? []) as unknown as { telegram_chat_id: number; player: { is_admin: boolean } | null }[]).filter((r) => r.player?.is_admin).map((r) => r.telegram_chat_id);
  const internal = String(msg.chat.id).replace(/^-100/, "");
  const link = `https://t.me/c/${internal}/${msg.message_thread_id ? `${msg.message_thread_id}/` : ""}${msg.message_id}`;
  const who = msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") + (msg.from.username ? ` (@${msg.from.username})` : "") : "игрок";
  const text = `❓ Помощник не знает ответа — ответьте в чате\n${who}:\n«${question.slice(0, 900)}»`;
  await Promise.allSettled(chats.map((c) => tgCall(token, "sendMessage", { chat_id: c, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "Открыть сообщение", url: link }]] } })));
}

