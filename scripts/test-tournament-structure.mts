// Структура городского турнира: матч за 3-е место (чистая сетка и PGlite через sync_bracket_apply),
// жеребьёвка (перестановка и запись в журнал), метрики номинаций, таблица решений судей.
// Не читает .env и не обращается к реальной базе.
// Запуск: node --conditions=react-server --import=tsx scripts/test-tournament-structure.mts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migratedDatabase } from "./lib/test-db.mjs";
import { generateBracket, resolveBracket, roundTitle, type BracketMatch } from "../src/lib/bracket";
import { computePlacements } from "../src/lib/awards-core";
import { eliminationStageRows, planBracketSync } from "../src/lib/matches";
import { drawOrder, drawOrderText, parseDrawRecord, type DrawRecord } from "../src/lib/draw";
import { nominationDiploma, placeDiploma, placeRoman, registrationOrganization } from "../src/lib/diplomas";
import {
  bestRifler,
  bestSniper,
  bestSupport,
  eligibleLines,
  isRifler,
  isSniperWeapon,
  supportScore,
  type NominationLine,
} from "../src/lib/nominations-core";
import type { Match } from "../src/lib/types";

let checks = 0;
const test = async (name: string, work: () => void | Promise<void>) => {
  await work();
  checks++;
  console.log(`✓ ${name}`);
};
const ids = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const loserOf = (m: { winner_id: string | null; team1_id: string | null; team2_id: string | null }) =>
  m.winner_id === m.team1_id ? m.team2_id : m.team1_id;

/** Играет сетку до конца: выигрывает команда с лучшим посевом (меньший индекс в seeded) */
function playOut(bracket: BracketMatch[], seeded: string[]) {
  const seed = (id: string) => seeded.indexOf(id);
  for (let guard = 0; guard < 100; guard++) {
    const ready = bracket.filter((m) => m.status === "upcoming");
    if (!ready.length) break;
    for (const m of ready) {
      m.status = "finished";
      m.winner_id = seed(m.team1_id!) < seed(m.team2_id!) ? m.team1_id : m.team2_id;
    }
    resolveBracket(bracket);
  }
}

// ───────────────────────── матч за 3-е место: чистая сетка

for (const n of [4, 5, 8, 12, 16]) {
  await test(`SE ${n} команд + матч за 3-е место: структура, проигравшие полуфиналов, места 1–4`, () => {
    const seeded = ids(n);
    const b = generateBracket({ seeded, double: false, bestOf: 1, finalBestOf: 3, thirdPlace: true });
    const k = Math.max(...b.filter((m) => m.bracket === "upper").map((m) => m.round));
    const third = b.filter((m) => m.bracket === "third_place");
    assert.equal(third.length, 1, "ровно один матч за 3-е место");
    const tp = third[0];
    assert.equal(tp.round, k, "раунд — как у финала");
    assert.equal(tp.best_of, 3, "формат — как у полуфиналов (финальная стадия)");
    assert.equal(roundTitle(tp.bracket, tp.round, k, 0), "Матч за 3-е место");
    const semis = b.filter((m) => m.bracket === "upper" && m.round === k - 1).sort((a, c) => a.position - c.position);
    assert.equal(semis.length, 2);
    assert.deepEqual(semis.map((s) => s.loser_to), [{ key: tp.key, slot: 1 }, { key: tp.key, slot: 2 }], "проигравшие полуфиналов — в слоты 1 и 2");
    assert.ok(b.filter((m) => m.bracket === "upper" && m.round !== k - 1).every((m) => !m.loser_to), "остальные матчи проигравших никуда не ведут");
    const final = b.find((m) => m.bracket === "upper" && m.round === k)!;
    assert.ok(tp.number < final.number, "матч за 3-е место идёт перед финалом");
    assert.deepEqual([...b.map((m) => m.number)].sort((a, c) => a - c), b.map((_, i) => i + 1), "сквозная нумерация без дыр");
    assert.equal(b.length, 2 ** k, "матчей: размер сетки − 1 + матч за 3-е место");

    playOut(b, seeded);
    assert.deepEqual(b.filter((m) => !["finished", "cancelled"].includes(m.status)).map((m) => m.key), [], "сетка доиграна");
    assert.equal(tp.status, "finished");
    assert.deepEqual([tp.team1_id, tp.team2_id].sort(), ["T3", "T4"], "в матче за 3-е место — проигравшие полуфиналов");
    const places = computePlacements(b).map((p) => `${p.teamId}:${p.place}`).sort();
    assert.deepEqual(places, ["T1:1", "T2:2", "T3:3"], "3-е место — победитель матча за 3-е место, а не оба полуфиналиста");
    assert.equal(loserOf(tp), "T4", "4-е место — проигравший матча за 3-е место");
  });
}

