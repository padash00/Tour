// Демо-турнир целиком на PGlite: seed → play --fast → cleanup. supabase-js сайта ходит в мини-PostgREST
// (scripts/lib/pg-rest.mjs), события MatchZy и лог CS2 идут в настоящие обработчики маршрутов
// /api/matchzy/events и /api/cs2/log (вызов в процессе вместо HTTP). Не читает .env и не ходит в сеть.
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { createPgRest } from "./lib/pg-rest.mjs";
import { migratedDatabase } from "./lib/test-db.mjs";

const TOKEN = "offline-matchzy-token";
process.env.MATCHZY_TOKEN = TOKEN;
const sql = await migratedDatabase();
await sql.exec("set timezone to 'UTC'");
globalThis.fetch = createPgRest(sql) as typeof fetch;

// маршруты вне Next: revalidatePath без кэша Next бросает — маршрут ловит это и пишет «revalidate failed»
const consoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("revalidate failed")) return;
  consoleError(...args);
};

const { POST: eventsPost } = await import("../src/app/api/matchzy/events/route");
const { POST: logPost } = await import("../src/app/api/cs2/log/route");
const { signedLogQuery } = await import("../src/lib/server/ingest-signature");
const { cleanupDemo, playDemo, seedDemo, statusDemo } = await import("./lib/demo-tournament");
const { simulateMap, rngFrom } = await import("./lib/demo-sim");
const { demoTeams, isDemoSteamId } = await import("./lib/demo-data");
const { ageOn, almatyDay, isProfileComplete, normalizePhone } = await import("../src/lib/profile");
const { parseLogLine } = await import("../src/lib/swing");

const transport = {
  async event(raw: string) {
    const res = await eventsPost(new NextRequest("http://demo.local/api/matchzy/events", { method: "POST", headers: { "X-F16-Token": TOKEN, "Content-Type": "application/json" }, body: raw }));
    return { status: res.status, body: await res.text() };
  },
  async log(matchzyId: number, raw: string) {
    const res = await logPost(new NextRequest(`http://demo.local/api/cs2/log?${signedLogQuery(matchzyId, TOKEN)}`, { method: "POST", body: raw }));
    return { status: res.status, body: await res.text() };
  },
};
const journal = path.join(tmpdir(), `f16-demo-test-${process.pid}.txt`);
const lines: string[] = [];
// DEMO_TEST_VERBOSE=1 — печатать вывод seed/play/status/cleanup
const options = { transport, fast: true, seed: 7, site: "https://tournament.f16-arena.kz", journal, log: (s: string) => (lines.push(s), process.env.DEMO_TEST_VERBOSE && console.log(s)) };
const count = async (query: string, params: unknown[] = []) => Number(Object.values((await sql.query<Record<string, unknown>>(query, params)).rows[0])[0]);
let checks = 0;
const ok = (name: string) => {
  checks++;
  console.log(`✓ ${name}`);
};

