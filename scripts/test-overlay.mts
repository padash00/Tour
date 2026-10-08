// Оверлей трансляции: выбор матча, сборка публичного ответа, разбор параметров. Без базы.
import assert from "node:assert/strict";
import { mockOverlay, overlayStage, parseOverlayQuery, pickOverlayMatch, shapeOverlay, type MatchCandidate, type OverlaySource } from "../src/lib/overlay";

let checks = 0;
const test = (name: string, work: () => void) => { work(); checks++; console.log(`✓ ${name}`); };

const now = new Date("2026-10-12T12:00:00Z");
const row = (o: Partial<MatchCandidate> & { id: string; status: string }): MatchCandidate =>
  ({ number: 1, team1_id: "a", team2_id: "b", scheduled_at: null, ...o });

test("pickOverlayMatch prefers the lowest-numbered live match", () => {
  const rows = [row({ id: "r", status: "ready", number: 1 }), row({ id: "l2", status: "live", number: 5 }), row({ id: "l1", status: "live", number: 3 })];
  assert.equal(pickOverlayMatch(rows)?.id, "l1");
});

test("pickOverlayMatch falls back to ready, then veto, then the earliest scheduled; skips TBD", () => {
  assert.equal(pickOverlayMatch([row({ id: "v", status: "veto" }), row({ id: "r", status: "ready", number: 9 })])?.id, "r");
  assert.equal(pickOverlayMatch([row({ id: "u", status: "upcoming" }), row({ id: "v", status: "veto" })])?.id, "v");
  assert.equal(
    pickOverlayMatch([
      row({ id: "late", status: "upcoming", scheduled_at: "2026-10-12T15:00:00Z" }),
      row({ id: "early", status: "upcoming", scheduled_at: "2026-10-12T13:00:00Z" }),
      row({ id: "tbd", status: "ready", team2_id: null }),
    ])?.id,
    "early",
  );
  assert.equal(pickOverlayMatch([row({ id: "f", status: "finished" }), row({ id: "c", status: "cancelled" })]), null);
});

test("overlayStage names playoff rounds like the site and drops the grand-final handicap note", () => {
  const se = [{ bracket: "upper", round: 1 }, { bracket: "upper", round: 2 }, { bracket: "upper", round: 3 }];
  assert.equal(overlayStage({ bracket: "upper", round: 2 }, se), "Полуфинал");
  assert.equal(overlayStage({ bracket: "upper", round: 3 }, se), "Финал");
  assert.equal(overlayStage({ bracket: "third_place", round: 3 }, se), "Матч за 3-е место");
  assert.equal(overlayStage({ bracket: "grand_final", round: 1 }, se), "Гранд-финал");
  assert.equal(overlayStage({ bracket: "upper", round: 3 }, [...se, { bracket: "lower", round: 4 }]), "Финал верхней сетки");
  assert.equal(overlayStage({ bracket: "group", round: 2, group_label: "A" }, []), "Группа A · тур 2");
});

const source = (over: Partial<OverlaySource["match"]> = {}, maps: OverlaySource["maps"] = []): OverlaySource => ({
  match: {
    id: "m1", status: "live", bracket: "upper", round: 2, group_label: null, best_of: 3,
    team1_id: "a", team2_id: "b", team1_score: 1, team2_score: 0, scheduled_at: null, ...over,
  },
  tournament: { name: "Open Cup" },
  teams: [
    { id: "a", name: "Alpha", tag: "ALP", logo_url: "https://x.supabase.co/storage/v1/object/public/logos/a.png" },
    { id: "b", name: "Bravo", tag: "BRV", logo_url: "javascript:alert(1)" },
  ],
  maps,
  rounds: [{ bracket: "upper", round: 1 }, { bracket: "upper", round: 2 }, { bracket: "upper", round: 3 }],
});

const bo3Maps: OverlaySource["maps"] = [
  { map_number: 2, map_name: "de_mirage", status: "live", team1_score: 7, team2_score: 9, winner_id: null, picked_by: "b" },
  { map_number: 1, map_name: "de_ancient", status: "finished", team1_score: 13, team2_score: 9, winner_id: "a", picked_by: "a" },
  { map_number: 3, map_name: "de_nuke", status: "pending", team1_score: 0, team2_score: 0, winner_id: null, picked_by: null },
];

