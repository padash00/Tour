// Демо-турнир «DEMO · CS Uka-2026»: seed → play → status → cleanup. Вся логика — тем же кодом, что и сайт:
// заявки через save_official_registration, одобрение и check-in через change_registration / check_in_registration,
// жеребьёвка drawOrder + createBracket (как «Провести жеребьёвку»), вето через insertVetoAction,
// игра — события MatchZy и строки HTTP-лога CS2, отправленные на сайт (Sender), как это делают сервер и агент.
// Реальные серверы не участвуют: autopilot = false, server_instance у матчей остаётся пустым,
// команды агенту (agent_commands) не создаются.
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { audit, notify } from "../../src/lib/audit";
import { getTournamentRegistrations } from "../../src/lib/data";
import { drawOrder, type DrawRecord } from "../../src/lib/draw";
import { mapLabel } from "../../src/lib/maps";
import { createBracket, getMatch, getMatchRosters, insertVetoAction, type MatchFull } from "../../src/lib/matches";
import { getTournamentNominations } from "../../src/lib/nominations";
import { checkPlayer } from "../../src/lib/official";
import { PRIVACY_VERSION, tournamentDay } from "../../src/lib/profile";
import { getProfiles } from "../../src/lib/profiles";
import { getTournamentRecap } from "../../src/lib/recap";
import { registrationError } from "../../src/lib/registration-errors";
import { ingestKey } from "../../src/lib/server/ops";
import { db } from "../../src/lib/supabase";
import type { Tournament } from "../../src/lib/types";
import { VETO_STEP_SECONDS, vetoState } from "../../src/lib/veto";
import {
  DEMO_INVITE_PREFIX,
  DEMO_MAP_POOL,
  DEMO_NAME,
  DEMO_ORGANIZER_STEAM,
  DEMO_SLUG,
  DEMO_STEAM_PREFIX,
  demoTeams,
  invalidDemoTeams,
  type DemoTeam,
} from "./demo-data";
import { pick, rngFrom, ROLES, simulateMap, type Rng, type SimTeam, type TeamKey } from "./demo-sim";

// ───────────────────────── отправка событий

/** Транспорт до сайта: HTTP (как MatchZy и CS2) или прямой вызов обработчиков в тесте */
export type Transport = {
  /** тело запроса /api/matchzy/events как есть */
  event(raw: string): Promise<{ status: number; body: string }>;
  /** тело запроса /api/cs2/log?m=<matchzyId>&sig=… */
  log(matchzyId: number, raw: string): Promise<{ status: number; body: string }>;
};

/** Ключи ingest_dedupe отправленных событий MatchZy — их удалит cleanup (ключи лога удаляются по префиксу) */
export const DEFAULT_INGEST_JOURNAL = path.join(tmpdir(), `f16-${DEMO_SLUG}-ingest-keys.txt`);

/** HTTP-транспорт: те же адреса, заголовок и подпись, что у MatchZy (matchzy_remote_log_url) и logaddress_add_http */
export function httpTransport(site: string, token: string, signedQuery: (id: number, token: string) => string): Transport {
  const post = async (url: string, body: string, headers: Record<string, string>) => {
    const res = await fetch(url, { method: "POST", headers, body });
    return { status: res.status, body: await res.text() };
  };
  return {
    event: (raw) => post(`${site}/api/matchzy/events`, raw, { "X-F16-Token": token, "Content-Type": "application/json" }),
    log: (id, raw) => post(`${site}/api/cs2/log?${signedQuery(id, token)}`, raw, { "Content-Type": "text/plain" }),
  };
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Доставка с повторами: 503 «обрабатывается» и сбои сети/5xx — повтор; 401/409 — ошибка настройки */
async function deliver(what: string, send: () => Promise<{ status: number; body: string }>) {
  for (let attempt = 1; ; attempt++) {
    let res: { status: number; body: string };
    try {
      res = await send();
    } catch (e) {
      if (attempt >= 5) throw new Error(`${what}: сеть недоступна (${(e as Error).message})`, { cause: e });
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status === 200) return res;
    if (res.status === 401) throw new Error(`${what}: 401 — MATCHZY_TOKEN в .env.local не совпадает с токеном сайта`);
    if (res.status === 409) throw new Error(`${what}: 409 — сайт не принимает события этого матча (матч не ready/live)`);
    if ((res.status === 503 || res.status >= 500) && attempt < 8) {
      await sleep(Math.min(5000, 700 * attempt));
      continue;
    }
    throw new Error(`${what}: HTTP ${res.status} ${res.body.slice(0, 200)}`);
  }
}

export type DemoOptions = {
  transport: Transport;
  /** быстрый режим: без пауз (весь турнир ≈ 2 минуты по HTTP) */
  fast?: boolean;
  /** адрес сайта для ссылок в итогах */
  site?: string;
  /** зерно случайности игры; по умолчанию — от времени */
  seed?: number;
  log?: (line: string) => void;
  /** файл журнала ключей принятых событий (для cleanup) */
  journal?: string;
};

type Ctx = Required<Omit<DemoOptions, "seed">> & { rng: Rng };
const context = (o: DemoOptions): Ctx => ({
  transport: o.transport,
  fast: !!o.fast,
  site: (o.site ?? "https://tournament.f16-arena.kz").replace(/\/$/, ""),
  log: o.log ?? ((s) => console.log(s)),
  journal: o.journal ?? DEFAULT_INGEST_JOURNAL,
  rng: rngFrom(o.seed ?? Date.now() % 2 ** 31),
});

async function sendEvent(ctx: Ctx, ev: Record<string, unknown>) {
  const raw = JSON.stringify(ev);
  // ключ, под которым сайт запомнит событие (ingestKey("mz", тело)) — в журнал для cleanup
  try {
    appendFileSync(ctx.journal, `${ingestKey("mz", raw)}\n`);
  } catch {}
  await deliver(`событие ${ev.event} матча ${ev.matchid}`, () => ctx.transport.event(raw));
}

// ───────────────────────── общие выборки

const CHUNK = 100;
async function inChunks<T>(ids: string[], work: (chunk: string[]) => Promise<T[] | null | undefined>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...((await work(ids.slice(i, i + CHUNK))) ?? []));
  return out;
}

