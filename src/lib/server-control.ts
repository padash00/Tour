import "server-only";
import { timingSafeEqual } from "node:crypto";
import { notify } from "./audit";
import { getMatch, getMatchRosters, recomputeSeries, syncBracket } from "./matches";
import { db } from "./supabase";
import { modeOf } from "./modes";
import { getSetting, getWorkshopMaps } from "./settings";
import { startMapLogging, stopMapLogging } from "./swing-ingest";
import { saveSelfCheck, type AgentEvent } from "./server/ops";
import type { Match } from "./types";

// ───────────────────────── авторизация агента и MatchZy

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const MATCHZY_HEADER = "X-F16-Token";

/** Authorization: Bearer <token> или X-F16-Token: <token> (MatchZy не умеет значения заголовков с пробелом) */
export function checkBearer(request: Request, envName: "AGENT_TOKEN" | "MATCHZY_TOKEN") {
  const expected = process.env[envName];
  if (!expected) return false;
  const bearer = request.headers.get("authorization") ?? "";
  const plain = request.headers.get(MATCHZY_HEADER) ?? "";
  return safeEqual(bearer, `Bearer ${expected}`) || safeEqual(plain, expected);
}

// ───────────────────────── типы

export type ServerInstance = {
  name: string;
  port: number;
  role: "active" | "reserve";
  running: boolean;
  gamestate: string | null;
  map: string | null;
  players: number | null;
  matchzy_match_id: number | null;
  match_id: string | null;
  last_seen_at: string | null;
  info: Record<string, unknown>;
};

export type ServerHost = { id: string; lan_ip: string | null; last_seen_at: string | null; info: Record<string, unknown> };

export type AgentCommand = {
  id: string;
  instance: string | null;
  type:
    | "start"
    | "stop"
    | "restart"
    | "load_match"
    | "end_match"
    | "rcon"
    | "update_cs2"
    | "update_plugins"
    | "restart_all"
    | "prefetch_maps"
    | "self_check";
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "done" | "error";
  result: string | null;
  created_at: string;
};

export const AGENT_OFFLINE_AFTER_MS = 30_000;

export async function getServerState() {
  const [{ data: host }, { data: instances }] = await Promise.all([
    db().from("server_host").select("*").eq("id", "main").maybeSingle(),
    db().from("server_instances").select("*").order("name"),
  ]);
  const h = host as ServerHost | null;
  const online = !!h?.last_seen_at && Date.now() - new Date(h.last_seen_at).getTime() < AGENT_OFFLINE_AFTER_MS;
  return { host: h, online, instances: (instances ?? []) as ServerInstance[] };
}

export async function enqueueCommand(
  instance: string | null,
  type: AgentCommand["type"],
  payload: Record<string, unknown> = {},
  createdBy?: string,
) {
  await db().from("agent_commands").insert({ instance, type, payload, created_by: createdBy ?? null });
}

// ───────────────────────── конфиг матча для MatchZy

export async function buildMatchzyConfig(matchId: string) {
  const m = await getMatch(matchId);
  if (!m || !m.team1 || !m.team2 || m.maps.length === 0 || m.matchzy_id == null) return null;
  const rosters = await getMatchRosters(m);
  const players = (list: typeof rosters.team1) =>
    Object.fromEntries(list.map((r) => [r.player.steam_id, r.player.nickname]));

  const observers = ((await getSetting("OBSERVER_STEAM_IDS")) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));

  return {
    matchid: m.matchzy_id,
    team1: { id: m.team1.id, name: m.team1.name, tag: m.team1.tag, players: players(rosters.team1) },
    team2: { id: m.team2.id, name: m.team2.name, tag: m.team2.tag, players: players(rosters.team2) },
    num_maps: m.best_of,
    // workshop-карта хранится как «name@id» — MatchZy грузит её по числовому ID (host_workshop_map)
    maplist: m.maps.map((x) => (x.map_name.includes("@") ? x.map_name.split("@")[1] : x.map_name)),
    // нож — победитель выбирает сторону; без ножа стороны чередуются (team1 начинает за CT на нечётных картах)
    map_sides: m.maps.map((_, i) => (m.tournament.knife_round ? "knife" : i % 2 === 0 ? "team1_ct" : "team2_ct")),
    skip_veto: true, // вето уже прошло на сайте
    clinch_series: true,
    players_per_team: modeOf(m.tournament.format).size,
    min_players_to_ready: modeOf(m.tournament.format).size * 2,
    wingman: modeOf(m.tournament.format).wingman,
    min_spectators_to_ready: 0,
    spectators: { players: Object.fromEntries(observers.map((id, i) => [id, `F16 Observer ${i + 1}`])) },
    // только числовые cvars: MatchZy выполняет их без кавычек.
    // Адрес отправки событий агент выставляет отдельно через RCON.
    cvars: {
      mp_overtime_enable: m.tournament.overtime ? 1 : 0,
      mp_overtime_maxrounds: 6,
      mp_team_timeout_max: m.tournament.timeouts_per_team,
      mp_team_timeout_time: m.tournament.timeout_seconds,
      // MatchZy применяет эти cvars через секунду после live.cfg; на aim-картах — без фризтайма
      ...modeCvars(m.tournament.format, m.maps.map((x) => x.map_name)),
    },
  };
}

