import "server-only";
import { createHmac } from "node:crypto";
import { getSetting } from "./settings";
import { db } from "./supabase";
import { AGENT_OFFLINE_AFTER_MS } from "./server/state";

// Демо карт лежат на серверном ПК (MatchZy пишет .dem каждой карты). Агент присылает список готовых
// записей (app_settings.AGENT_DEMOS), а файл игрок качает прямо с ПК по ссылке, подписанной токеном агента
// (server/agent/demos.mjs проверяет ту же подпись). Через Vercel демо не идут: предел тела 4.5 МБ.

export const DEMO_DAYS_DEFAULT = 30;
const LINK_TTL_S = 6 * 3600; // докачка обрыва — в пределах срока ссылки

export type AgentDemoFile = { file: string; matchzy_id: number; map: number; size: number; at: string };
type AgentDemos = { port: number; files: AgentDemoFile[]; at: string };

/** Карта матча (нумерация сайта, с 1) → её записи; после автоподъёма сервера у карты бывает несколько частей */
export type MatchDemo = { file: string; mapNumber: number; size: number; part: number; parts: number };

export async function saveAgentDemos(demos: { port: number; files: AgentDemoFile[] }) {
  const at = new Date().toISOString();
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: "AGENT_DEMOS", value: JSON.stringify({ ...demos, at }), updated_at: at });
  if (error) throw new Error("Не удалось сохранить список демо", { cause: error });
}

async function agentDemos(): Promise<AgentDemos | null> {
  const { data } = await db().from("app_settings").select("value").eq("key", "AGENT_DEMOS").maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as AgentDemos;
  } catch {
    return null;
  }
}

/** Демо матча и доступен ли сейчас серверный ПК (выключен — скачать нельзя) */
export async function getMatchDemos(matchzyId: number | null): Promise<{ demos: MatchDemo[]; online: boolean }> {
  if (matchzyId == null) return { demos: [], online: false };
  const [list, { data: host }] = await Promise.all([
    agentDemos(),
    db().from("server_host").select("last_seen_at").eq("id", "main").maybeSingle(),
  ]);
  const files = (list?.files ?? []).filter((f) => f.matchzy_id === matchzyId).sort((a, b) => a.map - b.map || (a.at < b.at ? -1 : 1));
  const demos = files.map((f) => {
    const same = files.filter((x) => x.map === f.map);
    return { file: f.file, mapNumber: f.map + 1, size: f.size, part: same.indexOf(f) + 1, parts: same.length };
  });
  const online = !!host?.last_seen_at && Date.now() - new Date(host.last_seen_at).getTime() < AGENT_OFFLINE_AFTER_MS;
  return { demos, online };
}

/** То же вычисляет агент (server/agent/demos.mjs → demoSignature) */
function signature(token: string, file: string, exp: number, name: string) {
  return createHmac("sha256", token).update(`${file}\n${exp}\n${name}`).digest("hex");
}

/**
 * Подписанная ссылка на файл на серверном ПК. Адрес — тот же, что игроки видели для подключения к матчу;
 * у старых матчей без адреса — как для новых (настройка «IP сервера для игроков», затем UPnP, затем LAN).
 * null — файла нет в списке агента или адрес неизвестен.
 */
export async function demoDownloadUrl(matchzyId: number, file: string, name: string, serverAddress: string | null) {
  const token = process.env.AGENT_TOKEN;
  const list = await agentDemos();
  if (!token || !list?.files.some((f) => f.file === file && f.matchzy_id === matchzyId)) return null;
  let host = serverAddress?.replace(/:\d+$/, "") || null;
  if (!host) {
    const { data } = await db().from("server_host").select("lan_ip, info").eq("id", "main").maybeSingle();
    const upnpIp = (data?.info as { upnp?: { ip?: string | null } } | null)?.upnp?.ip ?? null;
    host = ((await getSetting("PLAYER_IP")) ?? "").trim() || upnpIp || data?.lan_ip || null;
  }
  if (!host) return null;
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const q = new URLSearchParams({ f: file, e: String(exp), n: name, s: signature(token, file, exp, name) });
  return `http://${host}:${list.port}/demo?${q}`;
}

/** Имя файла для сохранения: только латиница — агент отдаёт его в Content-Disposition как есть */
export function demoFileName(matchNumber: number, mapNumber: number, mapName: string, part: number, parts: number) {
  const map = mapName.split("@")[0].replace(/[^\w-]+/g, "_").slice(0, 40) || "map";
  return `F16_match${matchNumber}_map${mapNumber}_${map}${parts > 1 ? `_part${part}` : ""}.dem`;
}
