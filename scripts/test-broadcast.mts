// Экран перерыва трансляции: параметры, выбор турнира, подписи раундов, сборка ответа, смена сцен. Без базы.
import assert from "node:assert/strict";
import {
  availableScenes,
  bcRoundLabel,
  mockBroadcast,
  nextScene,
  parseBroadcastParams,
  pickBroadcastTournament,
  shapeBroadcast,
  stageLabel,
  type BroadcastSource,
} from "../src/lib/broadcast";

let checks = 0;
const test = (name: string, work: () => void) => { work(); checks++; console.log(`✓ ${name}`); };
const now = new Date("2026-10-12T12:00:00Z");

test("parseBroadcastParams: defaults, clamping and junk", () => {
  assert.deepEqual(parseBroadcastParams(new URLSearchParams("")), { tournament: null, scene: "auto", interval: 15, lower: false, footer: null });
  const p = parseBroadcastParams(new URLSearchParams("tournament=Open-Cup&scene=STATS&interval=2&lower=1&footer=%20Kaspi%20%20Bank%20"));
  assert.deepEqual(p, { tournament: "open-cup", scene: "stats", interval: 5, lower: true, footer: "Kaspi Bank" });
  assert.equal(parseBroadcastParams(new URLSearchParams("interval=9999")).interval, 300);
  assert.equal(parseBroadcastParams(new URLSearchParams("interval=abc")).interval, 15);
  assert.equal(parseBroadcastParams(new URLSearchParams("tournament=../etc&scene=evil")).tournament, null);
  assert.equal(parseBroadcastParams(new URLSearchParams("scene=evil")).scene, "auto");
  assert.equal(parseBroadcastParams(new URLSearchParams(`footer=${"x".repeat(200)}`)).footer?.length, 80);
});

test("pickBroadcastTournament: live → checkin → registration, then latest finished; drafts never", () => {
  const t = (slug: string, status: string, starts_at: string | null = null) => ({ slug, status, starts_at });
  assert.equal(pickBroadcastTournament([t("reg", "registration"), t("chk", "checkin"), t("live", "live")])?.slug, "live");
  assert.equal(pickBroadcastTournament([t("reg", "registration"), t("chk", "checkin")])?.slug, "chk");
  assert.equal(pickBroadcastTournament([t("late", "registration", "2026-12-01T00:00:00Z"), t("soon", "registration", "2026-10-20T00:00:00Z")])?.slug, "soon");
  assert.equal(pickBroadcastTournament([t("old", "finished", "2026-01-01T00:00:00Z"), t("new", "finished", "2026-09-01T00:00:00Z"), t("d", "draft")])?.slug, "new");
  assert.equal(pickBroadcastTournament([t("d", "draft"), t("c", "cancelled")]), null);
});

test("bcRoundLabel: SE counts back from the final, DE keeps the site's names", () => {
  assert.equal(bcRoundLabel("upper", 1, 4, 0), "1/8 финала");
  assert.equal(bcRoundLabel("upper", 2, 4, 0), "1/4 финала");
  assert.equal(bcRoundLabel("upper", 3, 4, 0), "Полуфинал");
  assert.equal(bcRoundLabel("upper", 4, 4, 0), "Финал");
  assert.equal(bcRoundLabel("third_place", 4, 4, 0), "Матч за 3-е место");
  assert.equal(bcRoundLabel("grand_final", 1, 3, 4), "Гранд-финал");
  assert.equal(bcRoundLabel("upper", 3, 3, 4), "Финал верхней сетки");
  assert.equal(bcRoundLabel("lower", 4, 3, 4), "Финал нижней сетки");
  assert.equal(bcRoundLabel("group", 2, 0, 0, "B"), "Группа B · тур 2");
});

// небольшой турнир: 4 команды SE + матч за 3-е место
const teams = ["a", "b", "c", "d"].map((id) => ({ id, name: `Team ${id.toUpperCase()}`, tag: id.toUpperCase(), logo_url: id === "a" ? "https://x.supabase.co/a.png" : id === "b" ? "javascript:alert(1)" : null }));
const base = { stage: "playoff", group_label: null, is_walkover: false, scheduled_at: null, finished_at: null, server_state: null, best_of: 1, team1_score: 0, team2_score: 0, winner_id: null };
const src = (matches: Partial<BroadcastSource["matches"][number]>[], extra: Partial<BroadcastSource> = {}): BroadcastSource => ({
  tournament: { id: "t", slug: "cup", name: "Cup", status: "live", sponsors: [{ name: "Kaspi" }] },
  matches: matches.map((m, i) => ({ ...base, id: `m${i + 1}`, number: i + 1, status: "pending", bracket: "upper", round: 1, position: 0, team1_id: null, team2_id: null, ...m })),
  teams,
  maps: [],
  groups: [],
  leaders: [],
  mvp: null,
  ...extra,
});