// ───────────────────────── назначение сервера

/** Свободный инстанс: агент его видит запущенным, MatchZy без матча, и он не закреплён за другим матчем */
export async function pickFreeInstance(preferRole: "active" | "reserve" = "active") {
  const { online, instances, host } = await getServerState();
  if (!online) return null;
  // агент занят обслуживанием (прогрев карт, обновление) — серверы могут менять карту, не назначаем
  if ((host?.info as { busy?: string | null } | undefined)?.busy) return null;
  const { data: busy } = await db()
    .from("matches")
    .select("server_instance")
    .not("server_instance", "is", null)
    .in("status", ["ready", "live"]);
  const taken = new Set((busy ?? []).map((b) => b.server_instance));
  const free = instances.filter((i) => i.running && (i.gamestate ?? "none") === "none" && !taken.has(i.name));
  return free.find((i) => i.role === preferRole) ?? free[0] ?? null;
}

export async function assignServer(match: Match, instanceName: string, actorId?: string) {
  await db()
    .from("matches")
    .update({
      server_instance: instanceName,
      server_state: "loading",
      server_address: null,
      server_password: null,
      server_assigned_at: new Date().toISOString(),
      server_ready_at: null,
    })
    .eq("id", match.id);
  await enqueueCommand(instanceName, "load_match", { match_id: match.id, matchzy_id: match.matchzy_id }, actorId);
}

// ───────────────────────── синхронизация с агентом

export type AgentReport = {
  lan_ip?: string;
  info?: Record<string, unknown>;
  instances?: {
    name: string;
    running: boolean;
    map?: string | null;
    players?: number | null;
    get5?: { gamestate?: string; matchid?: number | null; map_number?: number | null } | null;
  }[];
  /** события агента: сервер упал и поднят / не удалось поднять */
  events?: AgentEvent[];
};

