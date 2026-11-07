// Закрытый турнир 2×2 на настоящем PostgreSQL (PGlite в памяти): create_private_pairs — пары как скрытые команды,
// одобренные заявки с check-in, запасной, пересоставление, запрет после сетки, удаление турнира со всем содержимым.
// Не читает .env и не обращается к реальной базе.
import assert from "node:assert/strict";
import { migratedDatabase } from "./lib/test-db.mjs";

type Row = Record<string, unknown>;
const sql = await migratedDatabase();
let checks = 0;
const test = async (name: string, work: () => Promise<void>) => { await work(); checks++; console.log(`✓ ${name}`); };
const rows = async <T = Row,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows;
const row = async <T = Row,>(query: string, params: unknown[] = []) => (await rows<T>(query, params))[0];
const n = async (query: string, params: unknown[] = []) => Number((await row<{ n: number }>(query, params)).n);

let seq = 0;
async function player() {
  const i = ++seq;
  return (await row<{ id: string }>("insert into players(steam_id, nickname) values($1, $2) returning id", [`765611993${String(i).padStart(8, "0")}`, `pp${i}`])).id;
}
const t = (await row<{ id: string }>("insert into tournaments(slug, name, format, bracket_type, status, is_private, max_teams) values('priv', 'Priv', '2v2', 'single_elimination', 'checkin', true, 16) returning id")).id;
const open = (await row<{ id: string }>("insert into tournaments(slug, name, format, status) values('open', 'Open', '2v2', 'checkin') returning id")).id;
const ps = [] as string[];
for (let i = 0; i < 5; i++) ps.push(await player());
// игрок уже в обычной команде и с соло-командой дуэлей — пара закрытого турнира им не мешает
const real = (await row<{ id: string }>("insert into teams(name, tag, captain_id, invite_code) values('Real', 'REAL', $1, 'INV-R') returning id", [ps[0]])).id;
await sql.query("insert into team_members(team_id, player_id, role) values($1, $2, 'captain')", [real, ps[0]]);
await sql.query("insert into teams(name, tag, captain_id, invite_code, is_solo) values('pp1', 'PP1', $1, 'SOLO-1', true)", [ps[0]]);
for (const p of ps) await sql.query("insert into tournament_access(tournament_id, player_id, status, checked_in_at) values($1, $2, 'accepted', now())", [t, p]);
const pairs = (list: string[][]) => JSON.stringify(list.map((pl, i) => ({ name: `Pair ${i + 1}`, tag: `DUO${i + 1}`, players: pl })));
const call = (p: string, reserve: string[], tid = t) => sql.query("select create_private_pairs($1, $2, $3::jsonb, $4::uuid[]) as n", [tid, ps[0], p, reserve]);

try {
  await test("Pairs become hidden teams with approved, checked-in registrations; the odd player is the reserve", async () => {
    const r = await call(pairs([[ps[0], ps[1]], [ps[2], ps[3]]]), [ps[4]]);
    assert.equal((r.rows[0] as { n: number }).n, 2);
    assert.equal(await n("select count(*)::int n from teams where private_tournament_id = $1 and is_solo", [t]), 2);
    assert.equal(await n("select count(*)::int n from tournament_registrations where tournament_id = $1 and status = 'approved' and checked_in_at is not null", [t]), 2);
    assert.equal(await n("select count(*)::int n from tournament_roster_players where tournament_id = $1 and role = 'main'", [t]), 4);
    assert.equal(await n("select count(*)::int n from team_members m join teams tm on tm.id = m.team_id where tm.private_tournament_id = $1 and m.is_solo", [t]), 4);
    const cap = await row<{ captain_id: string }>("select captain_id from teams where private_tournament_id = $1 and name = 'Pair 1'", [t]);
    assert.equal(cap.captain_id, ps[0]);
    assert.deepEqual((await rows<{ player_id: string }>("select player_id from tournament_access where tournament_id = $1 and is_reserve", [t])).map((x) => x.player_id), [ps[4]]);
    // обычная команда игрока на месте, соло-команда дуэлей тоже
    assert.equal(await n("select count(*)::int n from team_members where player_id = $1 and left_at is null and not is_solo", [ps[0]]), 1);
  });

  await test("Re-pairing replaces the old pairs entirely (swap with the reserve)", async () => {
    await call(pairs([[ps[0], ps[4]], [ps[2], ps[3]]]), [ps[1]]);
    assert.equal(await n("select count(*)::int n from teams where private_tournament_id = $1", [t]), 2);
    assert.equal(await n("select count(*)::int n from tournament_roster_players where tournament_id = $1", [t]), 4);
    assert.equal(await n("select count(*)::int n from tournament_roster_players where tournament_id = $1 and player_id = $2", [t, ps[1]]), 0);
    assert.deepEqual((await rows<{ player_id: string }>("select player_id from tournament_access where tournament_id = $1 and is_reserve", [t])).map((x) => x.player_id), [ps[1]]);
  });

  await test("Only checked-in players; not for open tournaments; not after the bracket exists", async () => {
    await sql.query("update tournament_access set checked_in_at = null where tournament_id = $1 and player_id = $2", [t, ps[1]]);
    await assert.rejects(call(pairs([[ps[0], ps[1]]]), []), /player_not_checked_in/);
    await assert.rejects(call(pairs([[ps[0], ps[0]]]), []), /invalid_pair/);
    await assert.rejects(call(pairs([[ps[0], ps[2]]]), [], open), /not_private/);
    // неудачная попытка ничего не ломает — прежние пары на месте
    assert.equal(await n("select count(*)::int n from teams where private_tournament_id = $1", [t]), 2);
    await sql.query("update tournaments set bracket_published_at = now() where id = $1", [t]);
    await assert.rejects(call(pairs([[ps[0], ps[2]]]), []), /bracket_exists/);
    await sql.query("update tournaments set bracket_published_at = null where id = $1", [t]);
  });

  await test("Deleting the tournament removes pairs, registrations, rosters and invitations; real teams stay", async () => {
    const tm = (await row<{ id: string }>("select id from teams where private_tournament_id = $1 limit 1", [t])).id;
    await sql.query("insert into matches(tournament_id, number, bracket, round, position, team1_id) values($1, 1, 'upper', 1, 1, $2)", [t, tm]);
    await sql.query("delete from tournaments where id = $1", [t]);
    for (const q of [
      "select count(*)::int n from teams where private_tournament_id is not null",
      "select count(*)::int n from tournament_access",
      "select count(*)::int n from tournament_registrations where tournament_id <> $1",
    ]) assert.equal(await n(q, q.includes("$1") ? [open] : []), 0, q);
    assert.equal(await n("select count(*)::int n from teams where id = $1", [real]), 1);
    assert.equal(await n("select count(*)::int n from teams where is_solo and private_tournament_id is null"), 1);
  });

  console.log(`\n${checks} private tournament database checks passed`);
} finally {
  await sql.close();
}
