import "server-only";
import { db } from "../supabase";
import { getServerState, hostBusy } from "./state";

// Серверы сами делятся между турнирами и лобби — переключать «для лобби» руками не нужно.
//   - Турнирное время (турнир идёт, в check-in или начнётся в ближайшие 2 часа): все свободные серверы — турниру,
//     новые игры лобби ждут. Выключенный сервер запускается, когда готовому матчу не хватает сервера.
//   - В остальное время все свободные серверы — лобби.
// Сервер с идущей игрой не переключается, пока она не закончится. Флаг server_instances.for_lobby остаётся
// источником правды для назначения (его проверяет assign_game_server), сайт лишь сам его выставляет.

const TOURNAMENT_LEAD_MS = 2 * 60 * 60_000; // игры лобби, начатые раньше, успевают доиграть
const START_COOLDOWN_MS = 3 * 60_000;

/** Турнирное время: идёт или в check-in турнир, либо до начала турнира с открытой регистрацией меньше 2 часов */
export async function isTournamentTime(now = Date.now()) {
  const { data } = await db()
    .from("tournaments")
    .select("status, starts_at")
    .in("status", ["registration", "checkin", "live"]);
  return (data ?? []).some((t) => {
    if (t.status !== "registration") return true;
    if (!t.starts_at) return false;
    const start = new Date(t.starts_at).getTime();
    // давно прошедшая дата у забытого турнира не держит серверы вечно
    return start - now <= TOURNAMENT_LEAD_MS && now - start < 12 * 3600_000;
  });
}

export async function balanceServersTick() {
  const { online, instances, host } = await getServerState();
  if (!online || hostBusy(host).host) return;
  const [tournamentTime, { data: matchRows }, { data: lobbyRows }] = await Promise.all([
    isTournamentTime(),
    db().from("matches").select("server_instance").not("server_instance", "is", null).in("status", ["ready", "live"]),
    db().from("lobby_games").select("server_instance").not("server_instance", "is", null).in("status", ["waiting", "live"]),
  ]);
  const byMatch = new Set((matchRows ?? []).map((r) => r.server_instance));
  const byLobby = new Set((lobbyRows ?? []).map((r) => r.server_instance));

  // 1. флаг — только у свободных серверов
  const forLobby = !tournamentTime;
  for (const i of instances) {
    if (byMatch.has(i.name) || byLobby.has(i.name)) continue;
    if ((i.gamestate ?? "none") !== "none" && i.running) continue; // на сервере ещё что-то загружено
    if (i.for_lobby === forLobby) continue;
    await db().from("server_instances").update({ for_lobby: forLobby }).eq("name", i.name).eq("for_lobby", !forLobby);
  }
  if (!tournamentTime) return; // выключенные серверы лобби запускает сама (assignLobbyServers)

  // 2. готовым матчам не хватает запущенных серверов → запускаем выключенные (по одному на матч)
  const { count: waiting } = await db()
    .from("matches")
    .select("id, tournament:tournaments!inner(status)", { count: "exact", head: true })
    .eq("status", "ready")
    .is("server_instance", null)
    .in("tournament.status", ["checkin", "live"]);
  const freeRunning = instances.filter((i) => i.running && (i.gamestate ?? "none") === "none" && !byMatch.has(i.name) && !byLobby.has(i.name)).length;
  const deficit = (waiting ?? 0) - freeRunning;
  if (deficit <= 0) return;
  const stopped = instances.filter((i) => !i.running && !byMatch.has(i.name) && !byLobby.has(i.name)).slice(0, deficit);
  const since = new Date(Date.now() - START_COOLDOWN_MS).toISOString();
  for (const i of stopped) {
    const { count } = await db()
      .from("agent_commands")
      .select("id", { count: "exact", head: true })
      .eq("type", "start")
      .eq("instance", i.name)
      .gte("created_at", since);
    if (!count) await db().from("agent_commands").insert({ instance: i.name, type: "start", payload: { tournament: true } });
  }
}