async function loadTournament(): Promise<Tournament | null> {
  const { data } = await db().from("tournaments").select("*").eq("slug", DEMO_SLUG).maybeSingle().throwOnError();
  return data as Tournament | null;
}

async function organizerId() {
  const { data } = await db().from("players").select("id").eq("steam_id", DEMO_ORGANIZER_STEAM).maybeSingle().throwOnError();
  if (!data) throw new Error("Нет демо-организатора — сначала seed");
  return data.id;
}

const now = () => new Date().toISOString();
/** Демо-игрокам не нужна синхронизация профилей Steam/FACEIT во время показа (их SteamID выдуманы) */
const noRefreshUntil = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

// ───────────────────────── seed

async function insertTeam(team: DemoTeam, opts: { brokenProfile?: string } = {}) {
  const { data: players } = await db()
    .from("players")
    .insert(team.players.map((p) => ({ steam_id: p.steamId, nickname: p.nickname, country: "KZ", profile_refreshed_at: noRefreshUntil() })))
    .select("id, steam_id")
    .throwOnError();
  const idOf = new Map((players ?? []).map((p) => [p.steam_id, p.id]));
  await db()
    .from("player_profiles")
    .insert(
      team.players.map((p) => {
        const broken = p.steamId === opts.brokenProfile;
        return {
          player_id: idOf.get(p.steamId)!,
          ...p.profile,
          phone: broken ? null : p.profile.phone,
          consent_at: broken ? null : now(),
          consent_version: broken ? null : PRIVACY_VERSION,
          updated_by: idOf.get(p.steamId)!,
        };
      }),
    )
    .throwOnError();
  const captain = idOf.get(team.players[0].steamId)!;
  const { data: row } = await db()
    .from("teams")
    .insert({ name: team.name, tag: team.tag, captain_id: captain, invite_code: `${DEMO_INVITE_PREFIX}${team.tag}`, region: "Усть-Каменогорск", description: `Демо-команда · ${team.organization}` })
    .select("id")
    .single()
    .throwOnError();
  await db()
    .from("team_members")
    .insert(team.players.map((p, i) => ({ team_id: row!.id, player_id: idOf.get(p.steamId)!, role: i === 0 ? ("captain" as const) : ("player" as const) })))
    .throwOnError();
  return { teamId: row!.id, captain, playerIds: team.players.map((p) => idOf.get(p.steamId)!) };
}

async function deleteTeamCompletely(teamId: string, playerIds: string[]) {
  await db().from("tournament_registrations").delete().eq("team_id", teamId).throwOnError();
  await db().from("team_members").delete().eq("team_id", teamId).throwOnError();
  await db().from("teams").delete().eq("id", teamId).throwOnError();
  await db().from("player_profiles").delete().in("player_id", playerIds).throwOnError();
  await db().from("notifications").delete().in("player_id", playerIds).throwOnError();
  await db().from("audit_logs").delete().in("actor_id", playerIds).throwOnError();
  await db().from("players").delete().in("id", playerIds).throwOnError();
}

