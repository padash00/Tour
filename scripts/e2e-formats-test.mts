// Сквозная проверка форматов на живой базе: круговая 1×1, швейцарка + плей-офф, группы + плей-офф.
// Создаёт скрытые черновики, отыгрывает матчи через ту же логику, что и сайт, печатает таблицы.
// Запуск:  NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e-formats-test.mts [--keep] [--cleanup]
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "./lib/prod-guard.mjs";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean)) {
  const i = l.indexOf("=");
  process.env[l.slice(0, i)] ??= l.slice(i + 1);
}

assertTestDatabase(process.env.SUPABASE_URL);
const { db } = await import("../src/lib/supabase");
const { createBracket, getStandings, recomputeSeries } = await import("../src/lib/matches");
const { getSoloTeam } = await import("../src/lib/data");
type Tournament = import("../src/lib/types").Tournament;
type Player = import("../src/lib/types").Player;

const KEEP = process.argv.includes("--keep");
const PREFIX = "e2e-fmt-";
const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

async function cleanup() {
  const { data: ts } = await db().from("tournaments").select("id").like("slug", `${PREFIX}%`);
  for (const t of ts ?? []) {
    await db().from("matches").update({ winner_to_match: null, loser_to_match: null }).eq("tournament_id", t.id);
    await db().from("matches").delete().eq("tournament_id", t.id);
    await db().from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db().from("teams").select("id").or("invite_code.like.E2EF-%,invite_code.like.SOLO-765611990000002%");
  for (const t of teams ?? []) {
    await db().from("team_members").delete().eq("team_id", t.id);
    await db().from("teams").delete().eq("id", t.id);
  }
  await db().from("players").delete().like("steam_id", "765611990000002%");
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
  console.log("тестовые данные удалены");
  process.exit(0);
}
await cleanup();

async function makePlayers(n: number, offset: number): Promise<Player[]> {
  return must(
    await db()
      .from("players")
      .insert(Array.from({ length: n }, (_, i) => ({ steam_id: `765611990000002${String(offset + i).padStart(2, "0")}`, nickname: `fmt_${offset + i}` })))
      .select("*"),
    "players",
  ) as Player[];
}

async function makeTournament(slug: string, patch: Partial<Tournament>, teamIds: string[]) {
  const t = must(
    await db()
      .from("tournaments")
      .insert({ slug: PREFIX + slug, name: `E2E ${slug}`, status: "draft", ...patch })
      .select("*")
      .single(),
    "tournament",
  ) as Tournament;
  const regs = must(
    await db()
      .from("tournament_registrations")
      .insert(teamIds.map((team_id, i) => ({ tournament_id: t.id, team_id, status: "approved", seed: i + 1, checked_in_at: new Date().toISOString() })))
      .select("id, team_id"),
    "regs",
  ) as { id: string; team_id: string }[];
  // состав: капитан каждой команды в основе (для проверки форматов достаточно)
  const { data: teams } = await db().from("teams").select("id, captain_id").in("id", teamIds);
  await db()
    .from("tournament_roster_players")
    .insert(regs.map((r) => ({ registration_id: r.id, tournament_id: t.id, player_id: teams!.find((x) => x.id === r.team_id)!.captain_id, role: "main" })));
  return t;
}

/** Отыграть все готовые матчи: победитель — с меньшим seed с вероятностью 65% */
async function playAvailable(t: Tournament, seedOf: Map<string, number>) {
  const { data } = await db()
    .from("matches")
    .select("id, team1_id, team2_id, status")
    .eq("tournament_id", t.id)
    .in("status", ["upcoming", "ready", "live"]);
  for (const m of data ?? []) {
    const fav = (seedOf.get(m.team1_id) ?? 99) < (seedOf.get(m.team2_id) ?? 99) ? 1 : 2;
    const win1 = Math.random() < 0.65 ? fav === 1 : fav === 2;
    const { data: full } = await db().from("matches").select("best_of").eq("id", m.id).single();
    const need = Math.floor((full?.best_of ?? 1) / 2) + 1;
    await db().from("matches").update({ status: "live" }).eq("id", m.id);
    // карты до победы в серии (фаворит берёт серию, но может отдать карту)
    let w1 = 0;
    let w2 = 0;
    for (let n = 1; w1 < need && w2 < need; n++) {
      const mapWin1 = w1 === need - 1 && w2 === need - 1 ? win1 : Math.random() < 0.75 ? win1 : !win1;
      const { data: ex } = await db().from("match_maps").select("id").eq("match_id", m.id).eq("map_number", n);
      if (!ex?.length) await db().from("match_maps").insert({ match_id: m.id, map_number: n, map_name: t.map_pool[(n - 1) % t.map_pool.length] });
      const loser = 4 + Math.floor(Math.random() * 9);
      await db()
        .from("match_maps")
        .update({ status: "finished", team1_score: mapWin1 ? 13 : loser, team2_score: mapWin1 ? loser : 13, winner_id: mapWin1 ? m.team1_id : m.team2_id })
        .eq("match_id", m.id)
        .eq("map_number", n);
      if (mapWin1) w1++;
      else w2++;
    }
    await recomputeSeries(m.id);
  }
  return data?.length ?? 0;
}

async function playToEnd(t: Tournament, seeded: string[]) {
  const seedOf = new Map(seeded.map((id, i) => [id, i + 1]));
  let waves = 0;
  while ((await playAvailable(t, seedOf)) > 0 && waves < 30) waves++;
  return waves;
}

async function names() {
  const { data } = await db().from("teams").select("id, name").or("invite_code.like.E2EF-%,invite_code.like.SOLO-765611990000002%");
  return new Map((data ?? []).map((x) => [x.id, x.name]));
}

async function printStandings(t: Tournament) {
  const nm = await names();
  for (const g of await getStandings(t)) {
    console.log(`  ${g.label ? `Группа ${g.label}` : "Таблица"}:`);
    for (const [i, r] of g.table.entries()) {
      console.log(`    ${i + 1}. ${nm.get(r.teamId)}  ${r.wins}–${r.losses}  карты ${r.mapWins}:${r.mapLosses}  раунды ${r.roundsFor - r.roundsAgainst >= 0 ? "+" : ""}${r.roundsFor - r.roundsAgainst}${r.status !== "active" ? `  ${r.status}` : ""}`);
    }
  }
}

async function summary(t: Tournament) {
  const { data } = await db().from("matches").select("stage, status, bracket, round, winner_id, winner_to_match").eq("tournament_id", t.id);
  const by = (s: string) => (data ?? []).filter((m) => m.stage === s);
  const nm = await names();
  const final = (data ?? []).filter((m) => m.stage === "playoff" && !m.winner_to_match && m.status === "finished");
  return {
    group: by("group").length,
    swiss: by("swiss").length,
    swissRounds: new Set(by("swiss").map((m) => m.round)).size,
    playoff: by("playoff").length,
    unfinished: (data ?? []).filter((m) => !["finished", "cancelled"].includes(m.status)).length,
    champion: final.length ? nm.get(final[final.length - 1].winner_id) : null,
  };
}

// ───────────── 1. Круговая 1×1, 4 игрока, одна workshop-карта
{
  const ps = await makePlayers(4, 0);
  const solos = [];
  for (const p of ps) solos.push((await getSoloTeam(p, true))!);
  const t = await makeTournament("rr-duel", { format: "1v1", bracket_type: "round_robin", max_teams: 4, map_pool: ["aim_map@3084291314"], knife_round: false }, solos.map((s) => s.id));
  await createBracket(t, solos.map((s) => s.id));
  const { data: ms } = await db().from("matches").select("status, round").eq("tournament_id", t.id);
  console.log(`\n1) Круговая 1×1: матчей ${ms?.length}, туров ${new Set(ms?.map((m) => m.round)).size}, готовы без вето: ${ms?.filter((m) => m.status === "ready").length}`);
  await playToEnd(t, solos.map((s) => s.id));
  console.log("  ", await summary(t));
  await printStandings(t);
}

// ───────────── 2. Швейцарка + плей-офф, 8 команд, 2 победы
{
  const ps = await makePlayers(8, 10);
  const teams = must(
    await db()
      .from("teams")
      .insert(ps.map((p, i) => ({ name: `SW Team ${i + 1}`, tag: `SW${i + 1}`, captain_id: p.id, invite_code: `E2EF-SW${i}` })))
      .select("id"),
    "teams",
  ) as { id: string }[];
  const ids = teams.map((x) => x.id);
  const t = await makeTournament("swiss", { bracket_type: "swiss_playoff", max_teams: 8, swiss_wins: 2, playoff_type: "single_elimination", map_pool: ["de_mirage"] }, ids);
  await createBracket(t, ids);
  await playToEnd(t, ids);
  console.log("\n2) Швейцарка (2–2) + Single плей-офф, 8 команд:", await summary(t));
  await printStandings(t);
}

// ───────────── 3. Группы + плей-офф, 8 команд, 2 группы, выходят 2
{
  const ps = await makePlayers(8, 30);
  const teams = must(
    await db()
      .from("teams")
      .insert(ps.map((p, i) => ({ name: `GR Team ${i + 1}`, tag: `GR${i + 1}`, captain_id: p.id, invite_code: `E2EF-GR${i}` })))
      .select("id"),
    "teams",
  ) as { id: string }[];
  const ids = teams.map((x) => x.id);
  const t = await makeTournament("groups", { bracket_type: "groups_playoff", max_teams: 8, groups_count: 2, advance_per_group: 2, playoff_type: "double_elimination", map_pool: ["de_mirage"] }, ids);
  await createBracket(t, ids);
  await playToEnd(t, ids);
  console.log("\n3) Группы 2×4 → Double плей-офф (4):", await summary(t));
  await printStandings(t);
}

// ───────────── 4–6. Нечётные и «неровные» количества: баи швейцарки и сетки
for (const [label, n, offset, patch] of [
  ["swiss7", 7, 50, { bracket_type: "swiss_playoff", swiss_wins: 3, playoff_type: "double_elimination" }],
  ["se6", 6, 60, { bracket_type: "single_elimination" }],
  ["de5", 5, 70, { bracket_type: "double_elimination" }],
] as const) {
  const ps = await makePlayers(n, offset);
  const teams = must(
    await db()
      .from("teams")
      .insert(ps.map((p, i) => ({ name: `${label} Team ${i + 1}`, tag: `X${offset / 10}${i}`, captain_id: p.id, invite_code: `E2EF-${label}${i}` })))
      .select("id"),
    "teams",
  ) as { id: string }[];
  const ids = teams.map((x) => x.id);
  const t = await makeTournament(label, { max_teams: n, map_pool: ["de_mirage"], ...patch }, ids);
  await createBracket(t, ids);
  await playToEnd(t, ids);
  const s = await summary(t);
  console.log(`\n${label}: ${n} команд, ${patch.bracket_type}:`, s);
  if ((s as { unfinished?: number }).unfinished || !(s as { champion?: string }).champion) {
    console.log(`  ✕ ${label}: турнир не доигран`);
    process.exitCode = 1;
  }
}

if (!KEEP) {
  await cleanup();
  console.log("\nтестовые данные удалены");
} else console.log(`\nданные оставлены: /tournaments/${PREFIX}rr-duel, ${PREFIX}swiss, ${PREFIX}groups (видны только админу)`);
