// Real PostgreSQL (WASM), isolated in memory. Never reads .env or contacts production.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { CommandJournal } from "../server/agent/command-journal.mjs";
import { checksum, migrationPlan, migrationTransaction } from "./lib/migrations.mjs";

const sql = new PGlite({ extensions: { citext } });
const dir = mkdtempSync(path.join(tmpdir(), "f16-reliability-"));
let checks = 0;
const test = async (name, work) => { await work(); checks++; console.log(`✓ ${name}`); };
const row = async (query, params = []) => (await sql.query(query, params)).rows[0];
try {
  await sql.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await test("All repository migrations apply to an empty database", async () => {
    for (const name of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort()) {
      try { await sql.exec(migrationTransaction({ name, sql: readFileSync(`supabase/migrations/${name}`, "utf8") })); }
      catch (e) { throw new Error(`Migration ${name}: ${e.message}`, { cause: e }); }
    }
  });
  await test("Migration history is atomic, repeatable and detects edited applied SQL", async () => {
    const file = { name: '20990101000000_test.sql', sql: 'create table migration_probe(id int);' };
    await sql.exec(migrationTransaction(file));
    await sql.exec(migrationTransaction(file));
    assert.equal((await row("select count(*)::int as n from _migrations where name=$1",[file.name])).n,1);
    assert.throws(() => migrationPlan([{...file,sql:'changed'}],[{name:file.name,checksum:checksum(file.sql)}]), /changed/);
    await assert.rejects(sql.exec(migrationTransaction({name:'20990101000001_failed.sql',sql:'create table rollback_probe(id int); select missing_column;'})), /missing_column/);
    await sql.exec('rollback');
    assert.equal((await row("select to_regclass('rollback_probe') as probe")).probe,null);
    assert.equal((await row("select count(*)::int as n from _migrations where name='20990101000001_failed.sql'")).n,0);
  });
  const p1 = (await row("insert into players(steam_id, nickname) values('76561199000000001', 'One') returning id")).id;
  const p2 = (await row("insert into players(steam_id, nickname) values('76561199000000002', 'Two') returning id")).id;
  const admin = (await row("insert into players(steam_id, nickname) values('76561199000000003', 'Env admin') returning id")).id;
  const a = (await row("insert into teams(name, tag, captain_id, invite_code, is_solo) values('One', 'ONE', $1, 'one', true) returning id", [p1])).id;
  const b = (await row("insert into teams(name, tag, captain_id, invite_code, is_solo) values('Two', 'TWO', $1, 'two', true) returning id", [p2])).id;
  await sql.query("insert into team_members(team_id, player_id, is_solo) values($1, $2, true), ($3, $4, true)", [a,p1,b,p2]);
  const t = (await row("insert into tournaments(slug, name, format, status, max_teams, auto_approve) values('test','Test','1v1','registration',1,true) returning id")).id;
  const save = (team, actor, main) => row("select save_registration($1,$2,$3,$4::uuid[],'{}'::uuid[]) as r", [t,team,actor,main]);
  let regA, regB;
  await test("First valid roster auto-approves; last place cannot be allocated twice", async () => {
    regA = (await save(a,p1,[p1])).r.id;
    regB = (await save(b,p2,[p2])).r.id;
    assert.equal((await row("select status from tournament_registrations where id=$1",[regA])).status, "approved");
    assert.equal((await row("select status from tournament_registrations where id=$1",[regB])).status, "pending");
    await assert.rejects(sql.query("select change_registration($1,$2,'approved',null,true)",[regB,admin]), /tournament_full/);
    await assert.rejects(sql.query("update tournament_registrations set status='approved' where id=$1",[regB]), /tournament_full/);
  });
  await test("Repeated submission preserves registration identity and approval", async () => {
    const retry = (await save(a,p1,[p1])).r;
    assert.equal(retry.id, regA); assert.equal(retry.updated, true);
    assert.equal((await row("select count(*)::int as n from tournament_roster_players where registration_id=$1",[regA])).n,1);
  });
  await test("Conflicting roster replacement rolls back the delete and keeps old players", async () => {
    await sql.query("insert into team_members(team_id, player_id, is_solo) values($1,$2,true)",[a,p2]);
    await assert.rejects(save(a,p1,[p2]), /duplicate key/);
    assert.equal((await row("select player_id from tournament_roster_players where registration_id=$1",[regA])).player_id,p1);
  });
  await test("Captain, membership and ban checks run inside the transaction", async () => {
    await assert.rejects(save(a,p2,[p1]), /captain_required/);
    await assert.rejects(save(a,p1,[admin]), /membership_changed/);
    await sql.query("update players set is_banned=true where id=$1",[p1]);
    await assert.rejects(save(a,p1,[p1]), /player_banned/);
    await sql.query("update players set is_banned=false where id=$1",[p1]);
  });
  await test("Withdrawal removes roster atomically and can be repeated", async () => {
    await sql.query("select change_registration($1,$2,'withdrawn')",[regA,p1]);
    assert.equal((await row("select count(*)::int as n from tournament_roster_players where registration_id=$1",[regA])).n,0);
    assert.equal((await row("select change_registration($1,$2,'withdrawn') as changed",[regA,p1])).changed,false);
    // ADMIN_STEAM_IDS administrators need not have players.is_admin set.
    await sql.query("select change_registration($1,$2,'approved',null,true)",[regB,admin]);
  });
  await test("Closed registration and expired check-in reject writes", async () => {
    await sql.query("update tournaments set status='checkin',checkin_closes_at=now()-interval '1 minute' where id=$1",[t]);
    await assert.rejects(save(a,p1,[p1]), /registration_closed/);
    await assert.rejects(sql.query("select check_in_registration($1,$2)",[regB,p2]), /checkin_closed/);
    await sql.query("update tournaments set checkin_closes_at=now()+interval '1 hour' where id=$1",[t]);
    assert.equal((await row("select check_in_registration($1,$2) as changed",[regB,p2])).changed,true);
    assert.equal((await row("select check_in_registration($1,$2) as changed",[regB,p2])).changed,false);
  });
  await test("RPCs are inaccessible to anon and authenticated roles", async () => {
    for (const role of ['anon','authenticated']) {
      const { allowed } = await row("select bool_or(has_function_privilege($1, oid, 'execute')) as allowed from pg_proc where proname in ('save_registration','change_registration','check_in_registration','assign_game_server','claim_agent_commands')",[role]);
      assert.equal(allowed,false);
    }
  });
  await sql.exec("insert into server_host(id,last_seen_at) values('main',now()); update server_instances set running=true,last_seen_at=now();");
  const m1 = (await row("insert into matches(tournament_id,number,bracket,round,position,status) values($1,1,'upper',1,1,'ready') returning id",[t])).id;
  const m2 = (await row("insert into matches(tournament_id,number,bracket,round,position,status) values($1,2,'upper',1,2,'ready') returning id",[t])).id;
  await test("Server reservation and load command commit together; repeats do not enqueue twice", async () => {
    assert.equal((await row("select assign_game_server($1,'CS2-01') as ok",[m1])).ok,true);
    assert.equal((await row("select assign_game_server($1,'CS2-01') as ok",[m1])).ok,false);
    assert.equal((await row("select assign_game_server($1,'CS2-01') as ok",[m2])).ok,false);
    assert.equal((await row("select count(*)::int as n from agent_commands")).n,1);
    assert.equal((await row("select server_instance from matches where id=$1",[m2])).server_instance,null);
  });
  await test("Offline instances and pending stop commands cannot be allocated", async () => {
    await sql.exec("update server_instances set last_seen_at=now()-interval '1 minute' where name='CS2-02'");
    assert.equal((await row("select assign_game_server($1,'CS2-02') as ok",[m2])).ok,false);
    await sql.exec("update server_instances set last_seen_at=now() where name='CS2-02'; insert into agent_commands(instance,type) values('CS2-02','stop')");
    assert.equal((await row("select assign_game_server($1,'CS2-02') as ok",[m2])).ok,false);
  });
  await test("Lobby and tournament reservations share availability rules", async () => {
    const lobby = (await row("insert into lobbies(code,host_id,invite_token) values('test',$1,'invite') returning id",[p1])).id;
    const game = (await row(`insert into lobby_games(lobby_id,status,settings,team1,team2) values($1,'waiting','{}','{"bots":[]}','{"bots":[]}') returning id`,[lobby])).id;
    assert.equal((await row("select assign_game_server($1,'CS2-01',true) as ok",[game])).ok,false);
    assert.equal((await row("select assign_game_server($1,'CS2-04',true) as ok",[game])).ok,true);
    assert.equal((await row("select payload->>'lobby' as lobby from agent_commands where instance='CS2-04'")).lobby,'true');
  });
  await test("Commands are claimed once; only protocol 2 retries expired delivery leases", async () => {
    assert.equal((await sql.query("select * from claim_agent_commands(false)")).rows.length,3);
    assert.equal((await sql.query("select * from claim_agent_commands(true)")).rows.length,0);
    await sql.exec("update agent_commands set delivery_at=now()-interval '1 minute'");
    assert.equal((await sql.query("select * from claim_agent_commands(false)")).rows.length,0);
    assert.equal((await sql.query("select * from claim_agent_commands(true)")).rows.length,3);
    assert.equal((await row("select min(delivery_attempts) as n from agent_commands")).n,2);
  });
  await test("Lost acknowledgement is retried from disk without executing twice", async () => {
    const file = path.join(dir,"receipts.json");
    let journal = new CommandJournal(file);
    journal.accept([{id:'a'}]); assert.equal(journal.begin('a'),true);
    journal.complete('a',{ok:true,result:'started'});
    await assert.rejects(journal.flush(async () => { throw new Error('offline'); }), /offline/);
    journal = new CommandJournal(file);
    journal.accept([{id:'a'}]); assert.equal(journal.begin('a'),false);
    const sent=[]; await journal.flush(async (reply)=>{sent.push(reply);});
    assert.deepEqual(sent,[{id:'a',ok:true,result:'started'}]);
    assert.equal(journal.pendingResults,0);
  });
  await test("Events are only duplicates after completion; crashed handlers can be retried", async () => {
    const first=(await row("select claim_ingest('event-test') as claim")).claim;
    assert.equal(first.status,'claimed');
    assert.equal((await row("select claim_ingest('event-test') as claim")).claim.status,'busy');
    await sql.exec("update ingest_dedupe set lease_until=now()-interval '1 second' where key='event-test'");
    const retry=(await row("select claim_ingest('event-test') as claim")).claim;
    assert.equal(retry.status,'claimed'); assert.notEqual(retry.token,first.token);
    await sql.query("delete from ingest_dedupe where key='event-test' and lease_token=$1",[first.token]);
    assert.equal((await row("select count(*)::int as n from ingest_dedupe where key='event-test'")).n,1);
    await sql.query("update ingest_dedupe set completed_at=now() where key='event-test' and lease_token=$1",[retry.token]);
    assert.equal((await row("select claim_ingest('event-test') as claim")).claim.status,'done');
  });
  await test("Map score, series winner and unused maps are committed atomically", async () => {
    await sql.query("update matches set team1_id=$1,team2_id=$2,best_of=3,status='live' where id=$3",[a,b,m1]);
    await sql.query("insert into match_maps(match_id,map_number,map_name) values($1,1,'de_mirage'),($1,2,'de_nuke'),($1,3,'de_dust2')",[m1]);
    const maps=(await sql.query("select id from match_maps where match_id=$1 order by map_number",[m1])).rows;
    await sql.query("select save_match_map_score($1,$2,13,5,true)",[m1,maps[0].id]);
    assert.equal((await row("select team1_score from matches where id=$1",[m1])).team1_score,1);
    assert.equal((await row("select status from match_maps where id=$1",[maps[1].id])).status,'live');
    await assert.rejects(sql.query("select save_match_map_score($1,$2,5,5,true)",[m1,maps[1].id]),/invalid_score/);
    await sql.query("select save_match_map_score($1,$2,13,7,true)",[m1,maps[1].id]);
    const result=await row("select status,winner_id,finished_at from matches where id=$1",[m1]);
    assert.equal(result.status,'finished'); assert.equal(result.winner_id,a);
    assert.equal((await row("select count(*)::int as n from match_maps where match_id=$1",[m1])).n,2);
    await sql.query("select recompute_match_series($1)",[m1]);
    assert.deepEqual((await row("select finished_at from matches where id=$1",[m1])).finished_at,result.finished_at);
  });
  await test("Restart during execution reports uncertainty instead of repeating a destructive command", async () => {
    const file=path.join(dir,'crash.json'); let journal=new CommandJournal(file);
    journal.accept([{id:'b'}]); journal.begin('b');
    journal=new CommandJournal(file); journal.accept([{id:'b'}]); assert.equal(journal.begin('b'),false);
    await journal.flush(async (reply)=>{assert.equal(reply.ok,false); assert.match(reply.result,/неизвестен/);});
  });
  await test("CS2 log batch commits rounds, statistics and receipt together without double counting", async () => {
    await sql.query("select start_map_logging($1,1)",[m2]);
    const claim=(await row("select claim_ingest('log-test') as claim")).claim;
    const batch=JSON.stringify([{round_number:1,winner_side:'CT',events:[],swing:{'76561199000000001':0.25,'76561199000000002':0}}]);
    const params=[m2,0,batch,claim.token];
    await sql.query("select commit_log_batch($1,1,$2,'{}','[]',$3::jsonb,'log-test',$4)",params);
    assert.equal((await row("select completed_at is not null as done from ingest_dedupe where key='log-test'")).done,true);
    assert.equal((await row("select swing_sum from player_map_swing where match_id=$1 and steam_id='76561199000000001'",[m2])).swing_sum,0.25);
    await assert.rejects(sql.query("select commit_log_batch($1,1,$2,'{}','[]',$3::jsonb,'log-test',$4)",params),/log_state_changed/);
    assert.equal((await row("select rounds from player_map_swing where match_id=$1 and steam_id='76561199000000001'",[m2])).rounds,1);
    // An old going_live event must not reset an already parsed map.
    await sql.query("select start_map_logging($1,1)",[m2]);
    assert.equal((await row("select round_number from match_log_state where match_id=$1",[m2])).round_number,1);
    await sql.query("select start_map_logging($1,2)",[m2]);
    assert.equal((await row("select round_number from match_log_state where match_id=$1",[m2])).round_number,0);
  });
  console.log(`\n${checks} reliability checks passed; production was not contacted.`);
} finally {
  await sql.close();
  const resolved = path.resolve(dir);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("f16-reliability-")) throw new Error("Unsafe test cleanup path");
  rmSync(resolved,{recursive:true,force:true});
}
