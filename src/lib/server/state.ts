import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "../supabase";

// ───────────────────────── авторизация агента и MatchZy

export function safeEqual(a: string, b: string) {
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
  /** отдан под лобби — турниры его не берут */
  for_lobby?: boolean;
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
    | "self_check"
    | "replay_failed_events";
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "done" | "error";
  result: string | null;
  created_at: string;
  sent_at: string | null;
  done_at: string | null;
  delivery_attempts: number;
};

/** Агент шлёт отчёт раз в 5 с отдельно от опроса серверов и команд; 45 с тишины — нет связи */
export const AGENT_OFFLINE_AFTER_MS = 45_000;

export async function getServerState() {
  const [{ data: host, error: hostError }, { data: instances, error: instanceError }] = await Promise.all([
    db().from("server_host").select("*").eq("id", "main").maybeSingle(),
    db().from("server_instances").select("*").order("name"),
  ]);
  if (hostError || instanceError) throw new Error("Не удалось получить состояние серверов");
  const h = host as ServerHost | null;
  const online = !!h?.last_seen_at && Date.now() - new Date(h.last_seen_at).getTime() < AGENT_OFFLINE_AFTER_MS;
  return { host: h, online, instances: (instances ?? []) as ServerInstance[] };
}

/** Чем занят агент: обслуживание всего хоста (busy) или отдельные инстансы (busy_instances, например прогрев карт) */
export function hostBusy(host: ServerHost | null) {
  const info = (host?.info ?? {}) as { busy?: string | null; busy_instances?: Record<string, string> | null };
  return { host: info.busy ?? null, instances: new Set(Object.keys(info.busy_instances ?? {})) };
}

/** Служебные команды без отдельной подписи в журнале команд (журнал показывает их тип как есть) */
export type ServiceCommandType = "replay_failed_events";

export async function enqueueCommand(
  instance: string | null,
  type: AgentCommand["type"] | ServiceCommandType,
  payload: Record<string, unknown> = {},
  createdBy?: string,
) {
  const { error } = await db().from("agent_commands").insert({ instance, type, payload, created_by: createdBy ?? null });
  if (error) throw new Error("Не удалось поставить команду агенту в очередь", { cause: error });
}
