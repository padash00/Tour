// Целостность данных на настоящем PostgreSQL (PGlite в памяти): сетка через sync_bracket_apply,
// создание стадий, завершение вето, вступление в команду, частота действий, CHECK-ограничения.
// Логика сайта (planBracketSync, eliminationStageRows, vetoPlan) берётся из src — та же, что в проде.
// Не читает .env и не обращается к реальной базе.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyMigrations, migratedDatabase } from "./lib/test-db.mjs";
import { eliminationStageRows, planBracketSync } from "../src/lib/matches";
import { seriesMaps, vetoPlan, type VetoAction } from "../src/lib/veto";
import type { Match } from "../src/lib/types";

type Row = Record<string, unknown>;
const sql = await migratedDatabase();
let checks = 0;
const test = async (name: string, work: () => Promise<void>) => { await work(); checks++; console.log(`✓ ${name}`); };
const rows = async <T = Row,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows;
const row = async <T = Row,>(query: string, params: unknown[] = []) => (await rows<T>(query, params))[0];

let seq = 0;
async function player(nickname = `p${++seq}`) {
  const steam = `765611991${String(++seq).padStart(8, "0")}`;
  return (await row<{ id: string }>("insert into players(steam_id, nickname) values($1, $2) returning id", [steam, nickname])).id;
}
async function team(captain: string) {
  const n = ++seq;
  const id = (await row<{ id: string }>("insert into teams(name, tag, captain_id, invite_code) values($1, $2, $3, $4) returning id",
    [`Team ${n}`, `T${n}`, captain, `INV-${n}`])).id;
  await sql.query("insert into team_members(team_id, player_id, role) values($1, $2, 'captain')", [id, captain]);
  return id;
}
async function tournament(extra = "") {
  const n = ++seq;
  return (await row<{ id: string }>(`insert into tournaments(slug, name, format, bracket_type, status${extra ? ", " + extra.split("=")[0] : ""})
    values($1, $2, '5v5', 'double_elimination', 'live'${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [`t-${n}`, `T ${n}`])).id;
}

/** То же, что syncBracket на сайте: снимок → planBracketSync → sync_bracket_apply, повтор при конфликте */
async function sync(t: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await rows<Match>("select * from matches where tournament_id = $1 and stage = 'playoff'", [t]);
    const { expected, updates } = planBracketSync(snapshot);
    if (!updates.length) return;
    const { r } = await row<{ r: { status: string } }>("select sync_bracket_apply($1, $2::jsonb, $3::jsonb) as r",
      [t, JSON.stringify(expected), JSON.stringify(updates)]);
    if (r.status === "ok") return;
  }
  throw new Error("bracket sync did not converge");
}

try {
  const teams: string[] = [];
  for (let i = 0; i < 6; i++) teams.push(await team(await player()));

  await test("Double elimination advances through sync_bracket_apply until one champion remains", async () => {
    const t = await tournament();
    const stage = eliminationStageRows({ default_best_of: 1, final_best_of: 3 }, teams, true);
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'bracket', $2::jsonb) as ok", [t, JSON.stringify(stage)])).ok, true);
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'bracket', $2::jsonb) as ok", [t, JSON.stringify(stage)])).ok, false);
    assert.notEqual((await row<{ at: Date | null }>("select bracket_published_at as at from tournaments where id = $1", [t])).at, null);
    await sync(t);
    const seed = (id: string) => teams.indexOf(id);
    for (let round = 0; round < 50; round++) {
      const ready = await rows<Match>("select * from matches where tournament_id = $1 and status = 'upcoming'", [t]);
      if (!ready.length) break;
      for (const m of ready) {
        assert.ok(m.team1_id && m.team2_id, `match ${m.number} is upcoming without two teams`);
        // выигрывает команда с меньшим посевом, кроме одного апсета — чтобы нижняя сетка тоже прошла до конца
        const fav = seed(m.team1_id!) < seed(m.team2_id!) ? m.team1_id : m.team2_id;
        const winner = m.bracket === "upper" && m.round === 1 && m.position === 0 ? (fav === m.team1_id ? m.team2_id : m.team1_id) : fav;
        await sql.query("update matches set status = 'finished', winner_id = $2 where id = $1", [m.id, winner]);
      }
      await sync(t);
    }
    const all = await rows<Match>("select * from matches where tournament_id = $1", [t]);
    assert.deepEqual(all.filter((m) => !["finished", "cancelled"].includes(m.status)).map((m) => m.number), []);
    const gf = all.find((m) => m.bracket === "grand_final")!;
    assert.ok(gf.winner_id && teams.includes(gf.winner_id));
    assert.ok(all.filter((m) => m.is_walkover).every((m) => m.finished_at), "walkovers finished by the bracket carry finished_at");
    const losses = new Map<string, number>();
    for (const m of all) {
      if (m.status !== "finished" || !m.team1_id || !m.team2_id || m.is_walkover) continue;
      const loser = m.winner_id === m.team1_id ? m.team2_id : m.team1_id;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
    for (const id of teams) if (id !== gf.winner_id && !(gf.team1_id === id)) assert.equal(losses.get(id), 2, "eliminated after two losses");
  });

  await test("A stale bracket snapshot is rejected without partial writes", async () => {
    const t = await tournament();
    const stage = eliminationStageRows({ default_best_of: 1, final_best_of: 1 }, teams.slice(0, 4), false);
    await sql.query("select create_stage_matches($1, 'bracket', $2::jsonb)", [t, JSON.stringify(stage)]);
    await sync(t);
    const first = await row<Match>("select * from matches where tournament_id = $1 and round = 1 order by position limit 1", [t]);
    await sql.query("update matches set status = 'finished', winner_id = team1_id where id = $1", [first.id]);
    const snapshot = await rows<Match>("select * from matches where tournament_id = $1", [t]);
    const { expected, updates } = planBracketSync(snapshot);
    assert.ok(updates.length > 0);
    // параллельный писатель успел раньше: результат матча изменился после чтения снимка
    await sql.query("update matches set winner_id = team2_id where id = $1", [first.id]);
    const { r } = await row<{ r: { status: string } }>("select sync_bracket_apply($1, $2::jsonb, $3::jsonb) as r",
      [t, JSON.stringify(expected), JSON.stringify(updates)]);
    assert.equal(r.status, "conflict");
    const final = await row<Match>("select * from matches where tournament_id = $1 and round = 2", [t]);
    assert.equal(final.team1_id, null, "nothing was written from the stale plan");
    await sync(t);
    assert.equal((await row<Match>("select * from matches where id = $1", [final.id])).team1_id, first.team2_id);
  });

  await test("Playoff creation is atomic and idempotent; a failed attempt leaves no flag behind", async () => {
    const t = await tournament("bracket_published_at=now()");
    const bad = eliminationStageRows({ default_best_of: 1, final_best_of: 1 }, [teams[0], randomUUID()], false);
    await assert.rejects(sql.query("select create_stage_matches($1, 'playoff', $2::jsonb)", [t, JSON.stringify(bad)]), /foreign key/);
    assert.equal((await row<{ at: Date | null }>("select playoff_created_at as at from tournaments where id = $1", [t])).at, null);
    const good = JSON.stringify(eliminationStageRows({ default_best_of: 1, final_best_of: 1 }, teams.slice(0, 4), false));
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'playoff', $2::jsonb) as ok", [t, good])).ok, true);
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'playoff', $2::jsonb) as ok", [t, good])).ok, false);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from matches where tournament_id = $1", [t])).n, 3);
    const swissRound = JSON.stringify([{ id: randomUUID(), number: 1, bracket: "swiss", stage: "swiss", round: 2, position: 0, status: "upcoming", team1_id: teams[0], team2_id: teams[1] }]);
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'round', $2::jsonb) as ok", [t, swissRound])).ok, true);
    assert.equal((await row<{ n: number }>("select max(number)::int as n from matches where tournament_id = $1", [t])).n, 4, "numbers continue after existing matches");
    const again = JSON.stringify([{ ...JSON.parse(swissRound)[0], id: randomUUID() }]);
    assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'round', $2::jsonb) as ok", [t, again])).ok, false);
  });

  await test("finish_veto writes the series maps and ready status once, matching the site's seriesMaps", async () => {
    const t = await tournament();
    const pool = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"];
    const m = (await row<{ id: string }>(`insert into matches(tournament_id, number, bracket, round, position, best_of, status, team1_id, team2_id, veto_deadline)
      values($1, 1, 'upper', 1, 0, 3, 'veto', $2, $3, now()) returning id`, [t, teams[0], teams[1]])).id;
    const actions: VetoAction[] = vetoPlan(3, pool.length).map((s, i) => ({
      step: s.step, action: s.action, map_name: pool[i], team_id: s.team === 1 ? teams[0] : s.team === 2 ? teams[1] : null,
    }));
    for (const a of actions.slice(0, -1)) {
      await sql.query("insert into veto_actions(match_id, step, team_id, action, map_name) values($1, $2, $3, $4, $5)", [m, a.step, a.team_id, a.action, a.map_name]);
    }
    assert.equal((await row<{ ok: boolean }>("select finish_veto($1) as ok", [m])).ok, false, "veto without decider is not finished");
    const last = actions[actions.length - 1];
    await sql.query("insert into veto_actions(match_id, step, action, map_name, auto) values($1, $2, 'decider', $3, true)", [m, last.step, last.map_name]);
    assert.equal((await row<{ ok: boolean }>("select finish_veto($1) as ok", [m])).ok, true);
    assert.equal((await row<{ ok: boolean }>("select finish_veto($1) as ok", [m])).ok, false, "second finisher changes nothing");
    const maps = await rows<{ map_number: number; map_name: string; picked_by: string | null }>(
      "select map_number, map_name, picked_by from match_maps where match_id = $1 order by map_number", [m]);
    assert.deepEqual(maps.map(({ map_name, picked_by }) => ({ map_name, picked_by })), seriesMaps(actions));
    assert.deepEqual(maps.map((x) => x.map_number), [1, 2, 3]);
    const after = await row<{ status: string; veto_deadline: Date | null }>("select status, veto_deadline from matches where id = $1", [m]);
    assert.equal(after.status, "ready"); assert.equal(after.veto_deadline, null);

    const single = (await row<{ id: string }>(`insert into matches(tournament_id, number, bracket, round, position, best_of, status, team1_id, team2_id)
      values($1, 2, 'upper', 1, 1, 3, 'upcoming', $2, $3) returning id`, [t, teams[2], teams[3]])).id;
    assert.equal((await row<{ ok: boolean }>("select finish_veto($1, 'aim_map') as ok", [single])).ok, true);
    assert.deepEqual((await rows<{ map_name: string }>("select map_name from match_maps where match_id = $1 order by map_number", [single])).map((x) => x.map_name), ["aim_map", "aim_map", "aim_map"]);
    assert.equal((await row<{ ok: boolean }>("select finish_veto($1, 'aim_map') as ok", [single])).ok, false);
  });

  await test("join_team never overfills a roster and transfer_team_captain swaps roles atomically", async () => {
    const captain = await player();
    const tm = await team(captain);
    const joined: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = await player();
      joined.push((await row<{ role: string }>("select join_team($1, $2, 5, 2) as role", [tm, p])).role);
    }
    assert.deepEqual(joined, ["player", "player", "player", "player", "substitute", "substitute"]);
    await assert.rejects(sql.query("select join_team($1, $2, 5, 2)", [tm, await player()]), /team_full/);
    const other = await team(await player());
    await assert.rejects(sql.query("select join_team($1, $2, 5, 2)", [other, captain]), /already_member/);

    const sub = await row<{ id: string; player_id: string }>("select id, player_id from team_members where team_id = $1 and role = 'substitute' limit 1", [tm]);
    await assert.rejects(sql.query("select transfer_team_captain($1, $2, $3)", [tm, sub.player_id, sub.id]), /captain_required/);
    await sql.query("select transfer_team_captain($1, $2, $3)", [tm, captain, sub.id]);
    assert.equal((await row<{ captain_id: string }>("select captain_id from teams where id = $1", [tm])).captain_id, sub.player_id);
    assert.equal((await row<{ role: string }>("select role from team_members where id = $1", [sub.id])).role, "captain");
    assert.equal((await row<{ role: string }>("select role from team_members where team_id = $1 and player_id = $2", [tm, captain])).role, "substitute");
    assert.equal((await row<{ n: number }>("select count(*)::int as n from team_members where team_id = $1 and role = 'captain'", [tm])).n, 1);
  });

  await test("Rate limiting is atomic: a concurrent duplicate is refused, a later retry passes", async () => {
    const p = await player();
    const hit = async (action: string, seconds = 30) => (await row<{ limited: boolean }>("select rate_limit_claim($1, $2, $3) as limited", [p, action, seconds])).limited;
    assert.equal(await hit("team.create"), false);
    assert.equal(await hit("team.create"), true, "double submit within the claim window");
    assert.equal(await hit("team.join"), false, "other actions are independent");
    await sql.query("update rate_limit_claims set claimed_at = now() - interval '10 seconds' where actor_id = $1", [p]);
    assert.equal(await hit("team.create"), false, "failed attempt does not block a corrected retry for the full window");
    await sql.query("insert into audit_logs(actor_id, action) values($1, 'team.create')", [p]);
    await sql.query("update rate_limit_claims set claimed_at = now() - interval '10 seconds' where actor_id = $1", [p]);
    assert.equal(await hit("team.create"), true, "a completed action limits for the whole window");
  });

  await test("A restarted map resets log parsing only when the map is not live", async () => {
    const t = await tournament();
    const m = (await row<{ id: string }>("insert into matches(tournament_id, number, bracket, round, position) values($1, 1, 'upper', 1, 0) returning id", [t])).id;
    await sql.query("select start_map_logging($1, 1)", [m]);
    await sql.query("update match_log_state set round_number = 7 where match_id = $1", [m]);
    await sql.query("select start_map_logging($1, 1)", [m]);
    assert.equal((await row<{ n: number }>("select round_number as n from match_log_state where match_id = $1", [m])).n, 7);
    await sql.query("update match_log_state set live = false where match_id = $1", [m]);
    await sql.query("select start_map_logging($1, 1)", [m]);
    const s = await row<{ n: number; live: boolean }>("select round_number as n, live from match_log_state where match_id = $1", [m]);
    assert.equal(s.n, 0); assert.equal(s.live, true);
  });

  await test("CHECK constraints and the roster/registration foreign key reject inconsistent rows", async () => {
    const t = await tournament();
    const insertMatch = (extra: string, values: unknown[]) => sql.query(
      `insert into matches(tournament_id, number, bracket, round, position${extra ? ", " + extra : ""}) values($1, 99, 'upper', 9, 9${values.map((_, i) => `, $${i + 2}`).join("")})`, [t, ...values]);
    await assert.rejects(insertMatch("team1_id, team2_id", [teams[0], teams[0]]), /matches_distinct_teams/);
    await assert.rejects(insertMatch("team1_id, team2_id, winner_id", [teams[0], teams[1], teams[2]]), /matches_winner_is_participant/);
    await assert.rejects(insertMatch("team1_id, winner_id", [teams[0], teams[1]]), /matches_winner_is_participant/);
    await assert.rejects(insertMatch("team1_score", [-1]), /matches_scores_nonnegative/);
    const ok = (await row<{ id: string }>("insert into matches(tournament_id, number, bracket, round, position, team1_id, winner_id) values($1, 98, 'upper', 9, 8, $2, $2) returning id", [t, teams[0]])).id;
    await assert.rejects(sql.query("insert into match_maps(match_id, map_number, map_name) values($1, 0, 'de_nuke')", [ok]), /match_maps_number_positive/);
    await assert.rejects(sql.query("insert into tournaments(slug, name, format) values('bad-format', 'x', '3v3')"), /tournaments_format_known/);
    await assert.rejects(sql.query("insert into tournaments(slug, name, bracket_type) values('bad-type', 'x', 'ladder')"), /tournaments_bracket_type_known/);
    await assert.rejects(sql.query("insert into tournaments(slug, name, max_teams) values('bad-size', 'x', 1)"), /tournaments_max_teams_range/);
    await assert.rejects(sql.query("insert into tournaments(slug, name, starts_at, registration_closes_at) values('bad-dates', 'x', now(), now() + interval '1 day')"), /tournaments_dates_ordered/);
    const other = await tournament();
    const reg = (await row<{ id: string }>("insert into tournament_registrations(tournament_id, team_id) values($1, $2) returning id", [t, teams[0]])).id;
    const captain = (await row<{ captain_id: string }>("select captain_id from teams where id = $1", [teams[0]])).captain_id;
    await assert.rejects(sql.query("insert into tournament_roster_players(registration_id, tournament_id, player_id) values($1, $2, $3)", [reg, other, captain]), /foreign key/);
    const invalid = await rows("select conname from pg_constraint where not convalidated and conname like any(array['matches_%', 'match_maps_%', 'tournaments_%', 'tournament_roster_%'])");
    assert.deepEqual(invalid, [], "constraints validated on an empty database");
  });

  await test("Public read policies are gone while RLS stays enabled", async () => {
    assert.equal((await row<{ n: number }>("select count(*)::int as n from pg_policies where schemaname = 'public'")).n, 0);
    const open = await rows("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
    assert.deepEqual(open, []);
    for (const role of ["anon", "authenticated"]) {
      const { allowed } = await row<{ allowed: boolean }>(`select bool_or(has_function_privilege($1, oid, 'execute')) as allowed from pg_proc where proname in
        ('sync_bracket_apply', 'create_stage_matches', 'finish_veto', 'join_team', 'transfer_team_captain', 'rate_limit_claim', 'prune_old_rows')`, [role]);
      assert.equal(allowed, false);
    }
  });

  await test("prune_old_rows removes only expired journal rows", async () => {
    await sql.query("insert into audit_logs(action, created_at) values('old', now() - interval '400 days'), ('new', now())");
    await sql.query("insert into agent_commands(type, status, created_at) values('rcon', 'done', now() - interval '90 days'), ('rcon', 'pending', now() - interval '90 days')");
    const { r } = await row<{ r: Record<string, number> }>("select prune_old_rows() as r");
    assert.equal(r.audit_logs, 1); assert.equal(r.agent_commands, 1);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from audit_logs where action in ('old', 'new')")).n, 1);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from agent_commands where status = 'pending'")).n, 1);
    await assert.rejects(sql.query("select prune_old_rows(1)"), /retention_too_short/);
  });

  await test("Existing rows that break a new constraint leave it NOT VALID instead of failing the release", async () => {
    const legacy = await migratedDatabase({ before: "20261007000100_integrity_constraints.sql" });
    try {
      await legacy.exec("insert into tournaments(slug, name, format, max_teams) values('legacy', 'Legacy', 'custom', 1)");
      await applyMigrations(legacy);
      const pending = (await legacy.query<{ conname: string }>("select conname from pg_constraint where not convalidated order by conname")).rows.map((r) => r.conname);
      assert.deepEqual(pending, ["tournaments_format_known", "tournaments_max_teams_range"]);
      await assert.rejects(legacy.query("insert into tournaments(slug, name, max_teams) values('new', 'New', 1)"), /tournaments_max_teams_range/);
    } finally {
      await legacy.close();
    }
  });

  console.log(`\n${checks} integrity checks passed; production was not contacted.`);
} finally {
  await sql.close();
}