export async function applyAgentReport(report: AgentReport) {
  const now = new Date().toISOString();
  await db()
    .from("server_host")
    .upsert({ id: "main", lan_ip: report.lan_ip ?? null, last_seen_at: now, info: report.info ?? {} });

  const upnpIp = (report.info as { upnp?: { ip?: string | null } } | undefined)?.upnp?.ip ?? null;
  const lanIp = ((await getSetting("PLAYER_IP")) ?? "").trim() || upnpIp || report.lan_ip;
  for (const inst of report.instances ?? []) {
    const gamestate = inst.running ? (inst.get5?.gamestate ?? null) : null;
    const matchzyId = inst.running ? (inst.get5?.matchid ?? null) : null;
    const { data: match } = matchzyId
      ? await db().from("matches").select("*").eq("matchzy_id", matchzyId).maybeSingle()
      : { data: null };

    await db()
      .from("server_instances")
      .update({
        running: inst.running,
        gamestate,
        map: inst.map ?? null,
        players: inst.players ?? null,
        matchzy_match_id: matchzyId,
        match_id: match?.id ?? null,
        last_seen_at: now,
      })
      .eq("name", inst.name);

    // health check: матч загрузился на назначенный сервер и на нём нужная карта → выдаём адрес игрокам
    const m = match as Match | null;
    if (m && m.server_instance === inst.name && m.server_state === "loading" && gamestate && gamestate !== "none" && lanIp) {
      const expected = await expectedMapName(m.id);
      if (expected && inst.map && inst.map !== expected) {
        // карта ещё грузится (Workshop качается) или не загрузилась вовсе
        const waited = m.server_assigned_at ? Date.now() - new Date(m.server_assigned_at).getTime() : 0;
        if (waited > MAP_LOAD_TIMEOUT_MS) {
          await db().from("matches").update({ server_state: "error" }).eq("id", m.id);
          await notify(
            await adminIds(),
            `Матч #${m.number}: карта не загрузилась на ${inst.name}`,
            `Ожидалась ${expected}, на сервере ${inst.map}. Проверьте карту (Workshop-карта из CS:GO в CS2 не работает) или перенесите матч.`,
            `/admin/matches/${m.id}`,
          );
        }
        continue;
      }
      const { data: row } = await db().from("server_instances").select("port").eq("name", inst.name).single();
      await db()
        .from("matches")
        .update({ server_state: "ready", server_address: `${lanIp}:${row?.port}`, server_ready_at: new Date().toISOString() })
        .eq("id", m.id);
      const full = await getMatch(m.id);
      const captains = [full?.team1?.captain_id, full?.team2?.captain_id].filter(Boolean) as string[];
      await notify(
        captains,
        `Сервер для матча #${m.number} готов: ${lanIp}:${row?.port}`,
        "Откройте страницу матча и нажмите «Подключиться». На подключение — 15 минут.",
        `/matches/${m.id}`,
      );
    }
  }
}

/** Отдаёт агенту ожидающие команды, подставляя абсолютные URL и токены */
export async function takePendingCommands(siteOrigin: string) {
  const { data } = await db()
    .from("agent_commands")
    .select("*")
    .eq("status", "pending")
    .order("created_at")
    .limit(20);
  const commands = (data ?? []) as AgentCommand[];
  if (commands.length === 0) return [];
  await db()
    .from("agent_commands")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .in("id", commands.map((c) => c.id));

  return Promise.all(commands.map(async (c) => {
    if (c.type === "load_match") {
      return {
        ...c,
        payload: {
          ...c.payload,
          url: `${siteOrigin}/api/matchzy/config/${c.payload.match_id}`,
          header_key: MATCHZY_HEADER,
          header_value: process.env.MATCHZY_TOKEN,
          events_url: `${siteOrigin}/api/matchzy/events`,
          log_url: `${siteOrigin}/api/cs2/log?m=${c.payload.matchzy_id}&t=${process.env.MATCHZY_TOKEN}`,
          // настройки плагина MatchZy (int-convar'ы) не принимаются из cvars конфига матча — ставим RCON-ом
          post_cmds: await matchzyPostCommands(String(c.payload.match_id)),
          enforce: await matchEnforce(String(c.payload.match_id)),
        },
      };
    }
    return c;
  }));
}

/**
 * Настройки режима. Workshop-карты (aim_map и т.п.) часто сами ставят mp_maxrounds и прочее —
 * агент проверяет их каждые 5 секунд и возвращает, пока идёт матч.
 */
export function modeCvars(format: string, maps: string[] = []): Record<string, number> {
  const size = modeOf(format).size;
  const base: Record<string, number> =
    size === 1 ? { mp_maxrounds: 24, mp_halftime_duration: 5 } : size === 2 ? { mp_maxrounds: 16 } : { mp_maxrounds: 24 };
  // aim-карты (aim_map и т.п.): без фризтайма и с быстрым рестартом раунда; на обычных картах — стандарт MatchZy
  if (maps.length > 0 && maps.every(isAimMap)) return { ...base, mp_freezetime: 0, mp_round_restart_delay: 2 };
  // обычные карты: фризтайм 15 с, как в соревновательном CS2 (в live.cfg MatchZy стоит 18); Wingman — свой конфиг
  return size === 2 ? base : { ...base, mp_freezetime: 15 };
}

/** aim-карта: aim_map, aim_map@3070549948, aim_redline… */
export function isAimMap(map: string) {
  return /^aim[_-]/i.test(map.split("@")[0]);
}