export async function seedDemo(o: DemoOptions) {
  const ctx = context(o);
  const { log } = ctx;
  if (await loadTournament()) throw new Error(`Турнир ${DEMO_SLUG} уже есть — сначала cleanup`);
  const { count: leftovers } = await db().from("players").select("id", { count: "exact", head: true }).like("steam_id", `${DEMO_STEAM_PREFIX}%`);
  if (leftovers) throw new Error(`Остались демо-игроки (${leftovers}) от прошлого запуска — сначала cleanup`);

  const startsAt = now();
  const day = tournamentDay({ starts_at: startsAt });
  const teams = demoTeams(day);

  const { data: org } = await db()
    .from("players")
    .insert({ steam_id: DEMO_ORGANIZER_STEAM, nickname: "DEMO · Организатор", country: "KZ", profile_refreshed_at: noRefreshUntil() })
    .select("id")
    .single()
    .throwOnError();
  const organizer = org!.id;

  const { data: t } = await db()
    .from("tournaments")
    .insert({
      slug: DEMO_SLUG,
      name: DEMO_NAME,
      status: "registration",
      format: "5v5",
      bracket_type: "single_elimination",
      max_teams: 16,
      is_official: true,
      min_age: 16,
      max_age: 35,
      city: "Усть-Каменогорск",
      require_coach: true,
      allow_substitutes: false,
      third_place_match: true,
      autopilot: false,
      auto_approve: false,
      map_pool: DEMO_MAP_POOL,
      default_best_of: 1,
      final_best_of: 3,
      overtime: true,
      knife_round: false,
      starts_at: startsAt,
      location: "Усть-Каменогорск",
      description: "Демонстрационный турнир: команды, игроки и матчи вымышлены и будут удалены после показа. Ранние раунды BO1, полуфиналы, матч за 3-е место и финал — BO3.",
    })
    .select("*")
    .single()
    .throwOnError();
  const tournament = t as Tournament;
  await audit(organizer, "tournament.create", { type: "tournament", id: tournament.id }, { slug: DEMO_SLUG, demo: true });
  log(`Турнир «${DEMO_NAME}» создан (${tournament.id}), регистрация открыта`);

  // ── две неверные заявки: их отклоняет та же проверка, что и на сайте
  log("\nПроверка отказов (заявки, которые сайт не должен принять):");
  for (const bad of invalidDemoTeams(day)) {
    const ids = await insertTeam(bad, { brokenProfile: bad.expected === "profile_incomplete" ? bad.broken.steamId : undefined });
    // та же проверка, что показывает форма заявки капитану до отправки
    const profiles = await getProfiles(ids.playerIds);
    const issues = bad.players.flatMap((p, i) => checkPlayer({ id: ids.playerIds[i], nickname: p.nickname }, profiles.get(ids.playerIds[i]) ?? null, tournament, day).issues);
    const { error } = await db().rpc("save_official_registration", {
      p_tournament: tournament.id, p_team: ids.teamId, p_actor: ids.captain, p_main: ids.playerIds, p_sub: [], p_application: bad.application,
    });
    const ok = error?.message === bad.expected;
    log(`  ${ok ? "✓" : "✕"} ${bad.tag} «${bad.name}» (${bad.broken.problem})`);
    log(`      форма заявки: ${issues.join("; ") || "—"}`);
    log(`      база: ${error ? `${error.message} → «${registrationError(error)}»` : "ЗАЯВКА ПРИНЯТА (ошибка!)"}`);
    await deleteTeamCompletely(ids.teamId, ids.playerIds);
    if (!ok) throw new Error(`Неверная заявка ${bad.tag} не отклонена как ${bad.expected}`);
  }
  log("  тестовые команды DM17/DM18 и их игроки удалены");

  // ── 16 команд: игроки, анкеты, команды, заявки
  const registered: { team: DemoTeam; teamId: string; captain: string; playerIds: string[]; registrationId: string }[] = [];
  for (const team of teams) {
    const ids = await insertTeam(team);
    const { data } = await db()
      .rpc("save_official_registration", {
        p_tournament: tournament.id, p_team: ids.teamId, p_actor: ids.captain, p_main: ids.playerIds, p_sub: [], p_application: team.application,
      })
      .throwOnError();
    const registrationId = (data as { id: string }).id;
    await notify(ids.playerIds.slice(1), `${team.name} подала заявку на «${DEMO_NAME}»`, "Заявка ожидает подтверждения администратора.", `/tournaments/${DEMO_SLUG}`);
    await audit(ids.captain, "registration.create", { type: "tournament", id: tournament.id }, { team: team.tag });
    registered.push({ team, ...ids, registrationId });
  }
  log(`\n${registered.length} команд × 5 игроков: анкеты заполнены, заявки поданы через save_official_registration`);

  // ── документы сданы (игроки и тренер), заявки одобрены
  for (const r of registered) {
    await db()
      .from("tournament_participant_documents")
      .upsert(r.playerIds.map((player_id) => ({ tournament_id: tournament.id, player_id, marked_by: organizer })))
      .throwOnError();
    await db()
      .from("tournament_applications")
      .update({ coach_documents_at: now(), coach_documents_by: organizer })
      .eq("registration_id", r.registrationId)
      .throwOnError();
    await audit(organizer, "official.documents", { type: "tournament", id: tournament.id }, { team: r.team.tag, players: r.playerIds.length, coach: true, on: true });
    await db().rpc("change_registration", { p_registration: r.registrationId, p_actor: organizer, p_status: "approved", p_admin: true }).throwOnError();
    await notify([r.captain], `Заявка ${r.team.name} на «${DEMO_NAME}» одобрена`, undefined, `/tournaments/${DEMO_SLUG}`);
    await audit(organizer, "registration.approved", { type: "registration", id: r.registrationId }, { team: r.team.tag, note: null });
  }
  log("Документы отмечены сданными, 16 заявок одобрены");

  // ── check-in
  await db().from("tournaments").update({ status: "checkin", updated_at: now() }).eq("id", tournament.id).throwOnError();
  await audit(organizer, "tournament.status", { type: "tournament", id: tournament.id }, { from: "registration", to: "checkin" });
  await notify(registered.map((r) => r.captain), `Check-in на «${DEMO_NAME}» открыт`, "Подтвердите участие команды.", `/tournaments/${DEMO_SLUG}/checkin`);
  for (const r of registered) {
    await db().rpc("check_in_registration", { p_registration: r.registrationId, p_actor: organizer, p_admin: true }).throwOnError();
    await audit(organizer, "registration.checkin_admin", { type: "registration", id: r.registrationId });
  }
  log("Check-in открыт, все 16 команд отмечены");
  log(`\nДальше: play — жеребьёвка, сетка и матчи. Страница: ${ctx.site}/tournaments/${DEMO_SLUG}`);
  return { tournamentId: tournament.id, teams: registered.length };
}

