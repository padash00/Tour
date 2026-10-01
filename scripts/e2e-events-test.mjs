// Проверка обработки событий MatchZy на сайте: шлёт на /api/matchzy/events события в формате MatchZy
// и проверяет, что матч, карта и статистика обновились. Тестовые данные удаляются.
// Запуск: node scripts/e2e-events-test.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const SITE = process.env.SITE ?? "https://tournament.f16-arena.kz";
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SLUG = "e2e-events-test";
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function cleanup() {
  const { data: t } = await db.from("tournaments").select("id").eq("slug", SLUG).maybeSingle();
  if (t) {
    await db.from("matches").update({ winner_to_match: null, loser_to_match: null }).eq("tournament_id", t.id);
    await db.from("matches").delete().eq("tournament_id", t.id);
    await db.from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db.from("teams").select("id").like("invite_code", "E2EV-%");
  for (const team of teams ?? []) {
    await db.from("team_members").delete().eq("team_id", team.id);
    await db.from("teams").delete().eq("id", team.id);
  }
  await db.from("players").delete().like("steam_id", "765611990000001%");
}

await cleanup();
const players = must(
  await db
    .from("players")
    .insert(Array.from({ length: 10 }, (_, i) => ({ steam_id: `7656119900000010${i}`, nickname: `ev_player_${i}` })))
    .select("id, steam_id"),
  "players",
);
const [a, b] = must(
  await db
    .from("teams")
    .insert([
      { name: "EV Alpha", tag: "EVA", captain_id: players[0].id, invite_code: "E2EV-A" },
      { name: "EV Bravo", tag: "EVB", captain_id: players[5].id, invite_code: "E2EV-B" },
    ])
    .select("id"),
  "teams",
);
const t = must(await db.from("tournaments").insert({ slug: SLUG, name: "E2E events", status: "draft" }).select("id").single(), "t");
const m = must(
  await db
    .from("matches")
    .insert({
      tournament_id: t.id, number: 1, bracket: "upper", round: 1, position: 0, best_of: 1,
      status: "ready", team1_id: a.id, team2_id: b.id,
    })
    .select("id, matchzy_id")
    .single(),
  "match",
);
must(await db.from("match_maps").insert({ match_id: m.id, map_number: 1, map_name: "de_mirage" }), "map");

const statsTeam = (ids, score) => ({
  id: "x",
  name: "x",
  score,
  players: ids.map((p, i) => ({
    steamid: p.steam_id,
    name: `ev_${i}`,
    stats: { kills: 10 + i, deaths: 8, assists: 3, damage: 1500, headshot_kills: 5, rounds_played: 21, kast: 15, first_kills_t: 2, first_kills_ct: 1, "1v1": 1, "2k": 2, trade_kills: 3 },
  })),
});
const send = async (ev) => {
  const r = await fetch(`${SITE}/api/matchzy/events`, {
    method: "POST",
    headers: { "X-F16-Token": env.MATCHZY_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ matchid: m.matchzy_id, ...ev }),
  });
  console.log(`  ${ev.event.padEnd(12)} → ${r.status}`);
};

console.log(`матч matchzy_id=${m.matchzy_id}`);
await send({ event: "going_live", map_number: 0 });
// HTTP-лог CS2 одного раунда → Swing
const P = (i, side) => `"ev_${i}<${i + 2}><[U:1:${Number(BigInt(players[i].steam_id) - 76561197960265728n)}]><${side}>"`;
const logBody = [
  'L 10/01/2026 - 12:00:00: World triggered "Round_Start"',
  `L 10/01/2026 - 12:00:20: ${P(0, "CT")} [1 2 3] killed ${P(5, "TERRORIST")} [1 2 3] with "ak47" (headshot)`,
  `L 10/01/2026 - 12:00:20: ${P(1, "CT")} assisted killing ${P(5, "TERRORIST")}`,
  `L 10/01/2026 - 12:00:30: ${P(6, "TERRORIST")} [1 2 3] killed ${P(2, "CT")} [1 2 3] with "awp"`,
  'L 10/01/2026 - 12:01:00: Team "CT" triggered "SFUI_Notice_Target_Saved" (CT "1") (T "0")',
  'L 10/01/2026 - 12:01:00: World triggered "Round_End"',
].join("\n");
const lr = await fetch(`${SITE}/api/cs2/log?m=${m.matchzy_id}&t=${env.MATCHZY_TOKEN}`, { method: "POST", body: logBody });
console.log(`  cs2 log      → ${lr.status} ${await lr.text()}`);
await send({ event: "round_end", map_number: 0, round_number: 8, round_time: 60, reason: 1, winner: { side: "ct", team: "team1" }, team1: statsTeam(players.slice(0, 5), 5), team2: statsTeam(players.slice(5), 3) });
await send({ event: "map_result", map_number: 0, winner: { side: "t", team: "team1" }, team1: statsTeam(players.slice(0, 5), 13), team2: statsTeam(players.slice(5), 8) });
await send({ event: "series_end", time_until_restore: 0, winner: { side: "t", team: "team1" }, team1_series_score: 1, team2_series_score: 0 });

const mm = must(await db.from("matches").select("status, winner_id, team1_score, team2_score").eq("id", m.id).single(), "m");
const map = must(await db.from("match_maps").select("status, team1_score, team2_score, winner_id").eq("match_id", m.id).single(), "map");
const stats = must(await db.from("player_map_stats").select("steam_id, kills, first_kills, clutch_wins, player_id").eq("match_id", m.id), "stats");
const events = must(await db.from("match_events").select("event").eq("match_id", m.id), "events");
const swing = must(await db.from("player_map_swing").select("steam_id, swing_sum, rounds").eq("match_id", m.id), "swing");
const top = swing.sort((x, y) => y.swing_sum - x.swing_sum)[0];
console.log(`  swing: ${swing.length} игроков, лучший ${top?.steam_id.slice(-3)} ${top ? (top.swing_sum * 100).toFixed(1) : "-"} п.п.`);

const checks = [
  ["матч завершён", mm.status === "finished"],
  ["победитель — EV Alpha", mm.winner_id === a.id],
  ["счёт серии 1:0", mm.team1_score === 1 && mm.team2_score === 0],
  ["карта 13:8, сыграна", map.status === "finished" && map.team1_score === 13 && map.team2_score === 8],
  ["статистика 10 игроков", stats.length === 10],
  ["first_kills = t + ct (3)", stats.every((s) => s.first_kills === 3)],
  ["игроки привязаны к профилям", stats.every((s) => s.player_id)],
  ["4 сырых события сохранены", events.length === 4],
  ["swing посчитан по логу", swing.length >= 3 && top?.steam_id === players[0].steam_id],
];
for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✕"} ${name}`);

await db.from("match_events").delete().eq("match_id", m.id);
await db.from("match_rounds").delete().eq("match_id", m.id);
await db.from("player_map_swing").delete().eq("match_id", m.id);
await db.from("match_log_state").delete().eq("match_id", m.id);
await cleanup();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
