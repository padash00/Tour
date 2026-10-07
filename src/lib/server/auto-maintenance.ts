import "server-only";
import { notify } from "../audit";
import { db } from "../supabase";
import { adminIds } from "./admins";
import { getCs2UpdateCheck } from "./ops";
import { enqueueCommand, getServerState, hostBusy } from "./state";

// ───────────────────────── обслуживание без людей

const AUTO_UPDATE_KEY = "AUTO_CS2_UPDATE";
const NIGHTLY_KEY = "NIGHTLY_RESTART";

/** Серверы свободны: ни одного матча на них и агент ничем не занят */
async function serversIdle() {
  const { online, host, instances } = await getServerState();
  const busy = hostBusy(host);
  if (!online || busy.host || busy.instances.size) return false;
  if (instances.some((i) => i.running && (i.gamestate ?? "none") !== "none")) return false;
  const { count: lobbyGames } = await db()
    .from("lobby_games")
    .select("id", { count: "exact", head: true })
    .not("server_instance", "is", null)
    .in("status", ["waiting", "live"]);
  if ((lobbyGames ?? 0) > 0) return false;
  const { count } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .not("server_instance", "is", null)
    .in("status", ["ready", "live"]);
  if ((count ?? 0) > 0) return false;
  const { count: pending } = await db()
    .from("agent_commands")
    .select("id", { count: "exact", head: true })
    .is("instance", null)
    .in("status", ["pending", "sent"]);
  return (pending ?? 0) === 0;
}

const getKey = async (key: string) => (await db().from("app_settings").select("value").eq("key", key).maybeSingle()).data?.value ?? null;
const setKey = (key: string, value: string) => db().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });

/**
 * Раз в минуту (фоновые задачи обслуживания):
 *  - вышло обновление CS2 (Steam требует новую версию) → как только серверы свободны, обновляем сами
 *    (к старым серверам игроки с обновлённым клиентом не подключатся); одна попытка на версию;
 *  - каждую ночь в 05:00–05:30 по Алматы перезапускаем серверы, если идёт не турнирный день
 *    (нет турниров в check-in или «идёт») — свежий запуск с актуальными настройками и плагинами.
 */
export async function autoMaintenanceTick() {
  const check = await getCs2UpdateCheck();
  if (check && check.up_to_date === false && check.required) {
    const done = await getKey(AUTO_UPDATE_KEY);
    if (done !== check.required && (await serversIdle())) {
      await setKey(AUTO_UPDATE_KEY, check.required);
      await enqueueCommand(null, "update_cs2", { auto: true });
      await notify(
        await adminIds(),
        "CS2 обновляется автоматически",
        `Steam требует версию ${check.required}, серверы свободны — агент обновляет CS2 и перезапускает серверы (5–20 минут).`,
        "/admin/servers",
      );
      return;
    }
  }

  const almaty = new Date(Date.now() + 5 * 3600_000);
  const day = almaty.toISOString().slice(0, 10);
  const minutes = almaty.getUTCHours() * 60 + almaty.getUTCMinutes();
  if (minutes < 300 || minutes > 330) return;
  if ((await getKey(NIGHTLY_KEY)) === day) return;
  const { count: active } = await db()
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .in("status", ["checkin", "live"]);
  if ((active ?? 0) > 0 || !(await serversIdle())) return;
  await setKey(NIGHTLY_KEY, day);
  await enqueueCommand(null, "restart_all", { auto: true });
}