// ───────────────────────── play

/** Жеребьёвка тем же путём, что «Провести жеребьёвку» (generateBracketAction, seeding = draw, только check-in) */
async function drawBracket(ctx: Ctx, t: Tournament, organizer: string) {
  const regs = (await getTournamentRegistrations(t.id)).filter((r) => r.status === "approved" && r.checked_in_at);
  if (regs.length < 2) throw new Error(`Недостаточно участников: ${regs.length}`);
  const ordered = drawOrder(regs);
  for (const [i, r] of ordered.entries()) await db().from("tournament_registrations").update({ seed: i + 1 }).eq("id", r.id).throwOnError();
  await createBracket(t, ordered.map((r) => r.team_id));
  await audit(organizer, "bracket.generate", { type: "tournament", id: t.id }, { teams: ordered.length, seeding: "draw", onlyCheckedIn: true });
  const record: DrawRecord = {
    order: ordered.map((r, i) => ({ seed: i + 1, team_id: r.team_id, name: r.team?.name ?? "—" })),
    teams: ordered.length,
    onlyCheckedIn: true,
    redo: false,
  };
  await audit(organizer, "bracket.draw", { type: "tournament", id: t.id }, record);
  ctx.log(`Жеребьёвка: ${record.order.map((x) => `${x.seed}. ${x.name}`).join(", ")}`);
}

const ROUND_TITLE: Record<string, string> = { "upper:1": "1/8 финала", "upper:2": "1/4 финала", "upper:3": "Полуфинал", "upper:4": "Финал", "third_place:4": "Матч за 3-е место" };
const stageOf = (m: { bracket: string; round: number }) => ROUND_TITLE[`${m.bracket}:${m.round}`] ?? `${m.bracket} ${m.round}`;

/** Вето капитанами: случайные допустимые баны/пики с паузами, через insertVetoAction (как ход капитана на сайте) */
async function runVeto(ctx: Ctx, matchId: string, organizer: string) {
  let m = (await getMatch(matchId))!;
  if (m.status === "upcoming") {
    await db().from("matches").update({ status: "veto", veto_deadline: new Date(Date.now() + VETO_STEP_SECONDS * 1000).toISOString() }).eq("id", m.id).eq("status", "upcoming").throwOnError();
    await notify([m.team1?.captain_id, m.team2?.captain_id].filter((x): x is string => !!x), `Вето матча #${m.number} началось`, `На каждый шаг — ${VETO_STEP_SECONDS} секунд.`, `/matches/${m.id}`);
    await audit(organizer, "match.veto_start", { type: "match", id: m.id });
    m = (await getMatch(matchId))!;
  }
  const steps: string[] = [];
  for (let guard = 0; m.status === "veto" && guard < 20; guard++) {
    const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
    if (!state.current || state.current.action === "decider") throw new Error(`Матч #${m.number}: вето застряло на шаге decider`);
    await sleep(ctx.fast ? 0 : 1200 + ctx.rng() * 1600);
    const side = state.current.team === 1 ? m.team1 : m.team2;
    const map = pick(ctx.rng, state.remaining);
    await insertVetoAction(m, map, side?.id ?? null, side?.captain_id ?? null, false, new Date(Date.now() + VETO_STEP_SECONDS * 1000));
    steps.push(`${state.current.action === "ban" ? "−" : "+"}${mapLabel(map)}`);
    m = (await getMatch(matchId))!;
  }
  if (steps.length) ctx.log(`  #${m.number} вето: ${steps.join(" ")} → ${m.maps.map((x) => mapLabel(x.map_name)).join(", ")}`);
  return m;
}