await test("Без флага, при 3 командах и в Double Elimination матча за 3-е место нет; старое правило мест не изменилось", () => {
  assert.equal(generateBracket({ seeded: ids(8), double: false }).some((m) => m.bracket === "third_place"), false);
  assert.equal(generateBracket({ seeded: ids(3), double: false, thirdPlace: true }).some((m) => m.bracket === "third_place"), false);
  assert.equal(generateBracket({ seeded: ids(8), double: true, thirdPlace: true }).some((m) => m.bracket === "third_place"), false);
  const plain = generateBracket({ seeded: ids(4), double: false });
  playOut(plain, ids(4));
  assert.deepEqual(computePlacements(plain).map((p) => `${p.teamId}:${p.place}`).sort(), ["T1:1", "T2:2", "T3:3", "T4:3"], "без матча — оба полуфиналиста делят 3-е");
});

await test("Финал сыгран, матч за 3-е место ещё нет — 3-го места пока нет", () => {
  const b = generateBracket({ seeded: ids(4), double: false, thirdPlace: true });
  const seed = (id: string) => ids(4).indexOf(id);
  for (const m of b.filter((x) => x.bracket === "upper" && x.round === 1)) {
    m.status = "finished";
    m.winner_id = seed(m.team1_id!) < seed(m.team2_id!) ? m.team1_id : m.team2_id;
  }
  resolveBracket(b);
  const final = b.find((m) => m.bracket === "upper" && m.round === 2)!;
  final.status = "finished";
  final.winner_id = final.team1_id;
  resolveBracket(b);
  assert.equal(b.find((m) => m.bracket === "third_place")!.status, "upcoming");
  assert.deepEqual(computePlacements(b).map((p) => p.place).sort(), [1, 2]);
});

await test("Полуфиналист снялся (полуфинал — тех. победа без соперника): матч за 3-е место — тех. победа второго проигравшего", () => {
  const seeded = ids(4);
  const b = generateBracket({ seeded, double: false, thirdPlace: true });
  // T4 снялся до полуфинала: слот пуст — полуфинал T1 закрывается тех. победой, проигравшего нет
  const semi = b.find((m) => m.bracket === "upper" && m.round === 1 && (m.team1_id === "T4" || m.team2_id === "T4"))!;
  if (semi.team1_id === "T4") semi.team1_id = null;
  else semi.team2_id = null;
  semi.status = "pending";
  resolveBracket(b);
  assert.equal(semi.status, "finished");
  assert.equal(semi.is_walkover, true);
  const tp = b.find((m) => m.bracket === "third_place")!;
  assert.equal(tp.status, "pending", "ждём второй полуфинал");
  playOut(b, seeded);
  assert.equal(tp.status, "finished");
  assert.equal(tp.is_walkover, true);
  assert.equal(tp.winner_id, "T3", "единственный проигравший полуфиналов получает 3-е место");
  assert.deepEqual(computePlacements(b).map((p) => `${p.teamId}:${p.place}`).sort(), ["T1:1", "T2:2", "T3:3"]);
});

await test("Плей-офф после групп (Single Elimination) получает матч за 3-е место по тому же флагу; Double — нет", () => {
  const se = eliminationStageRows({ default_best_of: 1, final_best_of: 3, third_place_match: true }, ids(4).map(() => randomUUID()), false);
  const tp = se.find((r) => r.bracket === "third_place")!;
  assert.ok(tp);
  assert.equal(se.filter((r) => r.loser_to_match === tp.id).length, 2, "оба полуфинала ведут проигравших в матч за 3-е место (id матчей)");
  assert.equal(eliminationStageRows({ default_best_of: 1, final_best_of: 3, third_place_match: true }, ids(8).map(() => randomUUID()), true)
    .some((r) => r.bracket === "third_place"), false);
  assert.equal(eliminationStageRows({ default_best_of: 1, final_best_of: 3 }, ids(4).map(() => randomUUID()), false)
    .some((r) => r.bracket === "third_place"), false, "без флага (старые турниры) — как раньше");
});

