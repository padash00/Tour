import "server-only";
import { notify } from "../audit";
import { currentLobbyMap, lobbyAddress, lobbyEnforce, type LobbyGame } from "../lobby";
import { getMatch } from "../matches";
import { getSetting } from "../settings";
import { logSiteError } from "../site-errors";
import type { Json } from "../database.types";
import { db } from "../supabase";
import type { Match } from "../types";
import { adminIds } from "./admins";
import { signedLogQuery } from "./ingest-signature";
import { matchEnforce, matchzyPostCommands } from "./matchzy-config";
import { saveSelfCheck } from "./ops";
import { MATCHZY_HEADER, type AgentCommand } from "./state";
import { MAP_LOAD_TIMEOUT_MS, expectedMapName, saveWorkshopResults, workshopInfo } from "./workshop";

// ───────────────────────── синхронизация с агентом

export type AgentReport = {
  protocol?: number;
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

type ReportedInstance = NonNullable<AgentReport["instances"]>[number];

/**
 * Состояние хоста и инстансов → в базу; health check назначенных матчей.
 * Ошибка на одном инстансе не мешает остальным и выдаче команд: пишем её в журнал ошибок сайта и идём дальше.
 */
export async function applyAgentReport(report: AgentReport) {
  const now = new Date().toISOString();
  const { error: hostError } = await db()
    .from("server_host")
    // info пришёл JSON-телом запроса агента — это JSON по построению
    .upsert({ id: "main", lan_ip: report.lan_ip ?? null, last_seen_at: now, info: (report.info ?? {}) as Json });
  if (hostError) throw new Error("Не удалось сохранить отчёт агента", { cause: hostError });

  const upnpIp = (report.info as { upnp?: { ip?: string | null } } | undefined)?.upnp?.ip ?? null;
  const lanIp = ((await getSetting("PLAYER_IP")) ?? "").trim() || upnpIp || report.lan_ip || null;
  for (const inst of report.instances ?? []) {
    try {
      await applyInstance(inst, now, lanIp, report.lan_ip ?? null, upnpIp);
    } catch (e) {
      console.error(`agent report: ${inst.name} failed`, e);
      await logSiteError({ source: "server", message: `Agent report: ${inst.name}: ${(e as Error)?.message ?? e}`, path: "/api/agent/sync", kind: "background_job" }).catch(() => {});
    }
  }
}

async function applyInstance(inst: ReportedInstance, now: string, lanIp: string | null, reportLanIp: string | null, upnpIp: string | null) {
  const gamestate = inst.running ? (inst.get5?.gamestate ?? null) : null;
  const matchzyId = inst.running ? (inst.get5?.matchid ?? null) : null;
  const { data: match } = matchzyId
    ? await db().from("matches").select("*").eq("matchzy_id", matchzyId).maybeSingle().throwOnError()
    : { data: null };
  if (matchzyId && !match && gamestate && gamestate !== "none") {
    await lobbyHealthCheck(matchzyId, inst.name, inst.map ?? null, reportLanIp, upnpIp);
  }

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
    .eq("name", inst.name).throwOnError();

  // health check: матч загрузился на назначенный сервер и на нём нужная карта → выдаём адрес игрокам
  const m = match as Match | null;
  if (!(m && m.server_instance === inst.name && m.server_state === "loading" && gamestate && gamestate !== "none" && lanIp)) return;
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
    return;
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

/**
 * Игра лобби загрузилась на назначенный сервер и на нём нужная карта → выдаём адрес игрокам.
 * Не загрузилась за 2 минуты (Workshop-карта не работает в CS2) → ошибка, игра снова ждёт сервер.
 */
async function lobbyHealthCheck(matchzyId: number, instance: string, map: string | null, lanIp: string | null, upnpIp: string | null) {
  const { data } = await db().from("lobby_games").select("*").eq("matchzy_id", matchzyId).maybeSingle();
  const g = data as LobbyGame | null;
  if (!g || g.server_instance !== instance || g.server_state !== "loading") return;
  const want = currentLobbyMap(g);
  const expected = want && want.includes("@") ? ((await workshopInfo())[want.split("@")[1]]?.map ?? null) : want;
  if (expected && map && map !== expected) {
    const waited = g.server_assigned_at ? Date.now() - new Date(g.server_assigned_at).getTime() : 0;
    if (waited > MAP_LOAD_TIMEOUT_MS) {
      await db().from("lobby_games").update({ server_state: "error", note: `карта ${expected} не загрузилась на ${instance}` }).eq("id", g.id);
    }
    return;
  }
  const ip = await lobbyAddress(g, lanIp, upnpIp);
  if (!ip) return;
  const { data: row } = await db().from("server_instances").select("port").eq("name", instance).single();
  await db()
    .from("lobby_games")
    .update({ server_state: "ready", server_address: `${ip}:${row?.port}`, server_ready_at: new Date().toISOString(), note: null })
    .eq("id", g.id);
  // адрес — только в карточке игры (его видят участники), не в общем чате
  await db().from("lobby_messages").insert({ lobby_id: g.lobby_id, player_id: null, body: "Сервер готов — нажмите «Подключиться»" });
}

/** Отдаёт агенту ожидающие команды, подставляя абсолютные URL и токены */
export async function takePendingCommands(siteOrigin: string, replay = false) {
  const { data, error } = await db().rpc("claim_agent_commands", { p_replay: replay });
  if (error) throw new Error("Не удалось получить очередь команд", { cause: error });
  const commands = ((data ?? []) as AgentCommand[]).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (commands.length === 0) return [];
  const token = process.env.MATCHZY_TOKEN ?? "";

  return Promise.all(commands.map(async (c) => {
    if (c.type === "load_match" && c.payload.lobby) {
      // игра лобби: без HTTP-лога (раунды для Swing не нужны), cvars из настроек лобби
      return {
        ...c,
        payload: {
          ...c.payload,
          url: `${siteOrigin}/api/matchzy/config/${c.payload.match_id}`,
          header_key: MATCHZY_HEADER,
          header_value: token,
          events_url: `${siteOrigin}/api/matchzy/events`,
          post_cmds: [],
          enforce: await lobbyEnforce(String(c.payload.match_id)),
        },
      };
    }
    if (c.type === "load_match") {
      return {
        ...c,
        payload: {
          ...c.payload,
          url: `${siteOrigin}/api/matchzy/config/${c.payload.match_id}`,
          header_key: MATCHZY_HEADER,
          header_value: token,
          events_url: `${siteOrigin}/api/matchzy/events`,
          // в адресе лога — подпись для этого матча, а не сам токен (адрес виден в консоли CS2 и логах)
          log_url: `${siteOrigin}/api/cs2/log?${signedLogQuery(String(c.payload.matchzy_id), token)}`,
          // настройки плагина MatchZy (int-convar'ы) не принимаются из cvars конфига матча — ставим RCON-ом
          post_cmds: await matchzyPostCommands(String(c.payload.match_id)),
          enforce: await matchEnforce(String(c.payload.match_id)),
        },
      };
    }
    return c;
  }));
}

export async function ackCommand(id: string, ok: boolean, result: string) {
  const { data, error: readError } = await db().from("agent_commands").select("*").eq("id", id).maybeSingle();
  if (readError) throw new Error("Не удалось прочитать команду", { cause: readError });
  const cmd = data as AgentCommand | null;
  if (!cmd) return false;
  // Delayed/duplicate acknowledgements must not overwrite a watchdog decision.
  if (cmd.status === "done" || cmd.status === "error") return true;
  if (cmd.status !== "sent") return false;
  if (cmd.type === "prefetch_maps") await saveWorkshopResults(result);
  if (cmd.type === "self_check" && ok) await saveSelfCheck(result);
  // load_match всегда адресован инстансу; без него update не нашёл бы строку (server_instance = null не совпадает)
  if (cmd.type === "load_match" && !ok && cmd.instance) {
    const table = cmd.payload.lobby ? "lobby_games" : "matches";
    const { error } = await db().from(table).update({ server_state: "error" })
      .eq("id", String(cmd.payload.match_id)).eq("server_instance", cmd.instance)
      .eq("server_state", "loading").lte("server_assigned_at", cmd.created_at);
    if (error) throw new Error("Не удалось сохранить ошибку загрузки", { cause: error });
  }
  const { error } = await db()
    .from("agent_commands")
    .update({ status: ok ? "done" : "error", result: result.slice(0, 4000), done_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sent");
  if (error) throw new Error("Не удалось подтвердить команду", { cause: error });
  return true;
}
