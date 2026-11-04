import "server-only";
import { db } from "./supabase";

/*
 * Обязательное подтверждение Telegram для участников турниров: игрок в составе одобренной команды
 * на турнире, который ещё не закончился, должен подтвердить Telegram через бота — иначе в день турнира
 * бот не отметит его в рассадке и не напишет о вызове на матч.
 */

const OPEN = ["registration", "checkin", "live"];

type RosterRow = {
  player_id: string;
  role: string;
  registration: { status: string; team: { id: string; name: string; tag: string; captain_id: string | null } | null; tournament: { name: string; status: string } | null } | null;
  player: { nickname: string; is_banned: boolean } | null;
};

async function approvedRosters(playerId?: string) {
  let q = db()
    .from("tournament_roster_players")
    .select(
      "player_id, role, player:players!inner(nickname, is_banned), registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(status, team:teams(id, name, tag, captain_id), tournament:tournaments!inner(name, status))",
    )
    .eq("registration.status", "approved")
    .in("registration.tournament.status", OPEN)
    .eq("player.is_banned", false);
  if (playerId) q = q.eq("player_id", playerId);
  const { data, error } = await q.range(0, 999);
  if (error) throw error;
  return (data ?? []) as unknown as RosterRow[];
}

/** Нужно ли игроку подтвердить Telegram: название турнира или null */
export async function telegramLinkRequired(playerId: string): Promise<string | null> {
  const rows = await approvedRosters(playerId);
  const row = rows.find((r) => r.registration?.tournament);
  if (!row) return null;
  const { data: prof, error } = await db().from("player_profiles").select("telegram_chat_id").eq("player_id", playerId).maybeSingle();
  if (error) return null; // база не ответила — лучше не показать окно, чем заблокировать подтвердившего игрока
  return prof?.telegram_chat_id ? null : row.registration!.tournament!.name;
}

export type UnlinkedTeam = { team: string; tag: string; tournament: string; total: number; missing: { nickname: string; captain: boolean; sub: boolean }[] };

/** Для пульта: по командам — кто из состава ещё не подтвердил Telegram */
export async function unlinkedParticipants(): Promise<UnlinkedTeam[]> {
  const rows = await approvedRosters();
  if (!rows.length) return [];
  // кусками по 100 — длинный список id не влезает в адрес запроса
  const ids = [...new Set(rows.map((r) => r.player_id))];
  const linked = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: profs, error } = await db().from("player_profiles").select("player_id").in("player_id", ids.slice(i, i + 100)).not("telegram_chat_id", "is", null);
    if (error) throw error;
    for (const p of profs ?? []) linked.add(p.player_id);
  }
  const byTeam = new Map<string, UnlinkedTeam>();
  for (const r of rows) {
    const team = r.registration?.team;
    if (!team) continue;
    const key = `${team.id}:${r.registration?.tournament?.name}`;
    const t = byTeam.get(key) ?? { team: team.name, tag: team.tag, tournament: r.registration?.tournament?.name ?? "", total: 0, missing: [] };
    t.total++;
    if (!linked.has(r.player_id)) t.missing.push({ nickname: r.player?.nickname ?? "?", captain: team.captain_id === r.player_id, sub: r.role === "substitute" });
    byTeam.set(key, t);
  }
  return [...byTeam.values()].sort((a, b) => b.missing.length - a.missing.length || a.team.localeCompare(b.team));
}

/*
 * Раз в день бот пишет капитану в Telegram, кто из его состава ещё не подтвердил Telegram.
 * Только днём (11:00–21:00 по Алматы), только капитанам с подтверждённым Telegram, один раз в сутки на команду.
 */
const REMIND_FROM_HOUR = 11;
const REMIND_TO_HOUR = 21;

function almatyNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function captainLinkRemindTick() {
  const { day, hour } = almatyNow();
  if (hour < REMIND_FROM_HOUR || hour >= REMIND_TO_HOUR) return;
  const { telegramConfig, tgSend, tgEscape, SITE_URL } = await import("./telegram");
  const cfg = await telegramConfig();
  if (!cfg.token) return;
  const rows = await approvedRosters();
  if (!rows.length) return;

  // команды → кто из состава без Telegram
  const ids = [...new Set(rows.map((r) => r.player_id))];
  const chatOf = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db().from("player_profiles").select("player_id, telegram_chat_id").in("player_id", ids.slice(i, i + 100)).not("telegram_chat_id", "is", null);
    if (error) throw error;
    for (const p of data ?? []) chatOf.set(p.player_id, p.telegram_chat_id as number);
  }
  type T = { teamId: string; team: string; tournament: string; captain: string | null; missing: string[] };
  const teams = new Map<string, T>();
  for (const r of rows) {
    const team = r.registration?.team;
    const tournament = r.registration?.tournament?.name;
    if (!team || !tournament) continue;
    const key = `${team.id}:${tournament}`;
    const t = teams.get(key) ?? { teamId: team.id, team: team.name, tournament, captain: team.captain_id, missing: [] };
    if (!chatOf.has(r.player_id)) t.missing.push(r.player?.nickname ?? "?");
    teams.set(key, t);
  }

  // уже написали сегодня
  const { data: sent } = await db().from("audit_logs").select("payload").eq("action", "tg.captain_link_remind").eq("payload->>day", day).limit(1000);
  const done = new Set((sent ?? []).map((s) => `${(s.payload as { team?: string }).team}:${(s.payload as { tournament?: string }).tournament}`));

  for (const t of teams.values()) {
    if (!t.missing.length || !t.captain) continue;
    const chat = chatOf.get(t.captain);
    if (!chat) continue; // капитан сам без Telegram — написать некому
    if (done.has(`${t.teamId}:${t.tournament}`)) continue;
    // отметка до отправки — второй проход в тот же день не продублирует
    const { error } = await db().from("audit_logs").insert({ action: "tg.captain_link_remind", entity_type: "team", entity_id: t.teamId, payload: { day, team: t.teamId, tournament: t.tournament, missing: t.missing } });
    if (error) continue;
    const list = t.missing.map((n) => `• ${tgEscape(n)}`).join("\n");
    const html =
      `👋 <b>${tgEscape(t.team)}</b> · «${tgEscape(t.tournament)}»\n\n` +
      `Ещё не подтвердили Telegram:\n${list}\n\n` +
      `В день турнира бот пишет каждому игроку, за какие ПК садиться и когда его матч. Без подтверждения эти игроки сообщений не получат.\n\n` +
      `Попросите их зайти на сайт со своего аккаунта — появится окно «Подтвердите Telegram». Если на компьютере нет Telegram, там же будет QR-код для телефона.`;
    await tgSend(cfg.token, chat, html, { text: "Открыть сайт", url: SITE_URL });
  }
}