test("shapeBroadcast: bracket columns, third place, winners, safe logos", () => {
  const p = shapeBroadcast(
    src([
      { round: 1, position: 1, team1_id: "c", team2_id: "d", status: "live", best_of: 3, team1_score: 1, server_state: "ready" },
      { round: 1, position: 0, team1_id: "a", team2_id: "b", status: "finished", team1_score: 1, winner_id: "a", finished_at: "2026-10-12T11:00:00Z" },
      { round: 2, position: 0, team1_id: "a" },
      { bracket: "third_place", round: 2, position: 0, team1_id: "b" },
    ], { maps: [
      { match_id: "m1", map_number: 2, map_name: "de_mirage", status: "live", team1_score: 7, team2_score: 5, winner_id: null },
      { match_id: "m1", map_number: 1, map_name: "de_ancient", status: "finished", team1_score: 13, team2_score: 9, winner_id: "c" },
      { match_id: "m2", map_number: 1, map_name: "de_nuke", status: "finished", team1_score: 13, team2_score: 2, winner_id: "a" },
    ] }),
    now,
  );
  assert.equal(p.bracket.kind, "se");
  assert.deepEqual(p.bracket.upper.map((c) => c.map((m) => m.id)), [["m2", "m1"], ["m3"]]);
  assert.equal(p.bracket.third?.stage, "Матч за 3-е место");
  assert.equal(p.bracket.upper[0][0].winner, 1);
  assert.equal(p.bracket.upper[0][0].stage, "Полуфинал");
  assert.equal(p.bracket.upper[0][0].team1?.logo, "https://x.supabase.co/a.png");
  assert.equal(p.bracket.upper[0][0].team2?.logo, null, "non-https logo must be dropped");
  // карты — только у идущего матча, по порядку, текущая — live
  const live = p.live[0];
  assert.equal(live.id, "m1");
  assert.deepEqual(live.maps.map((m) => m.name), ["Ancient", "Mirage"]);
  assert.equal(live.current?.score1, 7);
  assert.equal(live.maps[0].winner, 1);
  assert.equal(live.server, "ready");
  assert.equal(p.bracket.upper[0][0].maps.length, 0);
  assert.deepEqual(p.tournament?.sponsors, ["Kaspi"]);
  assert.equal(p.tournament?.stage, "Плей-офф · Полуфинал");
});

test("shapeBroadcast: schedule buckets — now / next (ready before veto) / soon, results of the current round", () => {
  const p = shapeBroadcast(
    src([
      { round: 1, position: 0, team1_id: "a", team2_id: "b", status: "finished", team1_score: 1, winner_id: "a" },
      { round: 1, position: 1, team1_id: "c", team2_id: "d", status: "live" },
      { round: 2, position: 0, team1_id: "a", team2_id: "b", status: "veto" },
      { round: 2, position: 1, team1_id: "c", team2_id: "d", status: "ready" },
      { round: 3, position: 0, team1_id: "a", team2_id: "c", status: "upcoming", scheduled_at: "2026-10-12T15:00:00Z" },
      { round: 3, position: 1, team1_id: "b", team2_id: "d", status: "upcoming", scheduled_at: "2026-10-12T14:00:00Z" },
      { round: 3, position: 2, team1_id: "b", team2_id: null, status: "upcoming" },
      { round: 1, position: 2, team1_id: "d", team2_id: null, status: "finished", is_walkover: true, winner_id: "d" },
    ]),
    now,
  );
  assert.deepEqual(p.schedule.now.map((m) => m.id), ["m2"]);
  assert.deepEqual(p.schedule.next.map((m) => m.id), ["m4", "m3"]);
  assert.deepEqual(p.schedule.soon.map((m) => m.id), ["m6", "m5"], "TBD matches are not listed, earliest first");
  assert.deepEqual(p.schedule.results.map((m) => m.id), ["m1"], "byes are not results");
});