test("shapeOverlay builds a live BO3: series score, ordered maps, picks, decider, current map", () => {
  const p = shapeOverlay(source({}, bo3Maps), now);
  assert.equal(p.state, "live");
  assert.equal(p.updated_at, now.toISOString());
  const m = p.match!;
  assert.equal(m.tournament, "Open Cup");
  assert.equal(m.stage, "Полуфинал");
  assert.deepEqual([m.series1, m.series2, m.bestOf], [1, 0, 3]);
  assert.deepEqual(m.maps.map((x) => [x.number, x.name, x.status, x.winner, x.pick]), [
    [1, "Ancient", "finished", 1, 1],
    [2, "Mirage", "live", null, 2],
    [3, "Nuke", "pending", null, null],
  ]);
  assert.deepEqual([m.current?.name, m.current?.score1, m.current?.score2], ["Mirage", 7, 9]);
  assert.equal(m.next, null);
});

test("shapeOverlay between maps: no current map, next is the first pending one", () => {
  const maps = bo3Maps.map((x) => (x.map_number === 2 ? { ...x, status: "finished", team1_score: 11, team2_score: 13, winner_id: "b" } : x));
  const m = shapeOverlay(source({ team2_score: 1 }, maps), now).match!;
  assert.equal(m.current, null);
  assert.equal(m.next?.name, "Nuke");
  assert.equal(m.maps[1].winner, 2);
});

test("shapeOverlay exposes only public fields and drops unsafe logo URLs", () => {
  const p = shapeOverlay(source({}, bo3Maps), now);
  assert.equal(p.match!.team1.logo, "https://x.supabase.co/storage/v1/object/public/logos/a.png");
  assert.equal(p.match!.team2.logo, null);
  assert.deepEqual(Object.keys(p.match!.team1).sort(), ["logo", "name", "tag"]);
  const json = JSON.stringify(p);
  for (const secret of ["server_address", "server_password", "password", "steam", "captain"]) assert.ok(!json.includes(secret), secret);
});

test("shapeOverlay: ready match is upcoming, finished or missing is none, missing team is TBD", () => {
  const up = shapeOverlay(source({ status: "ready", team1_score: 0, team2_id: null, scheduled_at: "2026-10-12T13:00:00Z" }), now);
  assert.equal(up.state, "upcoming");
  assert.equal(up.match!.status, "ready");
  assert.equal(up.match!.team2.name, "TBD");
  assert.equal(up.match!.current, null);
  assert.equal(shapeOverlay(source({ status: "finished" }), now).state, "none");
  assert.deepEqual(shapeOverlay(null, now), { state: "none", match: null, updated_at: now.toISOString() });
});

test("parseOverlayQuery accepts server, match uuid or tournament slug and rejects junk", () => {
  const q = (s: string) => parseOverlayQuery(new URLSearchParams(s));
  assert.deepEqual(q("server=cs2-03"), { server: "CS2-03" });
  assert.deepEqual(q("match=11111111-2222-3333-4444-555555555555"), { match: "11111111-2222-3333-4444-555555555555" });
  assert.deepEqual(q("tournament=f16-open-cup-1"), { tournament: "f16-open-cup-1" });
  assert.equal(q("server=localhost"), null);
  assert.equal(q("match=1 or 1=1"), null);
  assert.equal(q("tournament=../../etc"), null);
  assert.equal(q(""), null);
});

test("mockOverlay fixtures cover live BO3, BO1, upcoming and empty", () => {
  assert.equal(mockOverlay("1", now).match?.current?.name, "Mirage");
  assert.equal(mockOverlay("bo1", now).match?.bestOf, 1);
  assert.equal(mockOverlay("idle", now).state, "upcoming");
  assert.equal(mockOverlay("none", now).state, "none");
});

console.log(`overlay: ${checks} checks passed`);
