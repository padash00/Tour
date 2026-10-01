import "server-only";
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
  const { data: match } = await db().from("matches").select("id").eq("matchzy_id", matchzyId).maybeSingle();
  if (!match) return { ignored: "unknown match" };
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
      const swing = computeRoundSwing(buffer, roster);
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