/** Составы матча → команды симуляции (роль и уровень игрока — из demo-data, уровень команды — по тегу) */
async function simTeams(m: MatchFull): Promise<{ team1: SimTeam; team2: SimTeam }> {
  const known = new Map(demoTeams().flatMap((t) => t.players.map((p) => [p.steamId, p] as const)));
  const strength = new Map(demoTeams().map((t) => [t.tag, t.strength]));
  const rosters = await getMatchRosters(m);
  const build = (team: MatchFull["team1"], rows: typeof rosters.team1): SimTeam => {
    const mains = rows.filter((r) => r.role === "main").map((r) => r.player);
    mains.sort((a, b) => (a.id === team?.captain_id ? -1 : b.id === team?.captain_id ? 1 : a.steam_id.localeCompare(b.steam_id)));
    return {
      name: team?.name ?? "—",
      strength: strength.get(String(team?.tag)) ?? 1,
      players: mains.map((p, i) => ({ steamId: p.steam_id, name: p.nickname.replace(/[<>"]/g, ""), role: known.get(p.steam_id)?.role ?? ROLES[i % 5], skill: known.get(p.steam_id)?.skill ?? 1 })),
    };
  };
  return { team1: build(m.team1, rosters.team1), team2: build(m.team2, rosters.team2) };
}

/** Серия: события MatchZy и лог CS2 по каждому раунду, итог карты, итог серии */
async function playSeries(ctx: Ctx, matchId: string) {
  let m = (await getMatch(matchId))!;
  if (!["ready", "live"].includes(m.status)) return;
  if (m.server_instance) throw new Error(`Матч #${m.number} назначен на сервер ${m.server_instance} — демо такие матчи не трогает`);
  const matchid = Number(m.matchzy_id);
  const { team1, team2 } = await simTeams(m);
  if (team1.players.length !== 5 || team2.players.length !== 5) throw new Error(`Матч #${m.number}: в составах не по 5 игроков`);
  const need = Math.floor(m.best_of / 2) + 1;
  let wins = { team1: 0, team2: 0 } as Record<TeamKey, number>;
  for (const map of m.maps) if (map.status === "finished") wins = { ...wins, [map.winner_id === m.team1_id ? "team1" : "team2"]: wins[map.winner_id === m.team1_id ? "team1" : "team2"] + 1 };

  if (m.status === "ready") {
    await sendEvent(ctx, { event: "series_start", matchid, num_maps: m.best_of, team1: { id: "team1", name: team1.name }, team2: { id: "team2", name: team2.name } });
  }
  for (const map of [...m.maps].sort((a, b) => a.map_number - b.map_number)) {
    if (map.status === "finished") continue;
    if (wins.team1 >= need || wins.team2 >= need) break;
    const map_number = map.map_number - 1; // MatchZy считает карты с 0
    await sendEvent(ctx, { event: "going_live", matchid, map_number });
    const sim = simulateMap({ team1, team2, rng: ctx.rng, team1StartsCT: ctx.rng() < 0.5 });
    // вживую: карта 60–90 с, раунд за раундом; быстро: лог и round_end пачками по 3 раунда, без пауз
    const batch = ctx.fast ? 3 : 1;
    const perStep = ctx.fast ? 0 : ((60_000 + ctx.rng() * 30_000) / sim.rounds.length) * batch;
    for (let i = 0; i < sim.rounds.length; i += batch) {
      const started = Date.now();
      const group = sim.rounds.slice(i, i + batch);
      const r = group[group.length - 1];
      await deliver(`лог матча ${matchid}`, () => ctx.transport.log(matchid, group.flatMap((x) => x.log).join("\n")));
      await sendEvent(ctx, {
        event: "round_end", matchid, map_number, round_number: r.number, round_time: 60 + Math.floor(ctx.rng() * 50), reason: r.reason,
        winner: { side: r.winnerSide.toLowerCase(), team: r.winner }, team1: r.team1, team2: r.team2,
      });
      await sleep(perStep - (Date.now() - started));
    }
    const last = sim.rounds[sim.rounds.length - 1];
    wins = { ...wins, [sim.winner]: wins[sim.winner] + 1 };
    await sendEvent(ctx, {
      event: "map_result", matchid, map_number,
      winner: { side: last.winnerSide.toLowerCase(), team: sim.winner },
      team1: { ...last.team1, series_score: wins.team1 },
      team2: { ...last.team2, series_score: wins.team2 },
    });
    ctx.log(`  #${m.number} ${mapLabel(map.map_name)}: ${team1.name} ${sim.score1}:${sim.score2} ${team2.name}${sim.overtime ? " (OT)" : ""}`);
    if (wins.team1 >= need || wins.team2 >= need) {
      const winner: TeamKey = wins.team1 >= need ? "team1" : "team2";
      await sendEvent(ctx, { event: "series_end", matchid, team1_series_score: wins.team1, team2_series_score: wins.team2, winner: { side: "", team: winner }, time_until_restore: 0 });
      break;
    }
    await sleep(ctx.fast ? 0 : 4000);
  }
  m = (await getMatch(matchId))!;
  const winnerName = m.winner_id === m.team1_id ? m.team1?.name : m.team2?.name;
  ctx.log(`  #${m.number} ${stageOf(m)}: ${m.team1?.name} ${m.team1_score}:${m.team2_score} ${m.team2?.name} — ${m.status === "finished" ? `победа ${winnerName}` : `статус ${m.status}`}`);
}

async function finishTournament(ctx: Ctx, t: Tournament, organizer: string) {
  const { data: open } = await db().from("matches").select("id").eq("tournament_id", t.id).not("status", "in", "(finished,cancelled)").throwOnError();
  if (open?.length) return false;
  if (t.status !== "finished") {
    await db().from("tournaments").update({ status: "finished", updated_at: now() }).eq("id", t.id).throwOnError();
    await audit(organizer, "tournament.status", { type: "tournament", id: t.id }, { from: t.status, to: "finished" });
  }
  return true;
}

export async function playDemo(o: DemoOptions) {
  const ctx = context(o);
  let t = await loadTournament();
  if (!t) throw new Error("Демо-турнира нет — сначала seed");
  if (t.autopilot) throw new Error("У демо-турнира включён автопилот — матчи ушли бы на реальные серверы. Остановлено.");
  const organizer = await organizerId();
  if (!t.bracket_published_at) await drawBracket(ctx, t, organizer);
  if (t.status !== "live" && t.status !== "finished") {
    await db().from("tournaments").update({ status: "live", updated_at: now() }).eq("id", t.id).throwOnError();
    await audit(organizer, "tournament.status", { type: "tournament", id: t.id }, { from: t.status, to: "live" });
    ctx.log("Турнир идёт (статус live)");
  }
  t = (await loadTournament())!;
  if (!ctx.fast) ctx.log("Темп: вето ~3 с на шаг, карта 60–90 с; весь турнир ≈ 12 минут (быстрее — play --fast)");

  for (let wave = 1; wave <= 10; wave++) {
    const { data: list } = await db()
      .from("matches")
      .select("id, number, bracket, round, status, team1_id, team2_id")
      .eq("tournament_id", t.id)
      .in("status", ["upcoming", "veto", "ready", "live"])
      .not("team1_id", "is", null)
      .not("team2_id", "is", null)
      .order("number")
      .throwOnError();
    if (!list?.length) break;
    ctx.log(`\nВолна ${wave}: ${[...new Set(list.map(stageOf))].join(", ")} — матчей ${list.length}`);
    await Promise.all(
      list.map(async (row, i) => {
        await sleep(ctx.fast ? 0 : i * 700); // старты матчей немного вразнобой
        await runVeto(ctx, row.id, organizer);
        await playSeries(ctx, row.id);
      }),
    );
  }
  if (!(await finishTournament(ctx, t, organizer))) throw new Error("Остались несыгранные матчи — запустите play ещё раз");
  ctx.log("\nТурнир завершён (статус finished)");
  return printSummary(ctx, (await loadTournament())!);
}

async function printSummary(ctx: Ctx, t: Tournament) {
  const recap = await getTournamentRecap(t);
  const nominations = await getTournamentNominations(t.id);
  ctx.log("\n═══ Итоги «" + t.name + "» ═══");
  for (const p of recap.placements) ctx.log(`  ${p.place} место — ${p.team.name} (серии ${p.record.wins}–${p.record.losses}, карты ${p.record.mapWins}:${p.record.mapLosses})`);
  ctx.log("Номинации (кандидат по статистике):");
  for (const n of nominations) ctx.log(`  ${n.title}: ${n.winner ? `${n.winner.name}${n.winner.team ? ` (${n.winner.team.name})` : ""}${n.winner.value ? ` — ${n.winner.value}` : ""}` : "решение судей"}`);
  ctx.log(`Всего: матчей ${recap.totals.matches}, карт ${recap.totals.maps}, раундов ${recap.totals.rounds}, убийств ${recap.totals.kills}`);
  const s = ctx.site;
  ctx.log("\nСсылки:");
  ctx.log(`  Турнир:            ${s}/tournaments/${t.slug}`);
  ctx.log(`  Итоги:             ${s}/tournaments/${t.slug}/recap`);
  ctx.log(`  Статистика:        ${s}/stats/${t.slug}`);
  ctx.log(`  Админка турнира:   ${s}/admin/tournaments/${t.id}`);
  ctx.log(`  Excel (акимат):    ${s}/admin/tournaments/${t.id}/official-export`);
  ctx.log(`  Печать заявок:     ${s}/admin/tournaments/${t.id}/application`);
  ctx.log(`  Дипломы:           ${s}/admin/tournaments/${t.id}/diplomas`);
  return { placements: recap.placements.map((p) => ({ place: p.place, team: p.team.name })), nominations: nominations.filter((n) => n.winner).map((n) => ({ key: n.key, name: n.winner!.name })) };
}

// ───────────────────────── status

export async function statusDemo(o: DemoOptions) {
  const ctx = context(o);
  const t = await loadTournament();
  if (!t) {
    ctx.log("Демо-турнира нет");
    return null;
  }
  const { count: regs } = await db().from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).eq("status", "approved");
  ctx.log(`«${t.name}» — статус ${t.status}, одобрено заявок ${regs ?? 0}, сетка ${t.bracket_published_at ? "опубликована" : "не создана"}`);
  const { data: ms } = await db()
    .from("matches")
    .select("id, number, bracket, round, status, best_of, team1_score, team2_score, server_instance, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name), maps:match_maps(map_number, map_name, status, team1_score, team2_score)")
    .eq("tournament_id", t.id)
    .order("number")
    .throwOnError();
  for (const m of ms ?? []) {
    const maps = [...(m.maps ?? [])].sort((a, b) => a.map_number - b.map_number).filter((x) => x.status !== "pending").map((x) => `${mapLabel(x.map_name)} ${x.team1_score}:${x.team2_score}${x.status === "live" ? "*" : ""}`);
    ctx.log(`  #${String(m.number).padStart(2)} ${stageOf(m).padEnd(18)} BO${m.best_of} ${m.status.padEnd(8)} ${m.team1?.name ?? "—"} ${m.team1_score}:${m.team2_score} ${m.team2?.name ?? "—"}${maps.length ? `  [${maps.join(", ")}]` : ""}${m.server_instance ? `  СЕРВЕР ${m.server_instance}!` : ""}`);
  }
  if (t.status === "finished") await printSummary(ctx, t);
  return { status: t.status, matches: ms?.length ?? 0 };
}

// ───────────────────────── cleanup

/** Удаляет все демо-данные в порядке внешних ключей и возвращает остатки по таблицам (должны быть нули) */
export async function cleanupDemo(o: DemoOptions) {
  const ctx = context(o);
  const { data: ts } = await db().from("tournaments").select("id").eq("slug", DEMO_SLUG).throwOnError();
  const tournamentIds = (ts ?? []).map((t) => t.id);
  const { data: ps } = await db().from("players").select("id").like("steam_id", `${DEMO_STEAM_PREFIX}%`).throwOnError();
  const playerIds = (ps ?? []).map((p) => p.id);
  const { data: tm } = await db().from("teams").select("id").like("invite_code", `${DEMO_INVITE_PREFIX}%`).throwOnError();
  const teamIds = (tm ?? []).map((t) => t.id);
  const matches = tournamentIds.length
    ? ((await db().from("matches").select("id, matchzy_id").in("tournament_id", tournamentIds).throwOnError()).data ?? [])
    : [];
  const matchIds = matches.map((m) => m.id);
  const matchzyIds = matches.map((m) => m.matchzy_id).filter((x): x is number => x != null);
  const regIds = tournamentIds.length
    ? ((await db().from("tournament_registrations").select("id").in("tournament_id", tournamentIds).throwOnError()).data ?? []).map((r) => r.id)
    : [];
  // заявки демо-команд в других турнирах (не должно быть) тоже уходят вместе с командами
  const teamRegIds = teamIds.length ? ((await db().from("tournament_registrations").select("id").in("team_id", teamIds).throwOnError()).data ?? []).map((r) => r.id) : [];
  const allRegIds = [...new Set([...regIds, ...teamRegIds])];
  const entityIds = [...new Set([...tournamentIds, ...matchIds, ...allRegIds, ...teamIds, ...playerIds])];
  ctx.log(`Найдено: турнир ${tournamentIds.length}, матчей ${matchIds.length}, команд ${teamIds.length}, игроков ${playerIds.length}`);

  const byMatch = ["match_events", "match_rounds", "player_map_stats", "player_map_swing", "match_log_state", "match_maps", "veto_actions", "disputes"] as const;
  for (const table of byMatch) await inChunks(matchIds, async (c) => (await db().from(table).delete().in("match_id", c).throwOnError()).data);
  // статистика демо-игроков, попавшая в другие матчи (не должно быть)
  await inChunks(playerIds, async (c) => (await db().from("player_map_stats").delete().in("player_id", c).throwOnError()).data);
  if (tournamentIds.length) {
    await db().from("roster_changes").delete().in("tournament_id", tournamentIds).throwOnError();
    await db().from("matches").update({ winner_to_match: null, loser_to_match: null }).in("tournament_id", tournamentIds).throwOnError();
    await db().from("matches").delete().in("tournament_id", tournamentIds).throwOnError();
    for (const table of ["tournament_nominations", "tournament_participant_documents", "tournament_applications", "tournament_roster_players"] as const) {
      await db().from(table).delete().in("tournament_id", tournamentIds).throwOnError();
    }
  }
  await inChunks(allRegIds, async (c) => (await db().from("tournament_roster_players").delete().in("registration_id", c).throwOnError()).data);
  await inChunks(allRegIds, async (c) => (await db().from("tournament_registrations").delete().in("id", c).throwOnError()).data);
  await inChunks(entityIds, async (c) => (await db().from("audit_logs").delete().in("entity_id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("audit_logs").delete().in("actor_id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("notifications").delete().in("player_id", c).throwOnError()).data);
  await inChunks(teamIds, async (c) => (await db().from("team_members").delete().in("team_id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("team_members").delete().in("player_id", c).throwOnError()).data);
  await inChunks(teamIds, async (c) => (await db().from("team_tag_aliases").delete().in("team_id", c).throwOnError()).data);
  await inChunks(teamIds, async (c) => (await db().from("teams").delete().in("id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("player_profiles").delete().in("player_id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("rate_limit_claims").delete().in("actor_id", c).throwOnError()).data);
  await inChunks(playerIds, async (c) => (await db().from("players").delete().in("id", c).throwOnError()).data);
  if (tournamentIds.length) await db().from("tournaments").delete().in("id", tournamentIds).throwOnError();
  // отметки о принятых событиях: лог — по номеру матча, события MatchZy — по журналу этого компьютера
  for (const id of matchzyIds) await db().from("ingest_dedupe").delete().like("key", `log${id}:%`).throwOnError();
  let journalKeys: string[] = [];
  if (existsSync(ctx.journal)) {
    journalKeys = [...new Set(readFileSync(ctx.journal, "utf8").split(/\r?\n/).filter((k) => /^mz:[0-9a-f]{64}$/.test(k)))];
    await inChunks(journalKeys, async (c) => (await db().from("ingest_dedupe").delete().in("key", c).throwOnError()).data);
  }

  // ── проверка: ничего демо не осталось
  const count = async (table: string, run: () => PromiseLike<{ count: number | null }>) => [table, (await run()).count ?? 0] as const;
  const countIn = async (table: string, column: string, ids: string[]) => {
    let total = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      // имя таблицы и столбца — из списка выше; типы supabase-js не выводятся для объединения таблиц
      const { count: n } = await db().from(table as "players").select("*", { count: "exact", head: true }).in(column as "id", ids.slice(i, i + CHUNK)).throwOnError();
      total += n ?? 0;
    }
    return [`${table}.${column}`, total] as const;
  };
  const leftovers = [
    await count("tournaments", () => db().from("tournaments").select("id", { count: "exact", head: true }).eq("slug", DEMO_SLUG)),
    await count("players", () => db().from("players").select("id", { count: "exact", head: true }).like("steam_id", `${DEMO_STEAM_PREFIX}%`)),
    await count("teams", () => db().from("teams").select("id", { count: "exact", head: true }).like("invite_code", `${DEMO_INVITE_PREFIX}%`)),
    ...(await Promise.all([
      countIn("matches", "id", matchIds),
      ...byMatch.map((t) => countIn(t, "match_id", matchIds)),
      countIn("matches", "tournament_id", tournamentIds),
      countIn("roster_changes", "tournament_id", tournamentIds),
      countIn("tournament_nominations", "tournament_id", tournamentIds),
      countIn("tournament_participant_documents", "tournament_id", tournamentIds),
      countIn("tournament_applications", "tournament_id", tournamentIds),
      countIn("tournament_roster_players", "tournament_id", tournamentIds),
      countIn("tournament_registrations", "id", allRegIds),
      countIn("audit_logs", "entity_id", entityIds),
      countIn("audit_logs", "actor_id", playerIds),
      countIn("notifications", "player_id", playerIds),
      countIn("team_members", "team_id", teamIds),
      countIn("team_members", "player_id", playerIds),
      countIn("team_tag_aliases", "team_id", teamIds),
      countIn("player_profiles", "player_id", playerIds),
      countIn("player_map_stats", "player_id", playerIds),
      countIn("rate_limit_claims", "actor_id", playerIds),
      countIn("ingest_dedupe", "key", journalKeys),
    ])),
    ["ingest_dedupe (лог матчей)", (await Promise.all(matchzyIds.map(async (id) => (await db().from("ingest_dedupe").select("key", { count: "exact", head: true }).like("key", `log${id}:%`)).count ?? 0))).reduce((a, b) => a + b, 0)] as const,
  ];
  ctx.log("\nОстатки после очистки:");
  for (const [table, n] of leftovers) ctx.log(`  ${n === 0 ? "✓" : "✕"} ${table}: ${n}`);
  const total = leftovers.reduce((s, [, n]) => s + n, 0);
  if (total === 0 && existsSync(ctx.journal)) rmSync(ctx.journal, { force: true });
  ctx.log(total === 0 ? "Все демо-данные удалены." : `ВНИМАНИЕ: осталось строк: ${total}`);
  return { leftovers: Object.fromEntries(leftovers), total };
}