// ───────────────────────── жеребьёвка

await test("Жеребьёвка: всегда перестановка исходных команд, все порядки равновероятны", () => {
  const teams = ids(16);
  for (let i = 0; i < 200; i++) {
    const order = drawOrder(teams);
    assert.equal(order.length, teams.length);
    assert.deepEqual([...order].sort(), [...teams].sort());
  }
  assert.deepEqual(teams, ids(16), "исходный массив не меняется");
  // детерминированный источник: Фишер–Йетс с random() = 0 сдвигает каждый элемент в начало
  assert.deepEqual(drawOrder(["a", "b", "c", "d"], () => 0), ["b", "c", "d", "a"]);
  const counts = new Map<string, number>();
  const trials = 6000;
  for (let i = 0; i < trials; i++) {
    const k = drawOrder(["a", "b", "c"]).join("");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.equal(counts.size, 6, "встречаются все 6 перестановок");
  for (const [k, c] of counts) assert.ok(Math.abs(c - trials / 6) < trials / 6 * 0.2, `перестановка ${k}: ${c} из ${trials}`);
  assert.deepEqual(drawOrder([]), []);
  assert.deepEqual(drawOrder(["x"]), ["x"]);
});

await test("Жеребьёвка: протокол разбирается из журнала по порядку посева", () => {
  const record: DrawRecord = { order: [{ seed: 2, team_id: "b", name: "Bravo" }, { seed: 1, team_id: "a", name: "Alpha" }], teams: 2, onlyCheckedIn: true, redo: false };
  const parsed = parseDrawRecord(JSON.parse(JSON.stringify(record)))!;
  assert.equal(drawOrderText(parsed), "1. Alpha, 2. Bravo");
  assert.equal(parsed.onlyCheckedIn, true);
  assert.equal(parseDrawRecord({ teams: 3 }), null);
  assert.equal(parseDrawRecord(null), null);
});

// ───────────────────────── номинации

const line = (key: string, o: Partial<NominationLine> = {}): NominationLine => ({
  key, teamId: "A", maps: 4, teamMaps: 4, rounds: 80, assists: 10, flashAssists: 0, utilityDamage: 0, kast: 70, adr: 75, rating: 1,
  sniperKills: 0, loggedKills: 50, ...o,
});

await test("Номинации: снайпер — больше всего убийств из AWP/SSG 08, при равенстве — за раунд", () => {
  assert.ok(isSniperWeapon("awp") && isSniperWeapon("weapon_ssg08") && isSniperWeapon("AWP"));
  assert.ok(!isSniperWeapon("ak47") && !isSniperWeapon("g3sg1") && !isSniperWeapon(null));
  const lines = [
    line("awper", { sniperKills: 40, loggedKills: 60 }),
    line("tie", { sniperKills: 40, rounds: 60, loggedKills: 55 }), // столько же, но за меньше раундов
    line("bench", { sniperKills: 90, maps: 1 }), // сыграл меньше половины карт команды — не участвует
  ];
  assert.equal(bestSniper(lines)?.line.key, "tie");
  assert.match(bestSniper(lines)!.value, /40 убийств из AWP\/SSG 08/);
  assert.equal(bestSniper([line("a", { sniperKills: null, loggedKills: null })]), null, "нет лога с оружием — нет кандидата");
  assert.equal(bestSniper([line("a")]), null, "ноль снайперских убийств — нет кандидата");
  assert.deepEqual(eligibleLines(lines).map((l) => l.key), ["awper", "tie"]);
});

await test("Номинации: рифлер — лучший Rating среди тех, у кого снайперские убийства < 30%", () => {
  const lines = [
    line("awper", { rating: 1.4, sniperKills: 30, loggedKills: 60 }), // 50% — снайпер
    line("rifler", { rating: 1.2, adr: 80, sniperKills: 5, loggedKills: 60 }),
    line("rifler2", { rating: 1.2, adr: 90, sniperKills: 0, loggedKills: 40 }),
  ];
  assert.ok(!isRifler(lines[0]) && isRifler(lines[1]));
  assert.equal(bestRifler(lines)?.line.key, "rifler2", "при равном Rating — выше ADR");
  assert.equal(bestRifler([line("x", { rating: 1.3, sniperKills: null, loggedKills: null })])?.line.key, "x", "без лога с оружием рифлеры — все");
});

await test("Номинации: опорник — (ассисты + флеш-ассисты)/раунд + урон гранатами/(100·раунд), при равенстве — KAST", () => {
  const a = line("a", { assists: 16, flashAssists: 4, utilityDamage: 800, rounds: 100 }); // 0.16 + 0.04 + 0.08 = 0.28
  const b = line("b", { assists: 24, flashAssists: 0, utilityDamage: 0, rounds: 100 }); // 0.24
  assert.ok(Math.abs(supportScore(a) - 0.28) < 1e-9);
  assert.equal(bestSupport([a, b])?.line.key, "a");
  const c = line("c", { assists: 28, rounds: 100, kast: 80 });
  const d = line("d", { assists: 28, rounds: 100, kast: 75 });
  assert.equal(bestSupport([d, c])?.line.key, "c", "равный индекс — выше KAST");
  assert.equal(bestSupport([line("z", { assists: 0 })]), null);
});

await test("Дипломы: места I–III (3–4 — тоже III), 4-е место без диплома, номинация с командой", () => {
  assert.deepEqual(["1", "2", "3", "3–4", "4"].map(placeRoman), ["I", "II", "III", "III", null]);
  assert.equal(placeDiploma("k", "1", "Alpha", null, "CS Uka-2026")!.reason, "за I место в городском спортивном турнире «CS Uka-2026»");
  assert.equal(placeDiploma("k", "4", "Delta", null, "CS Uka-2026"), null);
  const nom = nominationDiploma("n", "Лучший снайпер", "s1mple", "Alpha", "CS Uka-2026");
  assert.equal(nom.reason, "в номинации «Лучший снайпер»");
  assert.equal(nom.event, "городского спортивного турнира «CS Uka-2026»");
  assert.equal(registrationOrganization({ organization: "  Колледж №1 " }), "Колледж №1");
  assert.equal(registrationOrganization({}), null);
  assert.equal(registrationOrganization(undefined), null);
});

// ───────────────────────── PGlite: настоящая база с миграциями

const sql = await migratedDatabase();
try {
  type Row = Record<string, unknown>;
  const rows = async <T = Row,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows;
  const row = async <T = Row,>(query: string, params: unknown[] = []) => (await rows<T>(query, params))[0];
  let seq = 0;
  const player = async () => {
    const n = ++seq;
    return (await row<{ id: string }>("insert into players(steam_id, nickname) values($1, $2) returning id", [`765611992${String(n).padStart(8, "0")}`, `p${n}`])).id;
  };
  const team = async () => {
    const captain = await player();
    const n = ++seq;
    const id = (await row<{ id: string }>("insert into teams(name, tag, captain_id, invite_code) values($1, $2, $3, $4) returning id", [`Team ${n}`, `S${n}`, captain, `INV-S${n}`])).id;
    await sql.query("insert into team_members(team_id, player_id, role) values($1, $2, 'captain')", [id, captain]);
    return id;
  };
  const tournament = async () => {
    const n = ++seq;
    return (await row<{ id: string }>(
      "insert into tournaments(slug, name, format, bracket_type, status, third_place_match) values($1, $2, '5v5', 'single_elimination', 'live', true) returning id",
      [`s-${n}`, `S ${n}`],
    )).id;
  };
  const sync = async (t: string) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = await rows<Match>("select * from matches where tournament_id = $1 and stage = 'playoff'", [t]);
      const { expected, updates } = planBracketSync(snapshot);
      if (!updates.length) return;
      const { r } = await row<{ r: { status: string } }>("select sync_bracket_apply($1, $2::jsonb, $3::jsonb) as r", [t, JSON.stringify(expected), JSON.stringify(updates)]);
      if (r.status === "ok") return;
    }
    throw new Error("bracket sync did not converge");
  };
  const pool: string[] = [];
  for (let i = 0; i < 16; i++) pool.push(await team());

  for (const n of [4, 5, 8, 12, 16]) {
    await test(`PGlite: SE ${n} команд с матчем за 3-е место через create_stage_matches и sync_bracket_apply`, async () => {
      const t = await tournament();
      const flag = (await row<{ f: boolean }>("select third_place_match as f from tournaments where id = $1", [t])).f;
      const seeded = pool.slice(0, n);
      const stage = eliminationStageRows({ default_best_of: 1, final_best_of: 3, third_place_match: flag }, seeded, false);
      assert.equal((await row<{ ok: boolean }>("select create_stage_matches($1, 'bracket', $2::jsonb) as ok", [t, JSON.stringify(stage)])).ok, true);
      await sync(t);
      const seed = (id: string) => seeded.indexOf(id);
      for (let i = 0; i < 40; i++) {
        const ready = await rows<Match>("select * from matches where tournament_id = $1 and status = 'upcoming'", [t]);
        if (!ready.length) break;
        for (const m of ready) {
          const winner = seed(m.team1_id!) < seed(m.team2_id!) ? m.team1_id : m.team2_id;
          await sql.query("update matches set status = 'finished', winner_id = $2 where id = $1", [m.id, winner]);
        }
        await sync(t);
      }
      const all = await rows<Match>("select * from matches where tournament_id = $1", [t]);
      assert.deepEqual(all.filter((m) => !["finished", "cancelled"].includes(m.status)).map((m) => m.number), []);
      const tp = all.find((m) => m.bracket === "third_place")!;
      assert.ok(tp, "матч за 3-е место записан в базу (значение enum bracket_side)");
      assert.equal(tp.winner_id, seeded[2]);
      assert.equal(loserOf(tp), seeded[3]);
      assert.equal(all.filter((m) => m.loser_to_match === tp.id).length, 2);
      const places = computePlacements(all).map((p) => `${seed(p.teamId) + 1}:${p.place}`).sort();
      assert.deepEqual(places, ["1:1", "2:2", "3:3"]);
    });
  }

  await test("PGlite: протокол жеребьёвки пишется в audit_logs и читается последним по турниру", async () => {
    const t = await tournament();
    const order = drawOrder(pool.slice(0, 8));
    const record: DrawRecord = { order: order.map((id, i) => ({ seed: i + 1, team_id: id, name: `Team ${i}` })), teams: 8, onlyCheckedIn: true, redo: false };
    await sql.query("insert into audit_logs(action, entity_type, entity_id, payload) values('bracket.draw', 'tournament', $1, $2::jsonb)", [t, JSON.stringify(record)]);
    await sql.query("insert into audit_logs(action, entity_type, entity_id, payload, created_at) values('bracket.draw', 'tournament', $1, $2::jsonb, now() + interval '1 second')",
      [t, JSON.stringify({ ...record, redo: true })]);
    const last = await row<{ payload: unknown }>("select payload from audit_logs where entity_id = $1 and action = 'bracket.draw' order by created_at desc limit 1", [t]);
    const parsed = parseDrawRecord(last.payload)!;
    assert.equal(parsed.redo, true);
    assert.deepEqual(parsed.order.map((x) => x.team_id), order);
  });

  await test("PGlite: решение судей по номинации — одна строка на номинацию, тренер без аккаунта, RLS включён", async () => {
    const t = await tournament();
    const p = await player();
    await sql.query("insert into tournament_nominations(tournament_id, key, player_id, team_id) values($1, 'sniper', $2, $3)", [t, p, pool[0]]);
    await sql.query(`insert into tournament_nominations(tournament_id, key, name, team_id) values($1, 'sniper', 'Иванов', null)
      on conflict (tournament_id, key) do update set player_id = excluded.player_id, name = excluded.name, team_id = excluded.team_id`, [t]);
    const sniper = await row<{ player_id: string | null; name: string | null }>("select player_id, name from tournament_nominations where tournament_id = $1 and key = 'sniper'", [t]);
    assert.deepEqual(sniper, { player_id: null, name: "Иванов" });
    await sql.query("insert into tournament_nominations(tournament_id, key, name, team_id) values($1, 'coach', 'Петров Пётр Петрович', $2)", [t, pool[1]]);
    await assert.rejects(sql.query("insert into tournament_nominations(tournament_id, key) values($1, 'captain')", [t]), /check/i, "нужен игрок или имя");
    await assert.rejects(sql.query("insert into tournament_nominations(tournament_id, key, name) values($1, 'Bad Key!', 'x')", [t]), /check/i);
    assert.equal((await row<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = 'tournament_nominations'")).rls, true);
    await sql.query("delete from tournaments where id = $1", [t]);
    assert.equal((await row<{ n: number }>("select count(*)::int as n from tournament_nominations where tournament_id = $1", [t])).n, 0, "удаляются вместе с турниром");
  });
} finally {
  await sql.close();
}

console.log(`\n${checks} tournament-structure checks passed; production was not contacted.`);
