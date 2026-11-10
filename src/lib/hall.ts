import "server-only";
import { audit, notify } from "./audit";
import { isPrivateMatch, isPrivateTournament } from "./private-tournament";
import { db } from "./supabase";
import { SITE_URL, setAppSettings, telegramConfig, telegramGroup, tgCall, tgEscape } from "./telegram";
import { VETO_STEP_SECONDS } from "./veto";
import { HALL_BLOCKS, blockById, blockLabel, chooseSeats, parseForbidden, parseOff, type SeatPlan } from "./hall-core";

/*
 * Рассадка в зале (LAN-турниры). Всё хранится событиями в audit_logs — схема базы не меняется:
 *  - hall.call  {tournament, seat1, seat2, team1, team2} — матч вызван, командам назначены блоки ПК
 *                (последний вызов матча — действующий; пересадка = новый вызов);
 *  - hall.ready {team} — капитан нажал «Команда села — Готов».
 * Бан-пик начинается, когда готовы оба капитана или через 10 минут после вызова.
 * Настройки (app_settings): HALL_SEATING=1 — включено; HALL_FORBIDDEN — запрещённые пары соперников;
 * HALL_FREED — {блок: время}, «блок свободен» вручную; TELEGRAM_MATCHES_THREAD — тема «Матчи турнира»; HALL_BOARD_MSG — табло зала.
 */

export const READY_MS = 10 * 60_000; // на «Готов» после вызова
export const REST_MS = 20 * 60_000; // перерыв команды между матчами
export const RELEASE_MS = 5 * 60_000; // блок проигравших освобождается после матча

const ACTIVE = ["upcoming", "veto", "ready", "live"];

export async function hallConfig() {
  const { data } = await db()
    .from("app_settings")
    .select("key, value")
    .in("key", ["HALL_SEATING", "HALL_FORBIDDEN", "HALL_OFF", "HALL_FREED", "TELEGRAM_MATCHES_THREAD", "HALL_BOARD_MSG", "HALL_BOARD_TEXT"]);
  const m = new Map((data ?? []).map((r) => [r.key, String(r.value ?? "")]));
  let freed: Record<string, string> = {};
  try {
    freed = JSON.parse(m.get("HALL_FREED") || "{}");
  } catch {}
  return {
    enabled: m.get("HALL_SEATING") === "1",
    forbiddenRaw: m.get("HALL_FORBIDDEN") ?? "",
    forbidden: parseForbidden(m.get("HALL_FORBIDDEN")),
    off: parseOff(m.get("HALL_OFF")),
    freed,
    thread: Number(m.get("TELEGRAM_MATCHES_THREAD") || "") || null,
    boardMsg: Number(m.get("HALL_BOARD_MSG") || "") || null,
    boardText: m.get("HALL_BOARD_TEXT") ?? "",
  };
}
export type HallConfig = Awaited<ReturnType<typeof hallConfig>>;

export type HallCall = { matchId: string; seat1: string; seat2: string; team1: string; team2: string; at: string };

type HallMatch = {
  id: string;
  number: number;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
  finished_at: string | null;
  team1_score: number;
  team2_score: number;
  is_walkover: boolean;
};