try {
  // ── чистые генераторы
  const day = almatyDay();
  const teams = demoTeams(day);
  assert.equal(teams.length, 16);
  const players = teams.flatMap((t) => t.players);
  assert.equal(new Set(players.map((p) => p.steamId)).size, 80);
  assert.ok(players.every((p) => isDemoSteamId(p.steamId) && /^\d{17}$/.test(p.steamId)));
  assert.ok(players.every((p) => { const a = ageOn(p.profile.birth_date, day); return a >= 16 && a <= 35; }));
  assert.ok(players.every((p) => normalizePhone(p.profile.phone) === p.profile.phone && /^\+77\d{2}555\d{4}$/.test(p.profile.phone)));
  assert.ok(players.every((p) => isProfileComplete({ ...p.profile, consent_at: "2026-10-07T00:00:00Z" })));
  assert.deepEqual(teams.map((t) => t.tag), Array.from({ length: 16 }, (_, i) => `DM${String(i + 1).padStart(2, "0")}`));
  ok("80 players with complete profiles, ages 16–35, valid phones and SteamIDs in the reserved range; tags DM01–DM16");

  const sim = simulateMap({ team1: { ...teams[0], players: teams[0].players.map((p) => ({ ...p, name: p.nickname })) }, team2: { ...teams[1], players: teams[1].players.map((p) => ({ ...p, name: p.nickname })) }, rng: rngFrom(1), team1StartsCT: true });
  const [a, b] = [sim.score1, sim.score2].sort((x, y) => y - x);
  assert.ok(a === 13 && b <= 11 || a >= 16 && a - b >= 2 && a - b <= 4, `score ${a}:${b}`);
  assert.equal(sim.rounds.length, sim.score1 + sim.score2);
  const events = sim.rounds.flatMap((r) => r.log.map(parseLogLine)).filter((e) => e);
  assert.equal(events.filter((e) => e!.type === "round_end").length, sim.rounds.length, "every round ends with a team win line");
  assert.ok(events.some((e) => e!.type === "kill" && e!.weapon === "awp") && events.some((e) => e!.type === "plant"));
  const last = sim.rounds[sim.rounds.length - 1];
  const kills = [...last.team1.players, ...last.team2.players].reduce((s, p) => s + p.stats.kills, 0);
  assert.equal(kills, events.filter((e) => e!.type === "kill").length, "MatchZy kills match the log");
  ok(`Map simulation: MR12 score ${sim.score1}:${sim.score2}, log lines parse into kills/plants/round ends, stats agree with the log`);

  // ── seed
  const t0 = Date.now();
  await seedDemo(options);
  const t = (await sql.query<{ id: string; status: string; autopilot: boolean; is_official: boolean; third_place_match: boolean; map_pool: string[] }>("select * from tournaments where slug = 'demo-cs-uka-2026'")).rows[0];
  assert.deepEqual([t.status, t.autopilot, t.is_official, t.third_place_match], ["checkin", false, true, true]);
  assert.deepEqual(t.map_pool, ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_train"]);
  assert.equal(await count("select count(*) from tournament_registrations where tournament_id = $1 and status = 'approved' and checked_in_at is not null", [t.id]), 16);
  assert.equal(await count("select count(*) from tournament_applications where tournament_id = $1 and coach_documents_at is not null", [t.id]), 16);
  assert.equal(await count("select count(*) from tournament_participant_documents where tournament_id = $1", [t.id]), 80);
  assert.equal(await count("select count(*) from players where steam_id like '765611999990000%'"), 81, "80 players + organizer; invalid teams removed");
  assert.equal(await count("select count(*) from teams where tag in ('DM17', 'DM18')"), 0);
  assert.ok(lines.some((l) => l.includes("✓ DM17") && true) && lines.some((l) => l.includes("✓ DM18")), "both invalid registrations rejected");
  assert.ok(lines.some((l) => l.includes("age_out_of_range")) && lines.some((l) => l.includes("profile_incomplete")));
  ok(`Seed: 16 official registrations approved and checked in, documents marked; DM17 (age) and DM18 (profile) rejected and removed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  // ── play
  const t1 = Date.now();
  const result = await playDemo(options);
  const placesSeen = result.placements.map((p) => p.place);
  assert.deepEqual(placesSeen, ["1", "2", "3", "4"]);
  assert.equal(new Set(result.placements.map((p) => p.team)).size, 4);
  for (const key of ["mvp", "sniper", "rifler", "support"]) assert.ok(result.nominations.some((n) => n.key === key), `nomination ${key}`);
  assert.equal((await sql.query<{ status: string }>("select status from tournaments where id = $1", [t.id])).rows[0].status, "finished");
  assert.equal(await count("select count(*) from matches where tournament_id = $1", [t.id]), 16);
  assert.equal(await count("select count(*) from matches where tournament_id = $1 and status <> 'finished'", [t.id]), 0);
  assert.equal(await count("select count(*) from matches where tournament_id = $1 and (server_instance is not null or server_state is not null)", [t.id]), 0, "no server assigned");
  assert.equal(await count("select count(*) from agent_commands"), 0, "nothing queued for the agent");
  assert.equal(await count("select count(*) from matches where tournament_id = $1 and bracket = 'third_place' and best_of = 3", [t.id]), 1);
  assert.equal(await count("select count(*) from matches where tournament_id = $1 and round <= 2 and best_of = 1", [t.id]), 12);
  assert.equal(await count("select count(*) from veto_actions v join matches m on m.id = v.match_id where m.tournament_id = $1 and v.action = 'decider'", [t.id]), 16);
  assert.ok(await count("select count(*) from match_rounds r join matches m on m.id = r.match_id where m.tournament_id = $1", [t.id]) > 300, "rounds from the HTTP log");
  assert.ok(await count("select count(*) from player_map_swing s join matches m on m.id = s.match_id where m.tournament_id = $1", [t.id]) > 100, "Swing computed");
  assert.equal(await count("select count(*) from player_map_stats s join matches m on m.id = s.match_id where m.tournament_id = $1 and s.player_id is null", [t.id]), 0, "stats linked to players");
  assert.equal(await count("select count(*) from match_maps mm join matches m on m.id = mm.match_id where m.tournament_id = $1 and mm.status = 'finished' and greatest(mm.team1_score, mm.team2_score) < 13", [t.id]), 0);
  assert.ok(await count("select count(*) from audit_logs where action = 'bracket.draw' and entity_id = $1", [t.id]) === 1, "draw recorded");
  ok(`Play --fast through the real event/log routes: champion, 2nd, 3rd (third-place match), 4th; nominations ${result.nominations.map((n) => n.key).join(", ")}; no servers or agent commands (${((Date.now() - t1) / 1000).toFixed(1)} s)`);

  lines.length = 0;
  await statusDemo(options);
  assert.ok(lines.some((l) => l.includes("Финал")) && lines.some((l) => l.includes("finished")));
  ok("Status prints matches and scores");

  // ── cleanup
  const { total, leftovers } = await cleanupDemo(options);
  assert.equal(total, 0, JSON.stringify(leftovers));
  for (const table of ["tournaments", "players", "teams", "team_members", "player_profiles", "tournament_registrations", "tournament_roster_players",
    "tournament_applications", "tournament_participant_documents", "matches", "match_maps", "veto_actions", "match_events", "match_rounds",
    "player_map_stats", "player_map_swing", "match_log_state", "notifications", "audit_logs", "ingest_dedupe", "rate_limit_claims"]) {
    assert.equal(await count(`select count(*) from ${table}`), 0, `${table} is empty after cleanup`);
  }
  ok("Cleanup removes every demo row in FK order; all touched tables are empty again");
  console.log(`\n${checks} demo tournament checks passed`);
} finally {
  console.error = consoleError;
  rmSync(journal, { force: true });
  await sql.close();
}
