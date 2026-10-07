// Официальный турнир на настоящем PostgreSQL (PGlite в памяти): анкета через player_profile_complete,
// заявка через save_official_registration (анкеты, возраст 16–35 включительно, без запасных, тренер),
// отметки документов, удаление данных заявок, и обычная регистрация через save_registration — без изменений.
// Не читает .env и не обращается к реальной базе.
import assert from "node:assert/strict";
import { migratedDatabase } from "./lib/test-db.mjs";
import { ageOn } from "../src/lib/profile";

type Row = Record<string, unknown>;
const sql = await migratedDatabase();
let checks = 0;
const test = async (name: string, work: () => Promise<void>) => { await work(); checks++; console.log(`✓ ${name}`); };
const rows = async <T = Row,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows;
const row = async <T = Row,>(query: string, params: unknown[] = []) => (await rows<T>(query, params))[0];
const fails = async (query: string, params: unknown[], pattern: RegExp) => assert.rejects(sql.query(query, params), pattern);

let seq = 0;
async function player() {
  const n = ++seq;
  return (await row<{ id: string }>("insert into players(steam_id, nickname) values($1, $2) returning id", [`765611992${String(n).padStart(8, "0")}`, `p${n}`])).id;
}
/** Полная анкета студента с датой рождения birth */
async function profile(id: string, birth: string, extra: Record<string, unknown> = {}) {
  const p = { last_name: "Иванов", first_name: "Иван", birth_date: birth, phone: "+77051234567", city: "Усть-Каменогорск", occupation: "studies", organization: "ВКТУ", course: "2", study_group: "ИС-21", consent_at: new Date().toISOString(), consent_version: "2026-10-09", ...extra };
  const keys = Object.keys(p);
  await sql.query(
    `insert into player_profiles(player_id, ${keys.join(", ")}) values($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")})
     on conflict (player_id) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(", ")}`,
    [id, ...Object.values(p)],
  );
}
/** Команда из капитана и игроков (все — участники команды) */
async function team(size: number) {
  const ids: string[] = [];
  for (let i = 0; i < size; i++) ids.push(await player());
  const n = ++seq;
  const teamId = (await row<{ id: string }>("insert into teams(name, tag, captain_id, invite_code) values($1, $2, $3, $4) returning id", [`Team ${n}`, `T${n}`, ids[0], `INV-${n}`])).id;
  for (const [i, id] of ids.entries()) await sql.query("insert into team_members(team_id, player_id, role) values($1, $2, $3)", [teamId, id, i === 0 ? "captain" : "player"]);
  return { teamId, captain: ids[0], ids };
}
/** Турнир на регистрации; starts — дата старта (по ней проверяется возраст) */
async function tournament(official: boolean, starts = "2026-11-15T05:00:00Z", extra = "") {
  const n = ++seq;
  return (await row<{ id: string }>(
    `insert into tournaments(slug, name, format, bracket_type, status, starts_at, is_official${extra ? `, ${extra.split("=")[0]}` : ""})
     values($1, $2, '5v5', 'single_elimination', 'registration', $3, $4${extra ? `, ${extra.split("=")[1]}` : ""}) returning id`,
    [`t-${n}`, `T ${n}`, starts, official],
  )).id;
}
const APP = {
  organization: "ВКТУ им. Д. Серикбаева",
  captain_phone: "+77051234567",
  responsible_name: "Петров Пётр",
  responsible_phone: "+77051112233",
  coach_name: "Сидоров Сидор",
  coach_birth_date: "1980-05-05",
  coach_workplace: "ВКТУ",
  coach_position: "Преподаватель",
};
const saveOfficial = (t: string, tm: { teamId: string; captain: string }, main: string[], sub: string[] = [], app: Record<string, unknown> = APP) =>
  row<{ r: { id: string; updated: boolean } }>("select save_official_registration($1, $2, $3, $4::uuid[], $5::uuid[], $6::jsonb) as r", [t, tm.teamId, tm.captain, main, sub, JSON.stringify(app)]);
const OFFICIAL = "select save_official_registration($1, $2, $3, $4::uuid[], $5::uuid[], $6::jsonb)";