/** Действующие вызовы матчей турнира (последний вызов каждого матча) */
async function tournamentCalls(tournamentId: string): Promise<Map<string, HallCall>> {
  const { data } = await db()
    .from("audit_logs")
    .select("entity_id, payload, created_at")
    .eq("action", "hall.call")
    .eq("payload->>tournament", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const out = new Map<string, HallCall>();
  for (const r of [...(data ?? [])].reverse()) {
    const p = (r.payload ?? {}) as Record<string, string>;
    if (!r.entity_id || !p.seat1 || !p.seat2) continue;
    out.set(r.entity_id, { matchId: r.entity_id, seat1: p.seat1, seat2: p.seat2, team1: p.team1, team2: p.team2, at: r.created_at });
  }
  return out;
}

const freedAfter = (cfg: HallConfig, seat: string, since: string) => !!cfg.freed[seat] && Date.parse(cfg.freed[seat]) > Date.parse(since);

/** Кто где сидит: занятые блоки, последнее место каждой команды, места ждущих команд */
export async function hallSnapshot(tournamentId: string, cfg: HallConfig, exceptMatch?: string) {
  const [allCalls, { data: ms }] = await Promise.all([
    tournamentCalls(tournamentId),
    db().from("matches").select("id, number, status, team1_id, team2_id, winner_id, finished_at, team1_score, team2_score, is_walkover").eq("tournament_id", tournamentId),
  ]);
  const matches = (ms ?? []) as HallMatch[];
  const byId = new Map(matches.map((m) => [m.id, m]));
  // вызов действует, только пока в матче те же команды (после отмены результата сетка могла поменять соперника —
  // тогда матч вызывается заново)
  const calls = new Map([...allCalls].filter(([id, c]) => {
    const m = byId.get(id);
    return !!m && m.team1_id === c.team1 && m.team2_id === c.team2;
  }));
  const now = Date.now();
  const occupied = new Map<string, string>();
  const occupiedBy = new Map<string, { team: string; match: HallMatch }>();
  const last = new Map<string, string>();
  const lastAt = new Map<string, string>();
  for (const c of [...calls.values()].sort((a, b) => a.at.localeCompare(b.at))) {
    const m = byId.get(c.matchId);
    if (!m || m.id === exceptMatch) continue;
    for (const [seat, team] of [[c.seat1, c.team1], [c.seat2, c.team2]] as const) {
      last.set(team, seat);
      lastAt.set(team, c.at);
    }
    const active = ACTIVE.includes(m.status) && m.team1_id === c.team1 && m.team2_id === c.team2;
    const justFinished = m.status === "finished" && !m.is_walkover && !!m.finished_at && now - new Date(m.finished_at).getTime() < RELEASE_MS;
    if (!active && !justFinished) continue;
    for (const [seat, team] of [[c.seat1, c.team1], [c.seat2, c.team2]] as const) {
      // «Блок свободен» в пульте снимает только места закончившихся матчей
      if (!active && freedAfter(cfg, seat, m.finished_at ?? c.at)) continue;
      occupied.set(seat, team);
      occupiedBy.set(seat, { team, match: m });
    }
  }
  // команда, у которой есть следующий матч, «держит» своё последнее место
  const waiting = new Set<string>();
  for (const m of matches)
    if (["pending", "upcoming"].includes(m.status)) {
      if (m.team1_id) waiting.add(m.team1_id);
      if (m.team2_id) waiting.add(m.team2_id);
    }
  const reserved = new Map<string, string>();
  for (const [team, seat] of last) {
    if (!waiting.has(team) || occupied.has(seat)) continue;
    if (freedAfter(cfg, seat, lastAt.get(team) ?? "1970-01-01")) continue;
    reserved.set(seat, team);
  }
  return { calls, matches, occupied, occupiedBy, last, reserved };
}

/** Команда отдохнула после прошлого матча турнира */
export function rested(matches: HallMatch[], teamId: string, now = Date.now()) {
  const lastEnd = matches
    .filter((m) => m.status === "finished" && !m.is_walkover && m.finished_at && (m.team1_id === teamId || m.team2_id === teamId))
    .reduce((acc, m) => Math.max(acc, new Date(m.finished_at!).getTime()), 0);
  return now - lastEnd >= REST_MS;
}

type CallResult = { matchId: string; number: number; plan: SeatPlan; team1: TeamInfo; team2: TeamInfo };
type TeamInfo = { id: string; name: string; captain_id: string | null; players: { id: string; nickname: string; tg: number | null }[] };

async function teamInfo(tournamentId: string, teamId: string): Promise<TeamInfo> {
  const [{ data: team }, { data: roster }] = await Promise.all([
    db().from("teams").select("id, name, captain_id").eq("id", teamId).maybeSingle(),
    db()
      .from("tournament_roster_players")
      .select("player:players(id, nickname), registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(team_id)")
      .eq("tournament_id", tournamentId)
      .eq("registration.team_id", teamId),
  ]);
  const players = ((roster ?? []) as unknown as { player: { id: string; nickname: string } | null }[]).map((r) => r.player).filter(Boolean) as { id: string; nickname: string }[];
  const { data: profs } = players.length
    ? await db().from("player_profiles").select("player_id, telegram_chat_id").in("player_id", players.map((p) => p.id))
    : { data: [] };
  const tg = new Map((profs ?? []).map((p) => [p.player_id, p.telegram_chat_id as number | null]));
  return {
    id: teamId,
    name: team?.name ?? "Команда",
    captain_id: team?.captain_id ?? null,
    players: players.map((p) => ({ ...p, tg: tg.get(p.id) ?? null })),
  };
}

/**
 * Вызвать матч: назначить блоки ПК (или взять указанные админом) и сообщить игрокам.
 * Возвращает ошибку текстом, если вызвать нельзя.
 */
export async function callMatch(matchId: string, opts: { actorId?: string | null; seats?: [string, string]; announce?: boolean } = {}): Promise<CallResult | string> {
  const { data: m } = await db()
    .from("matches")
    .select("id, number, status, tournament_id, team1_id, team2_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!m) return "Матч не найден";
  if (m.status !== "upcoming" || !m.team1_id || !m.team2_id) return "Вызвать можно матч, где известны обе команды и бан-пик ещё не начался";
  const cfg = await hallConfig();
  const snap = await hallSnapshot(m.tournament_id, cfg, m.id);
  let plan: SeatPlan | null;
  if (opts.seats) {
    const [s1, s2] = opts.seats;
    if (!blockById(s1) || !blockById(s2) || s1 === s2) return "Выберите два разных блока";
    for (const [s, team] of [[s1, m.team1_id], [s2, m.team2_id]] as const) {
      const who = snap.occupied.get(s);
      if (who && who !== team) return `${blockLabel(s)} сейчас занят другой командой`;
    }
    plan = { seat1: s1, seat2: s2, moved1: !!snap.last.get(m.team1_id) && snap.last.get(m.team1_id) !== s1, moved2: !!snap.last.get(m.team2_id) && snap.last.get(m.team2_id) !== s2 };
  } else {
    plan = chooseSeats({ team1: m.team1_id, team2: m.team2_id, last: snap.last, occupied: snap.occupied, reserved: snap.reserved, forbidden: cfg.forbidden, off: cfg.off });
  }
  if (!plan) return "Свободных мест нет — матч подождёт, пока освободится блок";

  await audit(opts.actorId ?? null, "hall.call", { type: "match", id: m.id }, {
    tournament: m.tournament_id,
    seat1: plan.seat1,
    seat2: plan.seat2,
    team1: m.team1_id,
    team2: m.team2_id,
    moved1: plan.moved1,
    moved2: plan.moved2,
    manual: !!opts.seats,
  });
  const [team1, team2] = await Promise.all([teamInfo(m.tournament_id, m.team1_id), teamInfo(m.tournament_id, m.team2_id)]);
  const link = `/matches/${m.id}`;
  for (const [me, rival, seat] of [[team1, team2, plan.seat1], [team2, team1, plan.seat2]] as const) {
    await notify(
      me.players.map((p) => p.id),
      `Матч #${m.number}: садитесь за ${blockLabel(seat)}`,
      `Против ${rival.name}. Войдите в свой Steam. Капитан — нажмите «Готов» на странице матча, на это 10 минут.`,
      link,
    ).catch(() => {});
  }
  const result = { matchId: m.id, number: m.number, plan, team1, team2 };
  if (opts.announce !== false) await announceCalls([result]);
  return result;
}

const mentionList = (t: TeamInfo) =>
  t.players.map((p) => (p.tg ? `<a href="tg://user?id=${p.tg}">${tgEscape(p.nickname)}</a>` : tgEscape(p.nickname))).join(", ");

/** Сообщение в тему «Матчи турнира»: кто куда садится */
export async function announceCalls(all: CallResult[]) {
  // закрытый турнир: в общий чат не пишем — игрокам вызов уже ушёл в личку (callMatch → notify)
  const priv = new Set<string>();
  for (const c of all) if (await isPrivateMatch(c.matchId)) priv.add(c.matchId);
  if (priv.size) await db().from("audit_logs").insert([...priv].map((id) => ({ action: "hall.announced", entity_type: "match", entity_id: id, payload: { private: true } })));
  const calls = all.filter((c) => !priv.has(c.matchId));
  if (!calls.length) return;
  const [cfg, group, tg] = await Promise.all([hallConfig(), telegramGroup(), telegramConfig()]);
  if (!tg.token || !group.id || !cfg.thread) return;
  const parts = calls.map((c) => {
    const line = (t: TeamInfo, seat: string, moved: boolean) =>
      `${moved ? "🔁" : "🖥"} <b>${tgEscape(t.name)}</b> — <b>${blockLabel(seat)}</b>${moved ? " · пересаживаетесь" : ""}\n${mentionList(t)}`;
    return `⚔️ <b>Матч #${c.number}</b>: ${tgEscape(c.team1.name)} vs ${tgEscape(c.team2.name)}\n${line(c.team1, c.plan.seat1, c.plan.moved1)}\n${line(c.team2, c.plan.seat2, c.plan.moved2)}\n<a href="${SITE_URL}/matches/${c.matchId}">Страница матча</a>`;
  });
  const head = calls.length > 1 ? "📢 <b>Садитесь за ПК</b>\n\n" : "📢 <b>Вызов на матч</b>\n\n";
  const tail = "\n\nВойдите в свой Steam. Капитаны: как команда села — нажмите <b>«Готов»</b> на странице матча. На это 10 минут, потом бан-пик начнётся сам.";
  const r = await tgCall(tg.token, "sendMessage", {
    chat_id: group.id,
    message_thread_id: cfg.thread,
    text: head + parts.join("\n\n") + tail,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  // отметка «объявлено» — если Telegram не ответил, hallTick пошлёт вызов ещё раз
  if (r.ok) await db().from("audit_logs").insert(calls.map((c) => ({ action: "hall.announced", entity_type: "match", entity_id: c.matchId, payload: {} })));
  else console.error("hall announce", r.description);
  await updateBoard().catch(() => {});
}

// ───────────────────────── «Готов» и старт бан-пика

export async function matchHall(matchId: string) {
  const { data: call } = await db()
    .from("audit_logs")
    .select("payload, created_at")
    .eq("action", "hall.call")
    .eq("entity_type", "match")
    .eq("entity_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!call) return null;
  const p = (call.payload ?? {}) as Record<string, string>;
  const { data: cur } = await db().from("matches").select("team1_id, team2_id").eq("id", matchId).maybeSingle();
  if (!cur || cur.team1_id !== p.team1 || cur.team2_id !== p.team2) return null; // соперники поменялись — вызов недействителен
  const { data: readies } = await db()
    .from("audit_logs")
    .select("payload")
    .eq("action", "hall.ready")
    .eq("entity_type", "match")
    .eq("entity_id", matchId)
    .gte("created_at", call.created_at);
  const ready = new Set((readies ?? []).map((r) => (r.payload as Record<string, string>)?.team));
  // бан-пик после этого вызова уже начинался (а потом админ его сбросил) — сам больше не запускаем
  const { count: vetoStarts } = await db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .in("action", ["hall.veto_start", "match.veto_start"])
    .eq("entity_type", "match")
    .eq("entity_id", matchId)
    .gte("created_at", call.created_at);
  return {
    seat1: p.seat1,
    seat2: p.seat2,
    team1: p.team1,
    team2: p.team2,
    calledAt: call.created_at,
    deadline: new Date(new Date(call.created_at).getTime() + READY_MS).toISOString(),
    ready1: ready.has(p.team1),
    ready2: ready.has(p.team2),
    vetoStarted: (vetoStarts ?? 0) > 0,
  };
}

/** Бан-пик матча после рассадки: оба готовы или вышло время */
export async function startHallVeto(matchId: string, reason: "ready" | "timeout" | "admin") {
  const { data: updated } = await db()
    .from("matches")
    .update({ status: "veto", veto_deadline: new Date(Date.now() + VETO_STEP_SECONDS * 1000).toISOString() })
    .eq("id", matchId)
    .eq("status", "upcoming")
    .select("id, number, team1_id, team2_id");
  const m = updated?.[0];
  if (!m) return false;
  await audit(null, "hall.veto_start", { type: "match", id: m.id }, { reason });
  const { data: teams } = await db().from("teams").select("captain_id").in("id", [m.team1_id, m.team2_id].filter((x): x is string => !!x));
  await notify(
    (teams ?? []).map((x) => x.captain_id),
    `Бан-пик матча #${m.number} начался`,
    reason === "timeout" ? `10 минут на «Готов» прошли. На каждый шаг — ${VETO_STEP_SECONDS} секунд.` : `На каждый шаг — ${VETO_STEP_SECONDS} секунд.`,
    `/matches/${m.id}`,
  ).catch(() => {});
  return true;
}

/** Капитан нажал «Команда села — Готов». Ошибка — текстом */
export async function markReady(matchId: string, playerId: string): Promise<string | null> {
  const { data: m } = await db().from("matches").select("id, status, team1_id, team2_id").eq("id", matchId).maybeSingle();
  if (!m) return "Матч не найден";
  if (m.status !== "upcoming") return "Бан-пик уже начался";
  const hall = await matchHall(matchId);
  if (!hall) return "Матч ещё не вызван — ждите сообщения, где садиться";
  if (hall.vetoStarted) return "Бан-пик сброшен администратором — он запустит его снова";
  const { data: teams } = await db().from("teams").select("id, captain_id").in("id", [hall.team1, hall.team2]);
  const team = (teams ?? []).find((t) => t.captain_id === playerId);
  if (!team) return "«Готов» нажимает капитан команды";
  if ((team.id === hall.team1 && hall.ready1) || (team.id === hall.team2 && hall.ready2)) return null;
  await audit(playerId, "hall.ready", { type: "match", id: matchId }, { team: team.id });
  // перечитываем после своей записи: если капитаны нажали одновременно, бан-пик всё равно начнётся
  const after = await matchHall(matchId);
  if (after && after.ready1 && after.ready2) await startHallVeto(matchId, "ready");
  return null;
}

/** 10 минут на «Готов» прошли — бан-пик начинается сам */
export async function applyReadyTimeout(matchId: string) {
  const hall = await matchHall(matchId);
  if (hall && !hall.vetoStarted && new Date(hall.deadline).getTime() <= Date.now()) await startHallVeto(matchId, "timeout");
}

// ───────────────────────── тик: таймауты, табло

/** Вызывается на каждой синхронизации агента: таймауты «Готов», табло зала */
export async function hallTick() {
  const cfg = await hallConfig();
  if (!cfg.enabled) return;
  const { data: ts } = await db().from("tournaments").select("id").eq("is_lan", true).in("status", ["checkin", "live"]);
  for (const t of ts ?? []) {
    const snap = await hallSnapshot(t.id, cfg);
    const now = Date.now();
    const waiting = snap.matches.filter((m) => m.status === "upcoming" && snap.calls.has(m.id));
    for (const w of waiting) {
      const c = snap.calls.get(w.id)!;
      if (new Date(c.at).getTime() + READY_MS <= now) await applyReadyTimeout(w.id);
    }
    await reannounce(t.id, waiting.map((w) => w.id), snap.calls).catch((e) => console.error("hall reannounce", e));
    await warnNextInQueue(t.id, cfg).catch((e) => console.error("hall prepare", e));
  }
  await updateBoard().catch(() => {});
}

/** Вызовы, которые не дошли до Telegram (сбой отправки), — шлём ещё раз */
async function reannounce(tournamentId: string, matchIds: string[], calls: Map<string, HallCall>) {
  if (!matchIds.length) return;
  const { data: done } = await db().from("audit_logs").select("entity_id").eq("action", "hall.announced").in("entity_id", matchIds);
  const ok = new Set((done ?? []).map((d) => d.entity_id));
  const todo = matchIds.filter((id) => !ok.has(id) && Date.now() - new Date(calls.get(id)!.at).getTime() > 30_000).slice(0, 4);
  if (!todo.length) return;
  const { data: ms } = await db().from("matches").select("id, number").in("id", todo);
  const out: CallResult[] = [];
  for (const m of ms ?? []) {
    const c = calls.get(m.id)!;
    const [team1, team2] = await Promise.all([teamInfo(tournamentId, c.team1), teamInfo(tournamentId, c.team2)]);
    out.push({ matchId: m.id, number: m.number, plan: { seat1: c.seat1, seat2: c.seat2, moved1: false, moved2: false }, team1, team2 });
  }
  await announceCalls(out);
}

/** Сколько матчей из очереди предупреждать «готовьтесь» */
const PREPARE_AHEAD = 2;

/**
 * «Готовьтесь — вы следующие»: первым матчам очереди (соперники известны, на места ещё не вызваны) бот один раз
 * пишет в тему «Матчи турнира» с отметками игроков и в личку — чтобы команда была рядом с залом к вызову.
 */
async function warnNextInQueue(tournamentId: string, cfg: HallConfig) {
  if (!cfg.thread) return;
  const snap = await hallSnapshot(tournamentId, cfg);
  const next = snap.matches
    .filter((m) => m.status === "upcoming" && m.team1_id && m.team2_id && !snap.calls.has(m.id))
    .sort((a, b) => a.number - b.number)
    .slice(0, PREPARE_AHEAD);
  if (!next.length) return;
  const { data: done } = await db().from("audit_logs").select("entity_id").eq("action", "hall.prepare").in("entity_id", next.map((m) => m.id));
  const warned = new Set((done ?? []).map((d) => d.entity_id));
  const [group, tg] = await Promise.all([telegramGroup(), telegramConfig()]);
  if (!tg.token || !group.id) return;
  const hidden = await isPrivateTournament(tournamentId);
  for (const m of next.filter((x) => !warned.has(x.id))) {
    await audit(null, "hall.prepare", { type: "match", id: m.id }, { tournament: tournamentId });
    const [team1, team2] = await Promise.all([teamInfo(tournamentId, m.team1_id!), teamInfo(tournamentId, m.team2_id!)]);
    const lastEnd = (team: string) =>
      snap.matches
        .filter((x) => x.status === "finished" && x.finished_at && (x.team1_id === team || x.team2_id === team))
        .reduce((a, x) => Math.max(a, new Date(x.finished_at!).getTime()), 0);
    const restUntil = Math.max(lastEnd(m.team1_id!), lastEnd(m.team2_id!)) + REST_MS;
    const rest = restUntil > Date.now() ? `\nПерерыв до ${new Date(restUntil).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" })}.` : "";
    // закрытый турнир — только в личку
    if (!hidden) await tgCall(tg.token, "sendMessage", {
      chat_id: group.id,
      message_thread_id: cfg.thread,
      text: `⚠️ <b>Готовьтесь — вы следующие</b>\n⚔️ <b>Матч #${m.number}</b>: ${tgEscape(team1.name)} vs ${tgEscape(team2.name)}\n${mentionList(team1)}\n${mentionList(team2)}${rest}\n\nБудьте рядом с залом: как только освободятся места, бот напишет, за какие ПК садиться.`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    for (const [me, rival] of [[team1, team2], [team2, team1]] as const) {
      await notify(
        me.players.map((p) => p.id),
        `Готовьтесь: матч #${m.number} против ${rival.name} — вы следующие`,
        "Будьте рядом с залом. Как только освободятся места, бот напишет, за какие ПК садиться.",
        `/matches/${m.id}`,
      ).catch(() => {});
    }
  }
}

const STATUS_TEXT: Record<string, string> = { upcoming: "садятся", veto: "бан-пик", ready: "сервер", live: "игра", finished: "закончили" };

/** Текст табло «Зал сейчас» */
export async function boardText() {
  const cfg = await hallConfig();
  const { data: ts } = await db().from("tournaments").select("id, name").eq("is_lan", true).in("status", ["checkin", "live"]);
  const teamIds = new Set<string>();
  const seats: { block: string; team: string; match: HallMatch | null; hidden?: boolean }[] = [];
  const queue: { m: HallMatch; restUntil: number }[] = [];
  const now = Date.now();
  for (const t of ts ?? []) {
    const snap = await hallSnapshot(t.id, cfg);
    // закрытый турнир: на табло места просто «заняты» — без команд, матчей и очереди
    const hidden = await isPrivateTournament(t.id);
    // очередь: соперники известны, на места ещё не вызваны
    for (const m of snap.matches) {
      if (hidden) break;
      if (m.status !== "upcoming" || !m.team1_id || !m.team2_id || snap.calls.has(m.id)) continue;
      const lastEnd = (team: string) =>
        snap.matches
          .filter((x) => x.status === "finished" && x.finished_at && (x.team1_id === team || x.team2_id === team))
          .reduce((a, x) => Math.max(a, new Date(x.finished_at!).getTime()), 0);
      queue.push({ m, restUntil: Math.max(lastEnd(m.team1_id), lastEnd(m.team2_id)) + REST_MS });
      teamIds.add(m.team1_id);
      teamIds.add(m.team2_id);
    }
    for (const [block, v] of snap.occupiedBy) {
      seats.push({ block, team: v.team, match: v.match, hidden });
      teamIds.add(v.team);
    }
    for (const [block, team] of snap.reserved) {
      if (snap.occupiedBy.has(block)) continue;
      seats.push({ block, team, match: null, hidden });
      teamIds.add(team);
    }
  }
  const { data: teams } = teamIds.size ? await db().from("teams").select("id, name").in("id", [...teamIds]) : { data: [] };
  const name = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const lines = HALL_BLOCKS.map((b) => {
    const s = seats.find((x) => x.block === b.id);
    if (!s) return `▫️ ${blockLabel(b.id, false)} — свободно`;
    if (s.hidden) return `⛔ ${blockLabel(b.id, false)} — занято`;
    if (!s.match) return `⏸ ${blockLabel(b.id, false)} — <b>${tgEscape(name.get(s.team) ?? "?")}</b> · ждёт следующий матч`;
    const score = s.match.status === "live" || s.match.status === "finished" ? ` · ${s.match.team1_score}:${s.match.team2_score}` : "";
    return `${s.match.status === "live" ? "🔴" : "🟢"} ${blockLabel(b.id, false)} — <b>${tgEscape(name.get(s.team) ?? "?")}</b> · матч #${s.match.number} · ${STATUS_TEXT[s.match.status] ?? s.match.status}${score}`;
  });
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
  const q = queue
    .sort((a, b) => a.m.number - b.m.number)
    .slice(0, 8)
    .map(({ m, restUntil }, i) => {
      const why = restUntil > now ? `перерыв до ${hhmm(restUntil)}` : i === 0 ? "следующий — как освободятся места" : "ждёт места";
      return `${i + 1}. Матч #${m.number}: <b>${tgEscape(name.get(m.team1_id!) ?? "?")}</b> — <b>${tgEscape(name.get(m.team2_id!) ?? "?")}</b> · ${why}`;
    });
  const queueText = q.length ? `\n\n⏳ <b>Очередь</b> — бот позовёт, когда ваш матч вызовут:\n${q.join("\n")}` : "";
  return `🖥 <b>Зал сейчас</b>\n\n<b>Premium</b>\n${lines.slice(0, 6).join("\n")}\n\n<b>Standart</b>\n${lines.slice(6).join("\n")}${queueText}`;
}

/** Закреплённое табло в теме «Матчи турнира»: создать или обновить, если поменялось */
export async function updateBoard() {
  const cfg = await hallConfig();
  if (!cfg.enabled || !cfg.thread) return;
  const [group, tg] = await Promise.all([telegramGroup(), telegramConfig()]);
  if (!tg.token || !group.id) return;
  const text = await boardText();
  if (text === cfg.boardText && cfg.boardMsg) return;
  if (cfg.boardMsg) {
    const r = await tgCall(tg.token, "editMessageText", { chat_id: group.id, message_id: cfg.boardMsg, text, parse_mode: "HTML" });
    if (r.ok || /not modified/i.test(r.description ?? "")) {
      await setAppSettings({ HALL_BOARD_TEXT: text });
      return;
    }
    // сбой связи / лимит Telegram — попробуем в следующий тик; новое табло — только если старое удалено
    if (!/not found|can't be edited|message to edit/i.test(r.description ?? "")) return;
  }
  const sent = await tgCall<{ message_id: number }>(tg.token, "sendMessage", { chat_id: group.id, message_thread_id: cfg.thread, text, parse_mode: "HTML", disable_notification: true });
  if (sent.ok && sent.result) {
    await tgCall(tg.token, "pinChatMessage", { chat_id: group.id, message_id: sent.result.message_id, disable_notification: true });
    await setAppSettings({ HALL_BOARD_MSG: String(sent.result.message_id), HALL_BOARD_TEXT: text });
  }
}