test("shapeBroadcast: with no active round, results are the latest finished matches", () => {
  const p = shapeBroadcast(
    src([
      { round: 1, position: 0, team1_id: "a", team2_id: "b", status: "finished", winner_id: "a", finished_at: "2026-10-12T10:00:00Z" },
      { round: 2, position: 0, team1_id: "a", team2_id: "c", status: "finished", winner_id: "c", finished_at: "2026-10-12T11:00:00Z" },
    ], { tournament: { id: "t", slug: "cup", name: "Cup", status: "finished" } }),
    now,
  );
  assert.deepEqual(p.schedule.results.map((m) => m.id), ["m1", "m2"]);
  assert.equal(p.tournament?.stage, "Турнир завершён");
});

test("shapeBroadcast: leaders need 2+ maps; mvp hidden without leaders; groups map to teams", () => {
  const L = (name: string, maps: number) => ({ name, avatar: null, team: null, rating: 1, kd: 1, adr: 80, maps, swing: null });
  const p = shapeBroadcast(
    src([{ bracket: "group", stage: "group", group_label: "A", team1_id: "a", team2_id: "b", status: "live" }], {
      leaders: [L("one-map-wonder", 1), L("steady", 3)],
      mvp: { ...L("steady", 3), by: "rating" },
      groups: [{ label: "A", table: [
        { teamId: "a", wins: 2, losses: 0, mapWins: 4, mapLosses: 1, roundsFor: 60, roundsAgainst: 40, status: "advanced" },
        { teamId: "ghost", wins: 0, losses: 0, mapWins: 0, mapLosses: 0, roundsFor: 0, roundsAgainst: 0, status: "active" },
      ] }],
    }),
    now,
  );
  assert.deepEqual(p.leaders.map((x) => x.name), ["steady"]);
  assert.equal(p.mvp?.name, "steady");
  assert.equal(p.bracket.kind, "none");
  assert.deepEqual(p.groups[0].rows.map((r) => [r.team.id, r.mapDiff, r.roundDiff]), [["a", 3, 20]]);
  assert.equal(p.tournament?.stage, "Групповой этап · тур 1");
  assert.equal(shapeBroadcast(src([], { leaders: [], mvp: { ...L("x", 3), by: "rating" } }), now).mvp, null);
  // в начале турнира все сыграли по одной карте — показываем их
  assert.equal(shapeBroadcast(src([], { leaders: [L("a", 1), L("b", 1)] }), now).leaders.length, 2);
});

test("availableScenes / nextScene: skip empty scenes, rotate in order, recover when a scene empties", () => {
  const p = mockBroadcast(now);
  assert.deepEqual(availableScenes(p), ["bracket", "schedule", "live", "stats"]);
  const quiet = { ...p, live: [], leaders: [] };
  assert.deepEqual(availableScenes(quiet), ["bracket", "schedule"]);
  assert.deepEqual(availableScenes(shapeBroadcast(null, now)), []);
  assert.equal(nextScene(["bracket", "schedule", "live"], "schedule"), "live");
  assert.equal(nextScene(["bracket", "schedule", "live"], "live"), "bracket");
  assert.equal(nextScene(["bracket", "stats"], "live"), "stats", "after an emptied scene — the next one in order");
  assert.equal(nextScene(["bracket", "schedule"], "stats"), "bracket");
  assert.equal(nextScene([], "live"), null);
  assert.equal(nextScene(["schedule"], null), "schedule");
});

test("mockBroadcast: 16-team SE with a third-place match and two live quarter-finals", () => {
  const p = mockBroadcast(now);
  assert.deepEqual(p.bracket.upper.map((c) => c.length), [8, 4, 2, 1]);
  assert.ok(p.bracket.third);
  assert.equal(p.live.length, 2);
  assert.ok(p.live.every((m) => m.current));
  assert.equal(p.tournament?.stage, "Плей-офф · 1/4 финала");
  assert.equal(p.schedule.results.length, 6, "quarter-finals not finished yet — latest round-of-16 results");
  assert.ok(JSON.stringify(p).indexOf("server_password") < 0);
  assert.equal(stageLabel("checkin", []), "Идёт check-in");
});

console.log(`\n${checks} broadcast checks passed`);
