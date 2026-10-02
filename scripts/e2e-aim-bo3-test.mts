// Одна карта в маппуле + BO3 (например aim_map): карта ставится в серию 3 раза, вето нет,
// MatchZy получает всю серию; на aim-картах freezetime 0, на обычных — стандарт.
// Тестовые данные удаляются, агенту ничего не отправляется.
// Запуск: NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e-aim-bo3-test.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}

const { db } = await import("../src/lib/supabase");
const { createBracket, getMatch } = await import("../src/lib/matches");
const { buildMatchzyConfig, handleMatchzyEvent, modeCvars } = await import("../src/lib/server-control");
import type { Tournament } from "../src/lib/types";

const SLUG = "e2e-aim-bo3";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

async function cleanup() {
  const { data: t } = await db().from("tournaments").select("id").eq("slug", SLUG).maybeSingle();
  if (t) {
    await db().from("matches").delete().eq("tournament_id", t.id);
    await db().from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db().from("teams").select("id").like("invite_code", "E2EAIM-%");
  for (const tm of teams ?? []) {
    await db().from("team_members").delete().eq("team_id", tm.id);
    await db().from("teams").delete().eq("id", tm.id);
  }
  await db().from("players").delete().like("steam_id", "765611990000088%");
}

await cleanup();
try {
  console.log("Турнир 1×1, маппул: aim_map, матчи BO3");
  const { data: ps } = await db()
    .from("players")
    .insert([0, 1, 2, 3].map((i) => ({ steam_id: `765611990000088${i}0`, nickname: `aim_${i}` })))
    .select("id");
  const { data: teams } = await db()
    .from("teams")
    .insert(ps!.map((p, i) => ({ name: `Aim ${i}`, tag: `AIM${i}`, captain_id: p.id, invite_code: `E2EAIM-${i}`, is_solo: true })))
    .select("id");
  const { data: t } = await db()
    .from("tournaments")
    .insert({
      slug: SLUG,
      name: "E2E aim BO3",
      status: "draft",
      format: "1v1",
      bracket_type: "single_elimination",
      default_best_of: 3,
      final_best_of: 3,
      map_pool: ["aim_map@3070549948"],
      knife_round: false,
    })
    .select("*")
    .single();
  await createBracket(t as Tournament, teams!.map((x) => x.id));

  const { data: ms } = await db().from("matches").select("id, number, status, best_of, team1_id, team2_id").eq("tournament_id", t!.id).order("number");
  const first = ms!.find((m) => m.team1_id && m.team2_id)!;
  const m = (await getMatch(first.id))!;
  check(m.best_of === 3, `матч BO${m.best_of} (нужно BO3, раньше сайт принудительно ставил BO1)`);
  check(m.status === "ready", `без вето — сразу готов к серверу (статус ${m.status})`);
  check(m.maps.length === 3 && m.maps.every((x) => x.map_name === "aim_map@3070549948"), `в серии ${m.maps.length} карты: ${m.maps.map((x) => x.map_name.split("@")[0]).join(" → ")}`);

  const cfg = (await buildMatchzyConfig(first.id))! as unknown as { num_maps: number; maplist: string[]; cvars: Record<string, number> };
  check(cfg.num_maps === 3, `MatchZy: num_maps=${cfg.num_maps}`);
  check(cfg.maplist.join() === "3070549948,3070549948,3070549948", `MatchZy: maplist ${cfg.maplist.join(", ")} (workshop ID, перезагрузка между играми)`);
  check(cfg.cvars.mp_freezetime === 0, `aim-карта: freezetime ${cfg.cvars.mp_freezetime}`);
  check(cfg.cvars.mp_maxrounds === 24, `1×1: до ${cfg.cvars.mp_maxrounds} раундов`);

  // серия: 2 победы — матч завершён, третья карта не играется
  await handleMatchzyEvent({ event: "map_result", matchid: m.matchzy_id, map_number: 0, winner: { team: "team1" }, team1: { score: 13 }, team2: { score: 7 } } as never);
  const mid = (await getMatch(first.id))!;
  check(mid.status !== "finished" && mid.team1_score === 1, `после первой игры 1:0, серия продолжается`);
  await handleMatchzyEvent({ event: "map_result", matchid: m.matchzy_id, map_number: 1, winner: { team: "team1" }, team1: { score: 13 }, team2: { score: 10 } } as never);
  const end = (await getMatch(first.id))!;
  check(end.status === "finished" && end.team1_score === 2, `после второй — 2:0, матч завершён`);
  check(end.maps.length === 2, `третья игра убрана (осталось ${end.maps.length})`);

  console.log("\nОбычные карты: freezetime не трогаем");
  const normal = modeCvars("1v1", ["de_mirage", "de_inferno", "de_nuke"]);
  check(normal.mp_freezetime === 15, `de_mirage/inferno/nuke в 1×1: freezetime 15 с (${JSON.stringify(normal)})`);
  const five = modeCvars("5v5", ["de_mirage"]);
  check(five.mp_freezetime === 15 && five.mp_maxrounds === 24, `5×5 на обычной карте: ${JSON.stringify(five)}`);
  const aim5 = modeCvars("5v5", ["aim_redline"]);
  check(aim5.mp_freezetime === 0, `aim-карта в любом режиме — без фризтайма`);
} finally {
  await cleanup();
  console.log("\nтестовые данные удалены");
}
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
