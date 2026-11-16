// Скины игроков: правила правок, очередь сайта, обмен с агентом и SQL для базы плагина.
// PGlite + мини-PostgREST (scripts/lib/pg-rest.mjs). Не читает .env и не ходит в сеть.
import assert from "node:assert/strict";
import { createPgRest } from "./lib/pg-rest.mjs";
import { migratedDatabase } from "./lib/test-db.mjs";

const sql = await migratedDatabase();
globalThis.fetch = createPgRest(sql) as typeof fetch;

const core = await import("../src/lib/skins-core");
const S = await import("../src/lib/skins");
const agent = await import("../server/agent/skin-sync.mjs");

let checks = 0;
const ok = (name: string) => (checks++, console.log(`✓ ${name}`));
const ME = "76561198000000001";

try {
  // ── правила правок
  assert.equal(core.parseOp({ k: "skin", t: 1, d: 7, p: 1, w: 0, s: 0 }), null, "unknown side");
  assert.equal(core.parseOp({ k: "skin", t: 3, d: 7, p: 0, w: 0, s: 0 }), null, "paint is required");
  assert.equal(core.parseOp({ k: "knife", t: 3, v: "weapon_knife'; drop table x" }), null);
  const tagged = core.parseOp({ k: "skin", t: 3, d: 7, p: 1449, w: 7, s: 12, n: `  F16 "best"; <b>  `, st: true });
  assert.deepEqual(tagged, { k: "skin", t: 3, d: 7, p: 1449, w: 1, s: 12, n: "F16 best b", st: 1 });
  assert.equal(core.parseOp({ k: "skin", t: 3, d: 7, p: 1, w: 0.1, s: 1001 }), null, "seed above 1000");
  ok("Edit rules: side 2/3 only, paint required, wear clamped to 0..1, nametag stripped of quotes and markup");

  // ── набор и правки
  let lo = core.EMPTY_LOADOUT;
  lo = core.applyOp(lo, { k: "skin", t: 3, d: 7, p: 1449, w: 0.01, s: 0, n: null, st: 0 });
  lo = core.applyOp(lo, { k: "skin", t: 3, d: 7, p: 1425, w: 0.2, s: 5, n: null, st: 1 });
  assert.equal(lo.skins.length, 1, "one paint per weapon and side");
  assert.equal(lo.skins[0].p, 1425);
  lo = core.applyOp(lo, { k: "glove", t: 3, d: 5030, p: 10038, w: 0.1, s: 0 });
  lo = core.applyOp(lo, { k: "glove", t: 3, d: 5031, p: 10013, w: 0.1, s: 0 });
  assert.equal(lo.gloves[3], 5031);
  assert.ok(!lo.skins.some((s) => s.d === 5030), "paint of the previous gloves is dropped");
  lo = core.applyOp(lo, { k: "knife", t: 2, v: "weapon_knife_karambit" });
  lo = core.applyOp(lo, { k: "knife", t: 2, v: core.DEFAULT_KNIFE });
  assert.deepEqual(lo.knife, {});
  lo = core.applyOp(lo, { k: "reset", t: 3, d: 7 });
  lo = core.applyOp(lo, { k: "glove", t: 3, d: 0, p: 0, w: 0, s: 0 });
  assert.deepEqual(lo, core.EMPTY_LOADOUT);
  ok("Loadout: one paint per weapon and side, one pair of gloves per side, default knife clears the choice");

  // ── сайт: очередь правок видна сразу, поверх зеркала с сервера
  await S.exchangeWithAgent([{ steam_id: ME, data: { skins: [{ t: 3, d: 9, p: 344, w: 0.01, s: 0, n: null, st: 0 }], knife: { 2: "weapon_knife_butterfly" }, gloves: {} } }], []);
  let view = await S.getLoadout(ME);
  assert.equal(view.pending, 0);
  assert.equal(view.loadout.skins[0].d, 9);
  assert.equal(view.loadout.knife[2], "weapon_knife_butterfly");
  assert.ok(await S.queueOps(ME, [{ k: "skin", t: 3, d: 7, p: 1449, w: 0.03, s: 1, n: "F16", st: 1 }, { k: "reset", t: 3, d: 9 }]));
  view = await S.getLoadout(ME);
  assert.equal(view.pending, 2);
  assert.equal(view.stale, false);
  assert.deepEqual(view.loadout.skins.map((s) => s.d), [7], "site shows the edit before the server PC applied it");
  ok("Site: a player's edit shows at once on top of the server copy; two edits wait for the server PC");

  // ── агент забирает правки, подтверждает и присылает новый набор
  const ops = await S.exchangeWithAgent([], []);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].steam_id, ME);
  const again = await S.exchangeWithAgent([], []);
  assert.equal(again.length, 2, "unconfirmed edits are offered again");
  const after = await S.exchangeWithAgent(
    [{ steam_id: ME, data: { skins: [{ t: 3, d: 7, p: 1449, w: 0.03, s: 1, n: "F16", st: 1 }], knife: { 2: "weapon_knife_butterfly" }, gloves: {} } }],
    ops.map((o) => ({ id: o.id })),
  );
  assert.equal(after.length, 0);
  view = await S.getLoadout(ME);
  assert.equal(view.pending, 0);
  assert.deepEqual(view.loadout.skins, [{ t: 3, d: 7, p: 1449, w: 0.03, s: 1, n: "F16", st: 1 }]);
  ok("Server PC: takes edits, gets them again until confirmed, then the site shows the server copy with nothing pending");

  // ── зависшая правка: серверный ПК не на связи
  await S.queueOps(ME, [{ k: "knife", t: 3, v: "weapon_knife_karambit" }]);
  await sql.query("update skin_ops set created_at = now() - interval '10 minutes' where applied_at is null");
  view = await S.getLoadout(ME);
  assert.equal(view.stale, true);
  assert.equal(view.loadout.knife[3], "weapon_knife_karambit");
  ok("An edit waiting over two minutes is flagged: the server PC is offline");

  // ── SQL для базы плагина
  assert.equal(agent.opSql("7656119800000000x", { k: "reset", t: 3, d: 7 }), null, "steam id must be 17 digits");
  assert.equal(agent.opSql(ME, { k: "knife", t: 2, v: "weapon_knife'; x" }), null);
  assert.equal(agent.opSql(ME, { k: "skin", t: 3, d: "7; drop", p: 1, w: 0, s: 0 }), null);
  const skinSql = agent.opSql(ME, { k: "skin", t: 3, d: 7, p: 1449, w: 0.03, s: 1, n: `x'); DROP TABLE wp_player_skins; --`, st: 1 })!;
  assert.match(skinSql, /ON DUPLICATE KEY UPDATE/);
  assert.ok(!/DROP TABLE/i.test(skinSql), "nametag never reaches SQL as text");
  assert.match(skinSql, /CONVERT\(UNHEX\('[0-9a-f]+'\) USING utf8mb4\)/);
  assert.ok(!/weapon_sticker_0 = /.test(skinSql.split("ON DUPLICATE KEY UPDATE")[1]), "stickers set in game are kept");
  assert.match(agent.opSql(ME, { k: "knife", t: 2, v: "weapon_knife" })!, /^DELETE FROM wp_player_knife/);
  const gloveSql = agent.opSql(ME, { k: "glove", t: 2, d: 5030, p: 10038, w: 0.1, s: 0 })!;
  assert.match(gloveSql, /DELETE s FROM wp_player_skins[\s\S]+INSERT INTO wp_player_gloves[\s\S]+INSERT INTO wp_player_skins/);
  ok("Plugin database SQL: ids are numbers only, nametag goes as hex, stickers set in game survive an edit");

  // ── чтение базы плагина
  const rows = agent.groupRows([
    `{"k":"s","id":"${ME}","t":3,"d":7,"p":1449,"w":0.009999999776482582,"s":0,"n":null,"st":0}`,
    `{"k":"s","id":"${ME}","t":3,"d":9,"p":0,"w":0,"s":0,"n":null,"st":0}`,
    `{"k":"k","id":"${ME}","t":2,"v":"weapon_knife"}`,
    `{"k":"g","id":"${ME}","t":2,"d":5030}`,
    "broken",
    `{"k":"s","id":"abc","t":3,"d":7,"p":1,"w":0,"s":0}`,
  ]);
  assert.equal(rows.size, 1);
  assert.deepEqual(rows.get(ME), { skins: [{ t: 3, d: 7, p: 1449, w: 0.01, s: 0, n: null, st: 0 }], knife: {}, gloves: { 2: 5030 } });
  ok("Plugin database rows: wear is rounded, default knife and unpainted weapons are skipped, junk rows ignored");

  // известный пример: M4A1-S (60), раскраска 440, шаблон 353, износ ≈0.00541, редкость 5
  const bits = 0x69 + 0x23 * 2 ** 7 + 0x45 * 2 ** 14 + 0x5d * 2 ** 21 + 0x03 * 2 ** 28;
  const wearF = new Float32Array(new Uint32Array([bits]).buffer)[0];
  assert.equal(core.inspectHex({ d: 60, p: 440, w: wearF, s: 353, rarity: 5 }), "00183C20B803280538E9A3C5DD0340E102C246A0D1");
  assert.ok(core.inspectLink({ d: 7, p: 302, w: 0.5, s: 1, st: 1, n: "F16" }).startsWith("steam://rungame/730/76561202255233023/+csgo_econ_action_preview%2000"));
  assert.deepEqual([core.sideOnly(7), core.sideOnly(16), core.sideOnly(9)], [2, 3, null]);
  ok("In-game inspect link matches the known example; AK-47 is T only, M4A4 is CT only, AWP is for both");

  console.log(`\n${checks} skin checks passed`);
} finally {
  await sql.close();
}
