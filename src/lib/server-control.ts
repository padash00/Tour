import "server-only";
import { timingSafeEqual } from "node:crypto";
import { notify } from "./audit";
import { getMatch, getMatchRosters, recomputeSeries, syncBracket } from "./matches";
import { db } from "./supabase";
import { modeOf } from "./modes";
import { getSetting } from "./settings";
import { startMapLogging, stopMapLogging } from "./swing-ingest";
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
    | "prefetch_maps";
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
      // дуэль: без фризтайма (MatchZy применяет эти cvars через секунду после live.cfg, где стоит 18 с)
      ...(modeOf(m.tournament.format).size === 1 && { mp_freezetime: 0, mp_round_restart_delay: 2, mp_halftime_duration: 5 }),
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
    .update({ server_instance: instanceName, server_state: "loading", server_address: null, server_password: null })
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
};

export async function applyAgentReport(report: AgentReport) {
  const now = new Date().toISOString();
  await db()
    .from("server_host")
    .upsert({ id: "main", lan_ip: report.lan_ip ?? null, last_seen_at: now, info: report.info ?? {} });

  const lanIp = report.lan_ip;
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

    // health check: матч загрузился на назначенный сервер → выдаём адрес игрокам
    const m = match as Match | null;
    if (m && m.server_instance === inst.name && m.server_state === "loading" && gamestate && gamestate !== "none" && lanIp) {
      const { data: row } = await db().from("server_instances").select("port").eq("name", inst.name).single();
      await db()
        .from("matches")
        .update({ server_state: "ready", server_address: `${lanIp}:${row?.port}` })
        .eq("id", m.id);
      const full = await getMatch(m.id);
      const captains = [full?.team1?.captain_id, full?.team2?.captain_id].filter(Boolean) as string[];
      await notify(captains, `Сервер для матча #${m.number} готов`, "Откройте страницу матча и нажмите «Подключиться».", `/matches/${m.id}`);
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
        },
      };
    }
    return c;
  }));
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