try {
  await test("player_profile_complete mirrors isProfileComplete (occupation rules, consent)", async () => {
    const id = await player();
    const complete = async () => (await row<{ ok: boolean }>("select player_profile_complete(p) as ok from player_profiles p where player_id = $1", [id])).ok;
    await profile(id, "2000-01-01");
    assert.equal(await complete(), true);
    await sql.query("update player_profiles set study_group = ' ' where player_id = $1", [id]);
    assert.equal(await complete(), false);
    await sql.query("update player_profiles set occupation = 'works', position = 'Инженер' where player_id = $1", [id]);
    assert.equal(await complete(), true);
    await sql.query("update player_profiles set occupation = 'other', organization = null, position = null where player_id = $1", [id]);
    assert.equal(await complete(), true);
    await sql.query("update player_profiles set consent_at = null where player_id = $1", [id]);
    assert.equal(await complete(), false);
    assert.equal((await row<{ ok: boolean }>("select player_profile_complete(null::player_profiles) as ok")).ok, false);
    await fails("update player_profiles set phone = '87051234567' where player_id = $1", [id], /player_profiles_phone_format/);
  });

  await test("Personal data tables are closed to anon/authenticated, RPCs only for service_role", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["player_profiles", "tournament_applications", "tournament_participant_documents"]) {
        const { ok } = await row<{ ok: boolean }>("select has_table_privilege($1, $2, 'select') as ok", [role, `public.${table}`]);
        assert.equal(ok, false, `${role} can read ${table}`);
      }
      const { allowed } = await row<{ allowed: boolean }>(
        "select bool_or(has_function_privilege($1, oid, 'execute')) as allowed from pg_proc where proname in ('save_official_registration', 'purge_official_application_data', 'player_profile_complete')",
        [role],
      );
      assert.equal(allowed, false, `${role} can execute official RPCs`);
    }
    const { rls } = await row<{ rls: boolean }>("select bool_and(relrowsecurity) as rls from pg_class where relname in ('player_profiles', 'tournament_applications', 'tournament_participant_documents')");
    assert.equal(rls, true);
  });

  await test("Official registration: 5 players with complete profiles and a coach are saved with the application", async () => {
    const t = await tournament(true);
    const tm = await team(5);
    for (const id of tm.ids) await profile(id, "2000-01-01");
    const { r } = await saveOfficial(t, tm, tm.ids);
    assert.equal(r.updated, false);
    const app = await row<{ organization: string; coach_name: string; coach_birth_date: Date }>("select * from tournament_applications where registration_id = $1", [r.id]);
    assert.equal(app.organization, APP.organization);
    assert.equal(app.coach_name, APP.coach_name);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_roster_players where registration_id = $1", [r.id])).n, 5);
    // повторное сохранение обновляет заявку, а не создаёт вторую
    const again = await saveOfficial(t, tm, tm.ids, [], { ...APP, organization: "ВКУ" });
    assert.equal(again.r.updated, true);
    assert.equal((await row<{ n: number; org: string }>("select count(*)::int as n, max(organization) as org from tournament_applications where tournament_id = $1", [t])).org, "ВКУ");
  });

  await test("Age 16 and 35 on the tournament day pass, 15 and 36 fail; the day is taken in UTC+5", async () => {
    // старт 2026-11-14 20:00 UTC = 15 ноября в Казахстане
    const t = await tournament(true, "2026-11-14T20:00:00Z");
    const day = "2026-11-15";
    const tm = await team(5);
    const births = ["2010-11-15", "1990-11-16", "2000-01-01", "2000-01-01", "2000-01-01"];
    for (const [i, id] of tm.ids.entries()) await profile(id, births[i]);
    assert.equal(ageOn(births[0], day), 16);
    assert.equal(ageOn(births[1], day), 35);
    await saveOfficial(t, tm, tm.ids);

    const t2 = await tournament(true, "2026-11-14T20:00:00Z");
    const young = await team(5);
    for (const [i, id] of young.ids.entries()) await profile(id, i === 0 ? "2010-11-16" : "2000-01-01");
    await fails(OFFICIAL, [t2, young.teamId, young.captain, young.ids, [], JSON.stringify(APP)], /age_out_of_range/);
    const old = await team(5);
    for (const [i, id] of old.ids.entries()) await profile(id, i === 0 ? "1990-11-15" : "2000-01-01");
    await fails(OFFICIAL, [t2, old.teamId, old.captain, old.ids, [], JSON.stringify(APP)], /age_out_of_range/);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_registrations where tournament_id = $1", [t2])).n, 0, "nothing written on failure");
  });

  await test("Official registration rejects incomplete profiles, substitutes, missing coach and non-official tournaments", async () => {
    const t = await tournament(true);
    const tm = await team(7);
    for (const id of tm.ids) await profile(id, "2000-01-01");
    await sql.query("update player_profiles set phone = null where player_id = $1", [tm.ids[3]]);
    await fails(OFFICIAL, [t, tm.teamId, tm.captain, tm.ids.slice(0, 5), [], JSON.stringify(APP)], /profile_incomplete/);
    await profile(tm.ids[3], "2000-01-01");
    const noProfile = await team(5);
    await fails(OFFICIAL, [t, noProfile.teamId, noProfile.captain, noProfile.ids, [], JSON.stringify(APP)], /profile_incomplete/);
    await fails(OFFICIAL, [t, tm.teamId, tm.captain, tm.ids.slice(0, 5), tm.ids.slice(5, 6), JSON.stringify(APP)], /invalid_roster/);
    await fails(OFFICIAL, [t, tm.teamId, tm.captain, tm.ids.slice(0, 5), [], JSON.stringify({ ...APP, coach_name: "" })], /application_incomplete/);
    await fails(OFFICIAL, [t, tm.teamId, tm.captain, tm.ids.slice(0, 5), [], JSON.stringify({ ...APP, responsible_phone: null })], /application_incomplete/);
    await fails(OFFICIAL, [t, tm.teamId, tm.captain, tm.ids.slice(0, 4), [], JSON.stringify(APP)], /invalid_roster/);
    const plain = await tournament(false);
    await fails(OFFICIAL, [plain, tm.teamId, tm.captain, tm.ids.slice(0, 5), [], JSON.stringify(APP)], /not_official/);

    // запасные разрешены настройкой, тренер не обязателен
    const relaxed = await tournament(true, "2026-11-15T05:00:00Z", "allow_substitutes, require_coach=true, false");
    const { r } = await saveOfficial(relaxed, tm, tm.ids.slice(0, 5), tm.ids.slice(5, 7), { ...APP, coach_name: "", coach_birth_date: "", coach_workplace: "", coach_position: "" });
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_roster_players where registration_id = $1 and role = 'sub'", [r.id])).n, 2);
    assert.equal((await row<{ coach: string | null }>("select coach_name as coach from tournament_applications where registration_id = $1", [r.id])).coach, null);
  });

  await test("Each participant plays for one team: the same player cannot enter a second application", async () => {
    const t = await tournament(true);
    const a = await team(5);
    const b = await team(4);
    for (const id of [...a.ids, ...b.ids]) await profile(id, "2000-01-01");
    await saveOfficial(t, a, a.ids);
    // игрок перешёл в другую команду, но уже заявлен на турнир за первую — unique(tournament_id, player_id)
    await sql.query("update team_members set left_at = now() where player_id = $1 and team_id = $2", [a.ids[4], a.teamId]);
    await sql.query("insert into team_members(team_id, player_id, role) values($1, $2, 'player')", [b.teamId, a.ids[4]]);
    await fails(OFFICIAL, [t, b.teamId, b.captain, [...b.ids, a.ids[4]], [], JSON.stringify(APP)], /duplicate key|unique/);
  });

  await test("Coach documents survive a re-save with the same coach and reset for another coach; purge only after the end", async () => {
    const t = await tournament(true);
    const tm = await team(5);
    for (const id of tm.ids) await profile(id, "2000-01-01");
    const { r } = await saveOfficial(t, tm, tm.ids);
    await sql.query("update tournament_applications set coach_documents_at = now() where registration_id = $1", [r.id]);
    await sql.query("insert into tournament_participant_documents(tournament_id, player_id) values($1, $2)", [t, tm.ids[0]]);
    await saveOfficial(t, tm, tm.ids);
    assert.notEqual((await row<{ at: Date | null }>("select coach_documents_at as at from tournament_applications where registration_id = $1", [r.id])).at, null);
    await saveOfficial(t, tm, tm.ids, [], { ...APP, coach_name: "Другой Тренер" });
    assert.equal((await row<{ at: Date | null }>("select coach_documents_at as at from tournament_applications where registration_id = $1", [r.id])).at, null);
    // отметка документов игрока переживает пересохранение состава (строки состава пересоздаются)
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_participant_documents where tournament_id = $1", [t])).n, 1);

    await fails("select purge_official_application_data($1)", [t], /tournament_not_finished/);
    await sql.query("update tournaments set status = 'finished' where id = $1", [t]);
    const { res } = await row<{ res: { applications: number; documents: number } }>("select purge_official_application_data($1) as res", [t]);
    assert.deepEqual(res, { applications: 1, documents: 1 });
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_roster_players where tournament_id = $1", [t])).n, 5, "rosters stay");
  });

  await test("Non-official registration is unchanged: save_registration with subs and no profiles", async () => {
    const t = await tournament(false);
    const tm = await team(7);
    const { r } = await row<{ r: { id: string; updated: boolean; approved: boolean } }>(
      "select save_registration($1, $2, $3, $4::uuid[], $5::uuid[]) as r",
      [t, tm.teamId, tm.captain, tm.ids.slice(0, 5), tm.ids.slice(5, 7)],
    );
    assert.deepEqual([r.updated, r.approved], [false, false]);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_roster_players where registration_id = $1", [r.id])).n, 7);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_applications where tournament_id = $1", [t])).n, 0);
    const defaults = await row<Row>("select is_official, min_age, max_age, city, require_coach, allow_substitutes, third_place_match from tournaments where id = $1", [t]);
    assert.deepEqual(defaults, { is_official: false, min_age: 16, max_age: 35, city: "Усть-Каменогорск", require_coach: true, allow_substitutes: false, third_place_match: false });
    await fails("update tournaments set min_age = 40 where id = $1", [t], /tournaments_age_range/);
  });

  console.log(`\n${checks} official tournament database checks passed`);
} finally {
  await sql.close();
}