/*
 * Каждый час (11:00–21:00 по Алматы) бот публикует в теме «Матчи турнира» список участников без подтверждённого
 * Telegram, с отметками @ник (ник из анкеты), и удаляет прошлое такое сообщение — в теме всегда одно, свежее.
 * Когда подтвердят все — прошлое сообщение удаляется и напоминания прекращаются.
 */
export async function groupLinkRemindTick(force = false) {
  const { day, hour } = almatyNow();
  if (!force && (hour < REMIND_FROM_HOUR || hour >= REMIND_TO_HOUR)) return;
  const { telegramConfig, telegramGroup, tgCall, tgEscape, setAppSettings, SITE_URL } = await import("./telegram");
  const [cfg, group, { data: st }] = await Promise.all([
    telegramConfig(),
    telegramGroup(),
    db().from("app_settings").select("key, value").in("key", ["TELEGRAM_MATCHES_THREAD", "TG_LINK_REMIND_MSG", "TG_LINK_REMIND_AT"]),
  ]);
  const s = new Map((st ?? []).map((r) => [r.key, String(r.value ?? "")]));
  const thread = Number(s.get("TELEGRAM_MATCHES_THREAD") || "") || null;
  if (!cfg.token || !group.id || !thread) return;
  const slot = `${day}T${hour}`;
  if (!force && s.get("TG_LINK_REMIND_AT") === slot) return; // в этот час уже публиковали

  const rows = await approvedRosters();
  const ids = [...new Set(rows.map((r) => r.player_id))];
  const prof = new Map<string, { chat: number | null; tg: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db().from("player_profiles").select("player_id, telegram_chat_id, telegram").in("player_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const p of data ?? []) prof.set(p.player_id, { chat: p.telegram_chat_id as number | null, tg: p.telegram });
  }
  const byTeam = new Map<string, string[]>();
  for (const r of rows) {
    const team = r.registration?.team?.name;
    const p = prof.get(r.player_id);
    if (!team || p?.chat) continue;
    const u = (p?.tg ?? "").trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
    const who = /^[A-Za-z0-9_]{5,32}$/.test(u) ? `@${u}` : tgEscape(r.player?.nickname ?? "?");
    byTeam.set(team, [...(byTeam.get(team) ?? []), who]);
  }

  const prev = Number(s.get("TG_LINK_REMIND_MSG") || "") || null;
  if (prev) await tgCall(cfg.token, "deleteMessage", { chat_id: group.id, message_id: prev });
  if (!byTeam.size) {
    await setAppSettings({ TG_LINK_REMIND_MSG: "", TG_LINK_REMIND_AT: slot });
    return;
  }
  const total = [...byTeam.values()].reduce((n, l) => n + l.length, 0);
  const list = [...byTeam.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([team, who]) => `<b>${tgEscape(team)}</b>: ${who.join(", ")}`)
    .join("\n");
  const html =
    `⚠️ <b>Подтвердите Telegram — ${total} ${total % 10 === 1 && total % 100 !== 11 ? "игрок" : total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 12 || total % 100 > 14) ? "игрока" : "игроков"} ещё без него</b>\n\n` +
    `В день турнира бот пишет каждому игроку, за какие ПК садиться и когда его матч. Этим игрокам сообщения не придут:\n\n${list}\n\n` +
    `Как подтвердить (1 минута): зайдите на сайт со своего аккаунта → окно «Подтвердите Telegram» → «Подтвердить через бота» → в боте «Старт». Нет Telegram на компьютере — в окне QR-код для телефона.\n\n` +
    `<i>Список обновляется каждый час.</i>`;
  const r = await tgCall<{ message_id: number }>(cfg.token, "sendMessage", {
    chat_id: group.id,
    message_thread_id: thread,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "Открыть сайт", url: SITE_URL }]] },
  });
  await setAppSettings({ TG_LINK_REMIND_MSG: r.result?.message_id ? String(r.result.message_id) : "", TG_LINK_REMIND_AT: slot });
}
