// Сквозная проверка серий BO3 / BO5 на живой базе через ту же логику, что и сайт:
//   вето (бан/пик/decider по правилам) → карты серии → конфиг для MatchZy (вся серия одним конфигом,
//   переходы между картами делает сам MatchZy, игроки не выходят с сервера) → события MatchZy по картам →
//   счёт серии, досрочное завершение (clinch), удаление несыгранных карт.
// Ни одной команды агенту/серверу не отправляется. Тестовые данные удаляются.
// Запуск: NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e-series-test.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}

const { db } = await import("../src/lib/supabase");
const { getMatch, insertVetoAction } = await import("../src/lib/matches");
const { vetoState } = await import("../src/lib/veto");
const { buildMatchzyConfig, handleMatchzyEvent } = await import("../src/lib/server-control");

const PREFIX = "e2e-series-";
const POOL = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"];
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

async function cleanup() {
  const { data: ts } = await db().from("tournaments").select("id").like("slug", `${PREFIX}%`);
  for (const t of ts ?? []) {
    const { data: ms } = await db().from("matches").select("id").eq("tournament_id", t.id);
    for (const m of ms ?? []) {
      await db().from("match_events").delete().eq("match_id", m.id);
      await db().from("match_log_state").delete().eq("match_id", m.id);
    }
    await db().from("matches").delete().eq("tournament_id", t.id);
    await db().from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db().from("teams").select("id").like("invite_code", "E2ES-%");
  for (const tm of teams ?? []) {
    await db().from("team_members").delete().eq("team_id", tm.id);
    await db().from("teams").delete().eq("id", tm.id);
  }
  await db().from("players").delete().like("steam_id", "765611990000009%");
}

let run = 0;
async function scenario(bestOf: number, winners: (1 | 2)[], label: string) {
  console.log(`\n${label}`);
  const k = ++run;
  const { data: ps } = await db()
    .from("players")
    .insert([0, 1].map((i) => ({ steam_id: `765611990000009${k}${i}`, nickname: `ser_${k}_${i}` })))
    .select("id");
  const { data: teams } = await db()
    .from("teams")
    .insert(ps!.map((p, i) => ({ name: `Series ${k} ${i ? "B" : "A"}`, tag: `S${k}${i}`, captain_id: p.id, invite_code: `E2ES-${k}${i}` })))
    .select("id");
  const [a, b] = teams!;
  const { data: t } = await db()
    .from("tournaments")
    .insert({ slug: `${PREFIX}bo${bestOf}-${winners.join("")}`, name: `E2E ${label}`, status: "draft", map_pool: POOL, knife_round: false })
    .select("id")
    .single();
  const { data: m0 } = await db()
    .from("matches")
    .insert({ tournament_id: t!.id, number: 1, bracket: "upper", round: 1, position: 0, best_of: bestOf, status: "veto", team1_id: a.id, team2_id: b.id })
    .select("id, matchzy_id")
    .single();

  // ── вето: каждая команда берёт первую оставшуюся карту
  let steps = 0;
  for (; steps < 20; steps++) {
    const m = (await getMatch(m0!.id))!;
    if (m.status !== "veto") break;
    const st = vetoState(m.best_of, m.tournament.map_pool, m.veto);
    if (!st.current) break;
    const teamId = st.current.team === 1 ? a.id : b.id;
    await insertVetoAction(m, st.remaining[0], teamId, null, false, new Date(Date.now() + 60_000));
  }
  const afterVeto = (await getMatch(m0!.id))!;
  const kinds = afterVeto.veto.sort((x, y) => x.step - y.step).map((v) => v.action[0]).join("");
  console.log(`  вето: ${kinds} (b — бан, p — пик, d — decider)`);
  check(afterVeto.status === "ready", "после вето матч готов к серверу");
  check(afterVeto.maps.length === bestOf, `карт в серии: ${afterVeto.maps.length} (нужно ${bestOf})`);
  check(afterVeto.veto.at(-1)?.action === "decider" && afterVeto.maps.at(-1)?.map_name === afterVeto.veto.at(-1)?.map_name, "decider — последняя карта серии");
  check(new Set(afterVeto.maps.map((x) => x.map_name)).size === bestOf, "карты серии не повторяются");

  // ── что уходит в MatchZy
  const cfg = (await buildMatchzyConfig(m0!.id))!;
  check(cfg.num_maps === bestOf, `MatchZy получает всю серию: num_maps=${cfg.num_maps}`);
  check(cfg.maplist.length === bestOf && cfg.maplist.join() === afterVeto.maps.map((x) => x.map_name).join(), `порядок карт для MatchZy: ${cfg.maplist.join(" → ")}`);
  check(cfg.map_sides.length === bestOf, `стороны на каждую карту: ${cfg.map_sides.join(", ")}`);
  check(cfg.skip_veto === true && cfg.clinch_series === true, "вето на сервере пропускается, серия заканчивается досрочно при победе");

  // ── серия: события MatchZy по картам (map_number с 0, как шлёт MatchZy)
  await db().from("matches").update({ status: "ready" }).eq("id", m0!.id);
  const need = Math.floor(bestOf / 2) + 1;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    await handleMatchzyEvent({ event: "going_live", matchid: m0!.matchzy_id, map_number: i } as never);
    await handleMatchzyEvent({
      event: "map_result",
      matchid: m0!.matchzy_id,
      map_number: i,
      winner: { team: w === 1 ? "team1" : "team2" },
      team1: { score: w === 1 ? 13 : 9 },
      team2: { score: w === 2 ? 13 : 9 },
    } as never);
    if (w === 1) s1++;
    else s2++;
    const cur = (await getMatch(m0!.id))!;
    const clinched = s1 >= need || s2 >= need;
    console.log(`  карта ${i + 1} (${cur.maps[i]?.map_name ?? "?"}): победа ${w === 1 ? "A" : "B"} → серия ${cur.team1_score}:${cur.team2_score}, матч ${cur.status}`);
    check(cur.team1_score === s1 && cur.team2_score === s2, `счёт серии ${s1}:${s2}`);
    if (!clinched) {
      check(cur.status === "live", "серия продолжается — матч не закрыт, сервер не снимается");
      check(cur.maps[i + 1]?.status === "pending", `следующая карта ждёт: ${cur.maps[i + 1]?.map_name}`);
    } else {
      check(cur.status === "finished", "серия решена — матч завершён");
      check(cur.winner_id === (s1 > s2 ? a.id : b.id), "победитель серии верный");
      check(cur.maps.length === winners.length, `несыгранные карты убраны (осталось ${cur.maps.length})`);
    }
  }
  await handleMatchzyEvent({
    event: "series_end",
    matchid: m0!.matchzy_id,
    winner: { team: s1 > s2 ? "team1" : "team2" },
    team1_series_score: s1,
    team2_series_score: s2,
  } as never);
  const end = (await getMatch(m0!.id))!;
  check(end.status === "finished" && end.team1_score === s1 && end.team2_score === s2, `series_end от MatchZy не ломает итог ${s1}:${s2}`);
}

await cleanup();
try {
  await scenario(3, [1, 2, 1], "BO3 — все три карты (2:1)");
  await scenario(3, [2, 2], "BO3 — досрочно (0:2), третья карта не играется");
  await scenario(5, [1, 2, 2, 1, 1], "BO5 — все пять карт (3:2)");
  await scenario(5, [1, 1, 1], "BO5 — досрочно (3:0)");
} finally {
  await cleanup();
  console.log("\nтестовые данные удалены");
}
console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