async function matchEnforce(matchId: string) {
  const { data } = await db().from("matches").select("matchzy_id, tournament:tournaments(format)").eq("id", matchId).single();
  const row = data as unknown as { matchzy_id: number; tournament: { format: string } } | null;
  if (!row) return null;
  const { data: maps } = await db().from("match_maps").select("map_name").eq("match_id", matchId);
  const cvars = modeCvars(row.tournament.format, (maps ?? []).map((x) => x.map_name));
  return Object.keys(cvars).length ? { matchid: row.matchzy_id, cvars } : null;
}

async function matchzyPostCommands(matchId: string) {
  const { data } = await db()
    .from("matches")
    .select("tournament:tournaments(tech_pauses, tech_pause_seconds)")
    .eq("id", matchId)
    .single();
  const t = (data as unknown as { tournament: { tech_pauses: number; tech_pause_seconds: number } } | null)?.tournament;
  if (!t) return [];
  return [`matchzy_max_tech_pauses_allowed ${t.tech_pauses}`, `matchzy_tech_pause_duration ${t.tech_pause_seconds}`];
}

export async function ackCommand(id: string, ok: boolean, result: string) {
  const { data } = await db()
    .from("agent_commands")
    .update({ status: ok ? "done" : "error", result: result.slice(0, 4000), done_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  const cmd = data as AgentCommand | null;
  if (cmd?.type === "prefetch_maps") await saveWorkshopResults(result);
  if (cmd?.type === "self_check" && ok) await saveSelfCheck(result);
  if (cmd?.type === "load_match" && !ok) {
    await db().from("matches").update({ server_state: "error" }).eq("id", String(cmd.payload.match_id));
  }
}

// ───────────────────────── события MatchZy

type StatsPlayer = { steamid: string; name: string; stats: Record<string, number> };
type StatsTeam = { id?: string; name?: string; score?: number; series_score?: number; players?: StatsPlayer[] };
type MatchzyEvent = {
  event: string;
  matchid?: number;
  map_number?: number;
  round_number?: number;
  winner?: { side?: string; team?: string };
  team1?: StatsTeam;
  team2?: StatsTeam;
  team1_series_score?: number;
  team2_series_score?: number;
};

async function upsertPlayerStats(match: Match, mapNumber: number, ev: MatchzyEvent) {
  const sides: [StatsTeam | undefined, string | null][] = [
    [ev.team1, match.team1_id],
    [ev.team2, match.team2_id],
  ];
  const all = sides.flatMap(([t]) => t?.players ?? []);
  if (all.length === 0) return;
  const { data: known } = await db().from("players").select("id, steam_id").in("steam_id", all.map((p) => String(p.steamid)));
  const byStem = new Map((known ?? []).map((p) => [p.steam_id, p.id]));

  const rows = sides.flatMap(([t, teamId]) =>
    (t?.players ?? []).map((p) => {
      const s = p.stats ?? {};
      const n = (k: string) => Number(s[k] ?? 0) || 0;
      return {
        match_id: match.id,
        map_number: mapNumber,
        steam_id: String(p.steamid),
        player_id: byStem.get(String(p.steamid)) ?? null,
        team_id: teamId,
        name: p.name,
        kills: n("kills"),
        deaths: n("deaths"),
        assists: n("assists"),
        damage: n("damage"),
        headshot_kills: n("headshot_kills"),
        rounds_played: n("rounds_played"),
        kast: n("kast"),
        first_kills: n("first_kills_t") + n("first_kills_ct"),
        first_deaths: n("first_deaths_t") + n("first_deaths_ct"),
        trade_kills: n("trade_kills"),
        clutch_wins: n("1v1") + n("1v2") + n("1v3") + n("1v4") + n("1v5"),
        multi_kills: { "2k": n("2k"), "3k": n("3k"), "4k": n("4k"), "5k": n("5k") },
        utility_damage: n("utility_damage"),
        enemies_flashed: n("enemies_flashed"),
        flash_assists: n("flash_assists"),
        bomb_plants: n("bomb_plants"),
        bomb_defuses: n("bomb_defuses"),
        mvp: n("mvp"),
        raw: s,
        updated_at: new Date().toISOString(),
      };
    }),
  );
  await db().from("player_map_stats").upsert(rows, { onConflict: "match_id,map_number,steam_id" });
}

export async function handleMatchzyEvent(ev: MatchzyEvent) {
  const { data } = ev.matchid != null
    ? await db().from("matches").select("*").eq("matchzy_id", ev.matchid).maybeSingle()
    : { data: null };
  const match = data as Match | null;

  await db().from("match_events").insert({
    match_id: match?.id ?? null,
    matchzy_id: ev.matchid ?? null,
    event: ev.event,
    map_number: ev.map_number ?? null,
    round_number: ev.round_number ?? null,
    payload: ev,
  });
  if (!match) return;

  // MatchZy нумерует карты с 0, у нас — с 1
  const mapNumber = (ev.map_number ?? 0) + 1;
  const setMap = (patch: Record<string, unknown>) =>
    db().from("match_maps").update(patch).eq("match_id", match.id).eq("map_number", mapNumber);

  switch (ev.event) {
    case "series_start":
    case "going_live": {
      if (match.status === "ready") {
        await db().from("matches").update({ status: "live", started_at: new Date().toISOString() }).eq("id", match.id);
      }
      if (ev.event === "going_live") {
        await setMap({ status: "live" });
        await startMapLogging(match.id, mapNumber);
      }
      break;
    }
    case "round_end": {
      await setMap({ team1_score: ev.team1?.score ?? 0, team2_score: ev.team2?.score ?? 0, status: "live" });
      await upsertPlayerStats(match, mapNumber, ev);
      break;
    }
    case "map_result": {
      const winnerTeam = ev.winner?.team === "team1" ? match.team1_id : ev.winner?.team === "team2" ? match.team2_id : null;
      await setMap({
        team1_score: ev.team1?.score ?? 0,
        team2_score: ev.team2?.score ?? 0,
        status: "finished",
        winner_id: winnerTeam,
      });
      await upsertPlayerStats(match, mapNumber, ev);
      await stopMapLogging(match.id);
      if (match.status === "ready") await db().from("matches").update({ status: "live" }).eq("id", match.id);
      await recomputeSeries(match.id);
      break;
    }
    case "series_end": {
      const fresh = await getMatch(match.id);
      if (fresh && fresh.status !== "finished") {
        const winner = ev.winner?.team === "team1" ? match.team1_id : ev.winner?.team === "team2" ? match.team2_id : null;
        if (winner) {
          await db()
            .from("matches")
            .update({
              status: "finished",
              winner_id: winner,
              team1_score: ev.team1_series_score ?? fresh.team1_score,
              team2_score: ev.team2_series_score ?? fresh.team2_score,
              finished_at: new Date().toISOString(),
            })
            .eq("id", match.id);
          await syncBracket(match.tournament_id);
        }
      }
      break;
    }
  }
}

// ───────────────────────── автопилот

const AUTOPILOT_LEAD_MS = 10 * 60_000; // матч с расписанием уходит на сервер за 10 минут до начала

/**
 * Автопилот: для турниров с включённым автопилотом запускает вето у матчей с известными соперниками
 * и отправляет готовые матчи на свободные серверы. Вызывается на каждой синхронизации агента.
 */
export async function autopilotTick() {
  const { data: ts } = await db()
    .from("tournaments")
    .select("id, map_pool")
    .eq("autopilot", true)
    .in("status", ["checkin", "live"]);
  if (!ts?.length) return;

  const now = Date.now();
  const due = (m: { scheduled_at: string | null }) => !m.scheduled_at || new Date(m.scheduled_at).getTime() - now <= AUTOPILOT_LEAD_MS;

  for (const t of ts) {
    const { data: list } = await db()
      .from("matches")
      .select("id, number, round, stage, status, scheduled_at, server_instance, server_state, team1_id, team2_id")
      .eq("tournament_id", t.id)
      .in("status", ["upcoming", "veto", "ready", "live"])
      .order("number");
    const matches = (list ?? []).sort(
      (a, b) =>
        (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") || a.round - b.round || a.number - b.number,
    );
    const stageIds = new Set(matches.filter((m) => m.stage === "group" || m.stage === "swiss").map((m) => m.id));
    // участник не может играть два матча одновременно: занят, если его матч уже на сервере или идёт
    const busy = new Set<string>();
    for (const m of matches) {
      if (m.status === "live" || (m.status === "ready" && m.server_instance && m.server_state !== "error")) {
        if (m.team1_id) busy.add(m.team1_id);
        if (m.team2_id) busy.add(m.team2_id);
      }
    }
    // группы / круговая / швейцарка — строго по турам: следующий тур, когда весь текущий сыгран
    const { data: openStage } = await db()
      .from("matches")
      .select("round, stage")
      .eq("tournament_id", t.id)
      .in("stage", ["group", "swiss"])
      .not("status", "in", "(finished,cancelled)");
    const currentRound = openStage?.length ? Math.min(...openStage.map((x) => x.round)) : null;
    const free = (m: { team1_id: string | null; team2_id: string | null; round: number; id: string }) =>
      !!m.team1_id &&
      !!m.team2_id &&
      !busy.has(m.team1_id) &&
      !busy.has(m.team2_id) &&
      (currentRound == null || !stageIds.has(m.id) || m.round === currentRound);

    // 1. вето — как только соперники известны
    for (const m of matches.filter((x) => x.status === "upcoming" && x.team1_id && x.team2_id && due(x) && free(x))) {
      const { data: updated } = await db()
        .from("matches")
        .update({ status: "veto", veto_deadline: new Date(now + 60_000).toISOString() })
        .eq("id", m.id)
        .eq("status", "upcoming")
        .select("id");
      if (!updated?.length) continue;
      const { data: teams } = await db().from("teams").select("captain_id").in("id", [m.team1_id, m.team2_id]);
      await notify(
        (teams ?? []).map((x) => x.captain_id),
        `Вето матча #${m.number} началось`,
        "Автопилот: на каждый шаг — 60 секунд.",
        `/matches/${m.id}`,
      );
    }

    // 2. готовые матчи — на свободные серверы
    for (const m of matches.filter((x) => x.status === "ready" && (!x.server_instance || x.server_state === "error") && due(x))) {
      if (!free(m)) continue; // кто-то из участников ещё доигрывает другой матч
      if (await workshopLoadBusy(m.id)) continue; // другой сервер сейчас качает/грузит карту — по одному
      const inst = await pickFreeInstance();
      if (!inst) return; // свободных серверов нет — ждём следующей синхронизации
      busy.add(m.team1_id!);
      busy.add(m.team2_id!);
      const { data: full } = await db().from("matches").select("*").eq("id", m.id).single();
      if (!full) continue;
      await assignServer(full as Match, inst.name);
      await db()
        .from("audit_logs")
        .insert({ action: "autopilot.assign", entity_type: "match", entity_id: m.id, payload: { instance: inst.name } });
    }
  }
}

/** Workshop-карты турнира (формат «name@id») → прогрев на сервере, чтобы к матчу карта уже была в кэше */
export async function enqueuePrefetch(tournamentId: string, actorId?: string) {
  const { data: t } = await db().from("tournaments").select("map_pool").eq("id", tournamentId).single();
  const ids = ((t?.map_pool ?? []) as string[]).filter((m) => m.includes("@")).map((m) => m.split("@")[1]);
  if (!ids.length) return 0;
  await enqueueCommand(null, "prefetch_maps", { workshop_ids: ids }, actorId);
  return ids.length;
}

/**
 * Проверка перед турниром: активные инстансы и Workshop-карты турниров, которые ещё не прошли.
 * Агент сам запускает выключенные инстансы, проверяет и возвращает их в прежнее состояние.
 */
export async function enqueueSelfCheck(actorId?: string) {
  const [{ data: insts }, { data: ts }] = await Promise.all([
    db().from("server_instances").select("name, role").order("name"),
    db().from("tournaments").select("map_pool").not("status", "in", "(finished,cancelled)"),
  ]);
  const instances = (insts ?? []).filter((i) => i.role === "active").map((i) => i.name);
  const workshop = [
    ...new Set(((ts ?? []) as { map_pool: string[] }[]).flatMap((t) => (t.map_pool ?? []).filter((m) => m.includes("@")).map((m) => m.split("@")[1]))),
  ];
  await enqueueCommand(null, "self_check", { instances, workshop_ids: workshop }, actorId);
}

// ───────────────────────── проверка карты

const MAP_LOAD_TIMEOUT_MS = 2 * 60_000;

async function adminIds() {
  const { data } = await db().from("players").select("id, steam_id, is_admin");
  const envAdmins = (process.env.ADMIN_STEAM_IDS ?? "").split(",").map((s) => s.trim());
  return (data ?? []).filter((p) => p.is_admin || envAdmins.includes(p.steam_id)).map((p) => p.id);
}

/**
 * Какое имя карты должен показать сервер: стандартная — её id (de_mirage),
 * workshop — внутреннее имя, которое агент узнал при проверке (aim_map@3070549948 → aim_map_d).
 * null — проверить нельзя (workshop-карта ещё не проверялась).
 */
export async function expectedMapName(matchId: string): Promise<string | null> {
  const { data: maps } = await db().from("match_maps").select("map_name, status, map_number").eq("match_id", matchId).order("map_number");
  const current = (maps ?? []).find((x) => x.status !== "finished") ?? maps?.[0];
  if (!current) return null;
  if (!current.map_name.includes("@")) return current.map_name;
  const info = await workshopInfo();
  return info[current.map_name.split("@")[1]]?.map ?? null;
}

export type WorkshopInfo = Record<string, { map: string | null; ok: boolean; seconds?: number; checked_at: string; note?: string }>;

export async function workshopInfo(): Promise<WorkshopInfo> {
  const { data } = await db().from("app_settings").select("value").eq("key", "WORKSHOP_MAP_INFO").maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as WorkshopInfo) : {};
  } catch {
    return {};
  }
}

/** Результат прогрева от агента («123 → aim_map_d (5 с)» / «123: не загрузилась за 600 с») → в библиотеку */
async function saveWorkshopResults(result: string) {
  const info = await workshopInfo();
  const now = new Date().toISOString();
  for (const m of result.matchAll(/(\d+) → ([\w.-]+) \((\d+) с\)/g)) info[m[1]] = { map: m[2], ok: true, seconds: Number(m[3]), checked_at: now };
  for (const m of result.matchAll(/(\d+): не загрузилась за (\d+) с/g)) {
    info[m[1]] = { map: null, ok: false, checked_at: now, note: "не загружается в CS2 — возможно, карта из CS:GO" };
  }
  await db().from("app_settings").upsert({ key: "WORKSHOP_MAP_INFO", value: JSON.stringify(info), updated_at: now });
}

/**
 * Карты библиотеки, которые ещё ни разу не проверялись на сервере, → прогрев.
 * Не чаще раза в 10 минут, чтобы не держать сервер занятым.
 */
export async function verifyWorkshopLibrary() {
  const [library, info] = await Promise.all([getWorkshopMaps(), workshopInfo()]);
  // непроверенные + те, что не загрузились больше часа назад (сбой мог быть разовым — сервер упал, Steam тормозил)
  const hourAgo = Date.now() - 60 * 60_000;
  const unchecked = library
    .map((w) => w.split("@")[1])
    .filter((id) => !info[id] || (!info[id].ok && new Date(info[id].checked_at).getTime() < hourAgo));
  if (!unchecked.length) return;
  // прогрев идёт до 4 минут; команда старше 10 минут считается зависшей (агент перезапускался) и не блокирует
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db()
    .from("agent_commands")
    .select("id", { count: "exact", head: true })
    .eq("type", "prefetch_maps")
    .gte("created_at", since);
  if (count) return;
  await enqueueCommand(null, "prefetch_maps", { workshop_ids: unchecked });
}

// ───────────────────────── сторож: зависшие команды и загрузки

/** Команды агента, которые выполняются быстро (агент обрывает их через 60 с) */
const QUICK_COMMANDS = ["start", "stop", "restart", "load_match", "end_match", "rcon"];
const STALE_COMMAND_MS = 3 * 60_000;
const LOAD_WATCHDOG_MS = MAP_LOAD_TIMEOUT_MS + 60_000;

/**
 * Агент перезапустился посреди команды или упал — команда навсегда «отправлено», а матч навсегда «loading».
 * Такие команды закрываем ошибкой, а матч переводим в «error», чтобы автопилот/админ перенёс его.
 * Вызывается на каждой синхронизации агента.
 */
export async function expireStaleWork() {
  const staleBefore = new Date(Date.now() - STALE_COMMAND_MS).toISOString();
  const { data: stale } = await db()
    .from("agent_commands")
    .update({ status: "error", result: "нет ответа агента (перезапуск или сбой) — команда снята", done_at: new Date().toISOString() })
    .eq("status", "sent")
    .in("type", QUICK_COMMANDS)
    .lt("sent_at", staleBefore)
    .select("id, type, instance, payload");
  for (const c of stale ?? []) {
    if (c.type === "load_match" && c.payload?.match_id) {
      await db().from("matches").update({ server_state: "error" }).eq("id", String(c.payload.match_id)).eq("server_state", "loading");
    }
  }

  // матч «загружается», но MatchZy так и не взял его (конфиг не скачался, команда потерялась)
  const loadBefore = new Date(Date.now() - LOAD_WATCHDOG_MS).toISOString();
  const { data: loading } = await db()
    .from("matches")
    .select("id, number, matchzy_id, server_instance")
    .eq("server_state", "loading")
    .lt("server_assigned_at", loadBefore);
  if (!loading?.length) return;
  const { data: insts } = await db().from("server_instances").select("name, matchzy_match_id");
  const onServer = new Map((insts ?? []).map((i) => [i.name, i.matchzy_match_id]));
  for (const m of loading) {
    if (onServer.get(m.server_instance) === m.matchzy_id) continue; // загружен — ждёт карту, это проверяет health check
    await db().from("matches").update({ server_state: "error" }).eq("id", m.id).eq("server_state", "loading");
    await notify(
      await adminIds(),
      `Матч #${m.number}: сервер ${m.server_instance} не принял матч`,
      "MatchZy не загрузил конфиг за 3 минуты. Автопилот перенесёт матч на свободный сервер; проверьте журнал команд агента.",
      `/admin/matches/${m.id}`,
    );
  }
}

/**
 * Матч с Workshop-картой ждёт, если:
 *  - карта ещё не прогрета/не подтверждена прогревом (загрузка через матч без кэша роняет сервер) —
 *    прогрев запустит verifyWorkshopLibrary / enqueuePrefetch, матч уйдёт после подтверждения;
 *  - другой матч сейчас грузится: все инстансы делят одну папку steamapps, загружаем по одному.
 */
async function workshopLoadBusy(matchId: string) {
  const { data: maps } = await db().from("match_maps").select("map_name").eq("match_id", matchId).order("map_number");
  const ws = (maps ?? []).map((m) => m.map_name).filter((n) => n.includes("@"));
  if (!ws.length) return false;
  const info = await workshopInfo();
  const unverified = ws.map((n) => n.split("@")[1]).filter((id) => !info[id]?.ok);
  if (unverified.length) {
    // карт турнира может не быть в библиотеке — прогреваем их напрямую (не чаще раза в 10 минут)
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db()
      .from("agent_commands")
      .select("id", { count: "exact", head: true })
      .eq("type", "prefetch_maps")
      .gte("created_at", since);
    if (!count) await enqueueCommand(null, "prefetch_maps", { workshop_ids: [...new Set(unverified)] });
    return true;
  }
  const { count } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("server_state", "loading")
    .neq("id", matchId);
  return !!count;
}

// ───────────────────────── закрытие матчей завершённого турнира

/**
 * Турнир завершён или отменён → его несыгранные матчи отменяются, серверы освобождаются.
 * Вызывается при смене статуса и на каждом тике агента (подчищает старые данные).
 */
export async function closeMatchesOfEndedTournaments(tournamentId?: string, actorId?: string) {
  let q = db().from("tournaments").select("id").in("status", ["finished", "cancelled"]);
  if (tournamentId) q = q.eq("id", tournamentId);
  const { data: ts } = await q;
  const ids = (ts ?? []).map((t) => t.id);
  if (!ids.length) return 0;

  const { data: open } = await db()
    .from("matches")
    .select("id, server_instance")
    .in("tournament_id", ids)
    .in("status", ["pending", "upcoming", "veto", "ready", "live"]);
  if (!open?.length) return 0;

  for (const m of open) {
    if (m.server_instance) await enqueueCommand(m.server_instance, "end_match", {}, actorId);
  }
  await db()
    .from("matches")
    .update({ status: "cancelled", server_instance: null, server_state: null, server_address: null, server_password: null })
    .in(
      "id",
      open.map((m) => m.id),
    );
  await db()
    .from("audit_logs")
    .insert({ action: "tournament.close_matches", entity_type: "tournament", entity_id: ids[0], payload: { matches: open.length } });
  return open.length;
}
