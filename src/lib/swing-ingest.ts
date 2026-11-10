import "server-only";
import { modeOf } from "./modes";
import { db } from "./supabase";
import { computeRoundSwing, parseLogLine, updateRoster, type LogEvent, type Side } from "./swing";

type State = {
  match_id: string;
  live: boolean;
  map_number: number;
  round_number: number;
  roster: Record<string, Side>;
  buffer: LogEvent[];
  revision: number;
};

/** Вызывается из события MatchZy going_live: с этого момента раунды карты идут в зачёт */
export async function startMapLogging(matchId: string, mapNumber: number) {
  // перезапуск той же карты (карта уже закончилась или была остановлена): раунды прошлой попытки удаляем,
  // иначе «хвост» длинной первой попытки остаётся в Swing, убийствах из AWP и номинациях
  const { data: prev } = await db().from("match_log_state").select("live, map_number").eq("match_id", matchId).maybeSingle().throwOnError();
  const { data: map } = prev && !prev.live && prev.map_number === mapNumber
    ? await db().from("match_maps").select("status").eq("match_id", matchId).eq("map_number", mapNumber).maybeSingle().throwOnError()
    : { data: null };
  // запоздалый повтор going_live по уже сыгранной карте ничего не стирает
  if (map && map.status !== "finished") {
    await db().from("match_rounds").delete().eq("match_id", matchId).eq("map_number", mapNumber).throwOnError();
    await db().from("player_map_swing").delete().eq("match_id", matchId).eq("map_number", mapNumber).throwOnError();
  }
  await db().rpc("start_map_logging", { p_match: matchId, p_map: mapNumber }).throwOnError();
}

/** map_result: карта закончилась, лог до следующего going_live не учитываем */
export async function stopMapLogging(matchId: string) {
  await db().from("match_log_state").update({ live: false, buffer: [], updated_at: new Date().toISOString() }).eq("match_id", matchId).throwOnError();
}

/** Строки HTTP-лога CS2 для матча → события раундов → swing после каждого раунда */
export async function ingestLog(matchzyId: number, body: string, receipt: { key: string; token: string }) {
  const { data: match } = await db()
    .from("matches")
    .select("id, tournament:tournaments(format)")
    .eq("matchzy_id", matchzyId)
    .maybeSingle().throwOnError();
  if (!match) return { ignored: "unknown match" };
  // размер команды режима: в дуэли одно убийство решает раунд (1 на 0), а не 5 на 4
  const teamSize = modeOf(match.tournament?.format).size;
  const { data } = await db().from("match_log_state").select("*").eq("match_id", match.id).maybeSingle().throwOnError();
  const state = data as State | null;
  if (!state?.live) return { ignored: "map not live" };

  const roster = new Map(Object.entries(state.roster));
  let buffer = state.buffer;
  let round = state.round_number;
  let rounds = 0;
  const completed = [];

  let sawStart = false;
  for (const line of body.split(/\r?\n/)) {
    const e = parseLogLine(line);
    if (!e) continue;
    if (e.type === "round_start") {
      buffer = [];
      sawStart = true;
      continue;
    }
    buffer.push(e);
    // рестарт игры сразу после going_live (MatchZy: mp_restartgame) пишет «конец раунда» без единого действия
    // до первого настоящего раунда карты — это не раунд, иначе лента раундов сдвигается на один
    if (e.type === "round_end" && round === 0 && !sawStart && !buffer.some((x) => x.type !== "round_end")) {
      buffer = [];
      continue;
    }
    if (e.type === "round_end") {
      updateRoster(roster, buffer);
      const swing = computeRoundSwing(buffer, roster, teamSize);
      round++;
      rounds++;
      const ids = new Set([...roster.keys(), ...swing.keys()]);
      completed.push({
          round_number: round,
          winner_side: e.winner,
          events: buffer,
          swing: Object.fromEntries([...ids].map((id) => [id, swing.get(id) ?? 0])),
        });
      buffer = [];
    }
  }

  updateRoster(roster, buffer);
  await db().rpc("commit_log_batch", {
    p_match: match.id, p_map: state.map_number, p_revision: state.revision,
    p_roster: Object.fromEntries(roster), p_buffer: buffer, p_rounds: completed,
    p_key: receipt.key, p_token: receipt.token,
  }).throwOnError();
  return { rounds };
}

/** Пересчитать Swing матча по сохранённым событиям раундов (после исправления модели) */
export async function recomputeMatchSwing(matchId: string) {
  const { data: m } = await db().from("matches").select("tournament:tournaments(format)").eq("id", matchId).single();
  const teamSize = modeOf(m?.tournament?.format).size;
  const { data: rounds } = await db()
    .from("match_rounds")
    .select("map_number, round_number, events")
    .eq("match_id", matchId)
    .order("map_number")
    .order("round_number");
  const totals = new Map<string, { sum: number; rounds: number }>();
  const roster = new Map<string, Side>();
  let lastMap = -1;
  for (const r of rounds ?? []) {
    if (r.map_number !== lastMap) {
      roster.clear();
      lastMap = r.map_number;
    }
    const events = r.events as LogEvent[];
    updateRoster(roster, events);
    const swing = computeRoundSwing(events, roster, teamSize);
    await db()
      .from("match_rounds")
      .update({ swing: Object.fromEntries(swing) })
      .eq("match_id", matchId)
      .eq("map_number", r.map_number)
      .eq("round_number", r.round_number);
    for (const id of new Set([...roster.keys(), ...swing.keys()])) {
      const key = `${r.map_number}:${id}`;
      const cur = totals.get(key) ?? { sum: 0, rounds: 0 };
      cur.sum += swing.get(id) ?? 0;
      cur.rounds += 1;
      totals.set(key, cur);
    }
  }
  for (const [key, v] of totals) {
    const [map, steam] = key.split(":");
    await db()
      .from("player_map_swing")
      .upsert({ match_id: matchId, map_number: Number(map), steam_id: steam, swing_sum: v.sum, rounds: v.rounds }, { onConflict: "match_id,map_number,steam_id" });
  }
  return totals.size;
}
