// Чистые функции без базы: разбор лога CS2 и Swing, агрегирование статистики игроков,
// план вето и карты серии, проверка картинок и окна check-in.
import assert from "node:assert/strict";
import { computeRoundSwing, parseLogLine, toSteam64, winProbCT, type LogEvent, type Side } from "../src/lib/swing";
import { aggregatePlayers, type MapStatRow } from "../src/lib/stats";
import { seriesMaps, vetoPlan, vetoState, type VetoAction } from "../src/lib/veto";
import { checkinWindowError, sniffImage } from "../src/lib/data";

let checks = 0;
const test = (name: string, work: () => void) => { work(); checks++; console.log(`✓ ${name}`); };
const near = (actual: number, expected: number, what: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} ≠ ${expected}`);

const A = "76561197960265729"; // [U:1:1]
const B = "76561197960265730"; // [U:1:2]
const C = "76561197960265731"; // [U:1:3]

test("toSteam64 converts SteamID3, keeps SteamID64 and rejects bots", () => {
  assert.equal(toSteam64("[U:1:1]"), A);
  assert.equal(toSteam64(A), A);
  assert.equal(toSteam64("BOT"), null);
  assert.equal(toSteam64("[U:1:x]"), null);
});

test("parseLogLine recognises round, kill, assist, plant and defuse lines", () => {
  const stamp = "L 10/07/2026 - 20:15:03: ";
  assert.deepEqual(parseLogLine(`${stamp}World triggered "Round_Start"`), { type: "round_start" });
  assert.deepEqual(parseLogLine(`${stamp}Team "TERRORIST" triggered "SFUI_Notice_Terrorists_Win" (CT "3") (T "5")`), { type: "round_end", winner: "T" });
  assert.deepEqual(
    parseLogLine(`${stamp}"Alice<2><[U:1:1]><CT>" [100 200 0] killed "Bob<3><[U:1:2]><TERRORIST>" [1 2 3] with "ak47" (headshot)`),
    {
      type: "kill",
      killer: { name: "Alice", steamId: A, side: "CT" },
      victim: { name: "Bob", steamId: B, side: "T" },
      weapon: "ak47",
      headshot: true,
    },
  );
  const assist = parseLogLine(`${stamp}"Carol<4><[U:1:3]><CT>" flash-assisted killing "Bob<3><[U:1:2]><TERRORIST>"`);
  assert.equal(assist?.type, "assist");
  assert.equal(assist?.type === "assist" && assist.flash, true);
  const plant = parseLogLine(`${stamp}"Bob<3><[U:1:2]><TERRORIST>" triggered "Planted_The_Bomb" at bombsite A`);
  assert.equal(plant?.type === "plant" && plant.actor.steamId, B);
  const bot = parseLogLine(`${stamp}"Bot Joe<5><BOT><CT>" triggered "Defused_The_Bomb"`);
  assert.equal(bot?.type === "defuse" && bot.actor.steamId, null);
  assert.equal(parseLogLine(`${stamp}"Alice<2><[U:1:1]><CT>" say "gg"`), null);
});

test("computeRoundSwing: a duel kill moves the whole remaining win chance and is zero-sum", () => {
  const roster = new Map<string, Side>([[A, "CT"], [B, "T"]]);
  const events: LogEvent[] = [
    { type: "kill", killer: { name: "A", steamId: A, side: "CT" }, victim: { name: "B", steamId: B, side: "T" }, weapon: "deagle", headshot: false },
    { type: "round_end", winner: "CT" },
  ];
  const swing = computeRoundSwing(events, roster, 1);
  const delta = 1 - winProbCT(1, 1, false);
  near(swing.get(A)!, delta, "killer");
  near(swing.get(B)!, -delta, "victim");
});

test("computeRoundSwing splits a kill 75/25 with a same-side assister", () => {
  const kill: LogEvent = { type: "kill", killer: { name: "A", steamId: A, side: "CT" }, victim: { name: "B", steamId: B, side: "T" }, weapon: "m4a1", headshot: true };
  const assist: LogEvent = { type: "assist", assister: { name: "C", steamId: C, side: "CT" }, victim: { name: "B", steamId: B, side: "T" }, flash: false };
  const swing = computeRoundSwing([kill, assist]);
  const loss = -swing.get(B)!;
  assert.ok(loss > 0);
  near(swing.get(A)!, loss * 0.75, "killer share");
  near(swing.get(C)!, loss * 0.25, "assister share");
});

const statRow = (over: Partial<MapStatRow>): MapStatRow => ({
  match_id: "m1", map_number: 1, steam_id: A, player_id: "p1", team_id: "t1", name: "Alice",
  kills: 0, deaths: 0, assists: 0, damage: 0, headshot_kills: 0, rounds_played: 0, kast: 0, first_kills: 0, first_deaths: 0,
  trade_kills: 0, clutch_wins: 0, multi_kills: {}, utility_damage: 0, enemies_flashed: 0, flash_assists: 0, bomb_plants: 0,
  bomb_defuses: 0, mvp: 0, ...over,
});

test("aggregatePlayers sums maps per player and derives K/D, ADR, KAST, HS% and Swing", () => {
  const [alice, bob] = aggregatePlayers([
    statRow({ map_number: 1, kills: 20, deaths: 10, damage: 2000, headshot_kills: 10, rounds_played: 20, kast: 15, multi_kills: { "2k": 2 }, swing_sum: 0.5, swing_rounds: 20 }),
    statRow({ map_number: 2, kills: 10, deaths: 10, damage: 1000, headshot_kills: 5, rounds_played: 10, kast: 6, multi_kills: { "3k": 1 }, swing_sum: 0.1, swing_rounds: 10 }),
    statRow({ steam_id: B, player_id: null, name: null, kills: 0, deaths: 0, rounds_played: 0 }),
  ]);
  assert.equal(alice.maps, 2); assert.equal(alice.matches, 1); assert.equal(alice.rounds, 30);
  assert.equal(alice.kills, 30); assert.equal(alice.k2, 2); assert.equal(alice.k3, 1);
  near(alice.kd, 1.5, "kd"); near(alice.adr, 100, "adr"); near(alice.kast, 70, "kast"); near(alice.hsPct, 50, "hs%");
  near(alice.swing!, 2, "swing p.p./round");
  assert.ok(alice.rating > 0);
  assert.equal(bob.name, B, "missing nickname falls back to SteamID");
  assert.equal(bob.maps, 0); assert.equal(bob.rating, 0); assert.equal(bob.swing, null);
});

test("aggregatePlayers ignores entry and clutch numbers from 1v1 duels", () => {
  const duel = { ...statRow({ first_kills: 9, clutch_wins: 9, rounds_played: 10, kills: 9 }), match: { tournament: { format: "1v1" } } } as MapStatRow;
  const [p] = aggregatePlayers([duel, statRow({ match_id: "m2", first_kills: 2, clutch_wins: 1, rounds_played: 10 })]);
  assert.equal(p.firstKills, 2); assert.equal(p.clutches, 1); assert.equal(p.matches, 2);
});

test("vetoPlan follows the BO1/BO3/BO5 order and alternates teams starting with team 1", () => {
  const shape = (bo: number, pool: number) => vetoPlan(bo, pool).map((s) => `${s.action}${s.team ?? ""}`).join(" ");
  assert.equal(shape(1, 7), "ban1 ban2 ban1 ban2 ban1 ban2 decider");
  assert.equal(shape(3, 7), "ban1 ban2 pick1 pick2 ban1 ban2 decider");
  assert.equal(shape(5, 7), "ban1 ban2 pick1 pick2 pick1 pick2 decider");
  assert.equal(shape(3, 4), "pick1 pick2 ban1 decider", "small pools skip the opening bans");
  assert.deepEqual(vetoPlan(1, 1).map((s) => s.action), ["decider"]);
});

test("vetoState and seriesMaps: picks in order, then the decider; completion only after the decider", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g"];
  const plan = vetoPlan(3, pool.length);
  const actions: VetoAction[] = plan.map((s, i) => ({ step: s.step, action: s.action, map_name: pool[i], team_id: s.team ? `team${s.team}` : null }));
  const midway = vetoState(3, pool, actions.slice(0, 3));
  assert.deepEqual(midway.remaining, ["d", "e", "f", "g"]);
  assert.equal(midway.current?.action, "pick"); assert.equal(midway.complete, false);
  assert.equal(vetoState(3, pool, actions.slice(0, -1)).current?.action, "decider");
  assert.equal(vetoState(3, pool, actions).complete, true);
  assert.deepEqual(seriesMaps([...actions].reverse()), [
    { map_name: "c", picked_by: "team1" },
    { map_name: "d", picked_by: "team2" },
    { map_name: "g", picked_by: null },
  ]);
});

test("Logo upload type is detected from content, not the declared type", () => {
  const b = (...xs: number[]) => new Uint8Array([...xs, ...Array(16).fill(0)]);
  assert.equal(sniffImage(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffImage(b(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImage(b(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("MZ\x90\x00 exe")), null);
  assert.equal(sniffImage(new Uint8Array()), null);
});

test("Check-in window: closed before opening and after closing, open inside or without dates", () => {
  const h = 3600_000;
  const now = Date.now();
  const at = (offset: number) => new Date(now + offset).toISOString();
  assert.equal(checkinWindowError({ checkin_opens_at: null, checkin_closes_at: null }, now), null);
  assert.notEqual(checkinWindowError({ checkin_opens_at: at(h), checkin_closes_at: null }, now), null);
  assert.notEqual(checkinWindowError({ checkin_opens_at: null, checkin_closes_at: at(-h) }, now), null);
  assert.equal(checkinWindowError({ checkin_opens_at: at(-h), checkin_closes_at: at(h) }, now), null);
});

console.log(`\n${checks} pure logic checks passed.`);
