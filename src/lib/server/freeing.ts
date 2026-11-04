import "server-only";
import { db } from "../supabase";

/** Сколько ждём только что отпущенный сервер, прежде чем занять следующий */
export const FREEING_WAIT_MS = 90_000;

/**
 * Серверы, которые только что отпустили: игра на них закончилась или её закрыли (команда «закончить матч»)
 * меньше 90 секунд назад, но агент ещё не доложил, что сервер пуст. Такой сервер вот-вот освободится —
 * новую игру (турнир или лобби) лучше подождать на нём, чем занимать следующий по номеру.
 */
export async function recentlyFreed(names: string[]): Promise<Set<string>> {
  if (!names.length) return new Set();
  const since = new Date(Date.now() - FREEING_WAIT_MS).toISOString();
  const [{ data: cmds }, { data: ms }, { data: gs }] = await Promise.all([
    db().from("agent_commands").select("instance").eq("type", "end_match").in("instance", names).gte("created_at", since),
    db().from("matches").select("server_instance").in("server_instance", names).gte("finished_at", since),
    db().from("lobby_games").select("server_instance").in("server_instance", names).gte("finished_at", since),
  ]);
  return new Set([...(cmds ?? []).map((c) => c.instance), ...(ms ?? []).map((m) => m.server_instance), ...(gs ?? []).map((g) => g.server_instance)].filter((n): n is string => !!n));
}
