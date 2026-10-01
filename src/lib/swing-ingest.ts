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
};

/** Вызывается из события MatchZy going_live: с этого момента раунды карты идут в зачёт */
export async function startMapLogging(matchId: string, mapNumber: number) {
  await db().from("match_log_state").upsert({
    match_id: matchId,
    live: true,
    map_number: mapNumber,
    round_number: 0,
    roster: {},
    buffer: [],
    updated_at: new Date().toISOString(),
  });
}

/** map_result: карта закончилась, лог до следующего going_live не учитываем */
export async function stopMapLogging(matchId: string) {
  await db().from("match_log_state").update({ live: false, buffer: [], updated_at: new Date().toISOString() }).eq("match_id", matchId);
}

async function addSwing(matchId: string, mapNumber: number, swing: Map<string, number>, roster: Record<string, Side>) {
  // раунд засчитывается всем игрокам состава карты, даже без событий в нём
  const ids = new Set([...Object.keys(roster), ...swing.keys()]);
  if (ids.size === 0) return;
  const { data } = await db()
    .from("player_map_swing")
    .select("steam_id, swing_sum, rounds")
    .eq("match_id", matchId)
    .eq("map_number", mapNumber)
    .in("steam_id", [...ids]);
  const prev = new Map((data ?? []).map((r) => [r.steam_id, r]));
  await db()
    .from("player_map_swing")
    .upsert(
      [...ids].map((id) => ({
        match_id: matchId,
        map_number: mapNumber,
        steam_id: id,
        swing_sum: (prev.get(id)?.swing_sum ?? 0) + (swing.get(id) ?? 0),
        rounds: (prev.get(id)?.rounds ?? 0) + 1,
      })),
      { onConflict: "match_id,map_number,steam_id" },
    );
}

/** Строки HTTP-лога CS2 для матча → события раундов → swing после каждого раунда */
export async function ingestLog(matchzyId: number, body: string) {
  const { data: match } = await db()
    .from("matches")
    .select("id, tournament:tournaments(format)")
    .eq("matchzy_id", matchzyId)
    .maybeSingle();
  if (!match) return { ignored: "unknown match" };
  // размер команды режима: в дуэли одно убийство решает раунд (1 на 0), а не 5 на 4
  const teamSize = modeOf((match as unknown as { tournament: { format: string } }).tournament?.format).size;
  const { data } = await db().from("match_log_state").select("*").eq("match_id", match.id).maybeSingle();
  const state = data as State | null;
  if (!state?.live) return { ignored: "map not live" };

  const roster = new Map(Object.entries(state.roster));
  let buffer = state.buffer;
  let round = state.round_number;
  let rounds = 0;

  for (const line of body.split(/\r?\n/)) {
    const e = parseLogLine(line);
    if (!e) continue;
    if (e.type === "round_start") {
      buffer = [];
      continue;
    }
    buffer.push(e);
    if (e.type === "round_end") {
      updateRoster(roster, buffer);
      const swing = computeRoundSwing(buffer, roster, teamSize);
      round++;
      rounds++;
      const rosterObj = Object.fromEntries(roster);
      await db()
        .from("match_rounds")
        .upsert({
          match_id: match.id,
          map_number: state.map_number,
          round_number: round,
          winner_side: e.winner,
          events: buffer,
          swing: Object.fromEntries(swing),
        });
      await addSwing(match.id, state.map_number, swing, rosterObj);
      buffer = [];
    }
  }

  updateRoster(roster, buffer);
  await db()
    .from("match_log_state")
    .update({
      roster: Object.fromEntries(roster),
      buffer,
      round_number: round,
      updated_at: new Date().toISOString(),
    })
    .eq("match_id", match.id);
  return { rounds };
}

/** Пересчитать Swing матча по сохранённым событиям раундов (после исправления модели) */
export async function recomputeMatchSwing(matchId: string) {
  const { data: m } = await db().from("matches").select("tournament:tournaments(format)").eq("id", matchId).single();
  const teamSize = modeOf((m as unknown as { tournament: { format: string } } | null)?.tournament?.format).size;
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
