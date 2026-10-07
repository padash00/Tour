// ЖИВОЙ тест серии BO3 на настоящем сервере: сайт → агент → MatchZy → события на сайт.
//
// Автоматический режим (по умолчанию): загрузка BO3 (aim_map [Workshop] → de_dust2 → de_inferno),
// health check с выдачей адреса, get5_status с серией из 3 карт, cvars режима, принудительный старт →
// going_live на сайте, end_match освобождает сервер. Ботами карту не доиграть: MatchZy выкидывает всех,
// кого нет в составе матча (ботов тоже), а у Workshop-карт нет навигации для ботов.
//
// Режим с людьми (--players=STEAMID1,STEAMID2): два реальных игрока в составах, тест печатает адрес и
// следит за всей серией — смена карт на том же сервере, map_result / going_live каждой карты, series_end,
// Swing-лог на каждой карте. Играйте на сервере как обычно (.ready).
//
// Все тестовые данные удаляются, сервер возвращается в исходное состояние.
// Запуск: node scripts/e2e-series-live-test.mjs [CS2-01] [--players=7656...,7656...]
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "./lib/prod-guard.mjs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assertTestDatabase(env.SUPABASE_URL);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const INSTANCE = process.argv.find((a) => /^CS2-\d+$/.test(a)) ?? "CS2-01";
const HUMANS = (process.argv.find((a) => a.startsWith("--players=")) ?? "").slice(10).split(",").filter((x) => /^\d{17}$/.test(x));
const SLUG = "e2e-series-live";
const WS = "aim_map@3070549948";
const MAPS = [WS, "de_dust2", "de_inferno"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const ts = () => `${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}с`;
let failed = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

async function inst() {
  return (await db.from("server_instances").select("*").eq("name", INSTANCE).single()).data;
}
async function cmd(type, payload = {}) {
  const { data } = await db.from("agent_commands").insert({ instance: INSTANCE, type, payload }).select("id").single();
  for (let i = 0; i < 40; i++) {
    const { data: c } = await db.from("agent_commands").select("status, result").eq("id", data.id).single();
    if (c.status === "done" || c.status === "error") return c;
    await sleep(1500);
  }
  return { status: "timeout", result: "" };
}
async function events(matchId) {
  const { data } = await db.from("match_events").select("event, map_number").eq("match_id", matchId).neq("event", "round_end").order("id");
  return data ?? [];
}

async function cleanup() {
  const { data: t } = await db.from("tournaments").select("id").eq("slug", SLUG).maybeSingle();
  if (t) {
    const { data: ms } = await db.from("matches").select("id").eq("tournament_id", t.id);
    for (const m of ms ?? []) {
      for (const tbl of ["match_events", "match_log_state", "match_rounds", "player_map_swing", "player_map_stats"]) {
        await db.from(tbl).delete().eq("match_id", m.id);
      }
    }
    await db.from("tournament_roster_players").delete().eq("tournament_id", t.id);
    await db.from("tournament_registrations").delete().eq("tournament_id", t.id);
    await db.from("matches").delete().eq("tournament_id", t.id);
    await db.from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db.from("teams").select("id").like("invite_code", "E2EL-%");
  for (const tm of teams ?? []) await db.from("teams").delete().eq("id", tm.id);
  await db.from("players").delete().like("steam_id", "7656119900000077%");
}

await cleanup();
const wasRunning = (await inst())?.running;
try {
  console.log(`${ts()} 0. сервер ${INSTANCE}: ${wasRunning ? "уже запущен" : "запускаю"}`);
  if (!wasRunning) {
    await cmd("start");
    for (let i = 0; i < 40; i++) {
      const s = await inst();
      if (s.running && s.map) break;
      await sleep(3000);
    }
  }
  const s0 = await inst();
  check(s0.running && (s0.gamestate ?? "none") === "none", `сервер свободен (карта ${s0.map})`);

  // игроки: тестовые или реальные (режим с людьми — тогда их SteamID попадут в составы MatchZy)
  const ids = HUMANS.length === 2 ? HUMANS : ["76561199000000770", "76561199000000771"];
  const players = [];
  for (const [i, sid] of ids.entries()) {
    const { data: ex } = await db.from("players").select("id").eq("steam_id", sid).maybeSingle();
    players.push(ex ?? (await db.from("players").insert({ steam_id: sid, nickname: `live_${i}` }).select("id").single()).data);
  }
  const { data: teams } = await db
    .from("teams")
    .insert(players.map((p, i) => ({ name: `Live ${i ? "B" : "A"}`, tag: `LV${i}`, captain_id: p.id, invite_code: `E2EL-${i}`, is_solo: true })))
    .select("id");
  const { data: t } = await db
    .from("tournaments")
    .insert({ slug: SLUG, name: "E2E series live", status: "draft", format: "1v1", map_pool: MAPS, knife_round: false, overtime: false })
    .select("id")
    .single();
  // составы на турнир — по ним MatchZy пускает игроков
  for (const [i, tm] of teams.entries()) {
    const { data: reg } = await db
      .from("tournament_registrations")
      .insert({ tournament_id: t.id, team_id: tm.id, status: "approved", checked_in_at: new Date().toISOString() })
      .select("id")
      .single();
    await db.from("tournament_roster_players").insert({ registration_id: reg.id, tournament_id: t.id, player_id: players[i].id, role: "main" });
  }
  const { data: m } = await db
    .from("matches")
    .insert({
      tournament_id: t.id, number: 1, bracket: "upper", round: 1, position: 0, best_of: 3, status: "ready",
      team1_id: teams[0].id, team2_id: teams[1].id,
      server_instance: INSTANCE, server_state: "loading", server_assigned_at: new Date().toISOString(),
    })
    .select("id, matchzy_id")
    .single();
  await db.from("match_maps").insert(MAPS.map((map_name, i) => ({ match_id: m.id, map_number: i + 1, map_name })));

  console.log(`${ts()} 1. load_match BO3 (matchzy_id ${m.matchzy_id}): ${MAPS.join(" → ")}`);
  const lm = await cmd("load_match", { match_id: m.id, matchzy_id: m.matchzy_id });
  check(lm.status === "done", `агент выполнил load_match`);

  let ready = null;
  for (let i = 0; i < 60; i++) {
    const { data: x } = await db.from("matches").select("server_state, server_address").eq("id", m.id).single();
    if (x.server_state !== "loading") {
      ready = x;
      break;
    }
    await sleep(3000);
  }
  const s1 = await inst();
  check(ready?.server_state === "ready", `health check: карта совпала, адрес выдан ${ready?.server_address}`);
  check(s1.map === "aim_map_d" && s1.matchzy_match_id === m.matchzy_id, `карта 1 на сервере: ${s1.map} (Workshop), матч ${s1.matchzy_match_id}`);

  const st = await cmd("rcon", { command: "get5_status" });
  let g5 = null;
  try {
    g5 = JSON.parse(st.result.slice(st.result.indexOf("{")));
  } catch {}
  check(g5?.matchid == m.matchzy_id && (g5?.maps?.length ?? g5?.num_maps ?? 3) >= 3, `get5_status: серия загружена (matchid ${g5?.matchid}, gamestate ${g5?.gamestate})`);
  const cv = await cmd("rcon", { command: "mp_maxrounds;mp_freezetime;mp_round_restart_delay" });
  const val = (n) => Number(new RegExp(`${n} = ([\\d.]+)`).exec(cv.result)?.[1]);
  check(val("mp_maxrounds") === 24 && val("mp_freezetime") === 0, `режим 1×1 держится на Workshop-карте: maxrounds ${val("mp_maxrounds")}, freezetime ${val("mp_freezetime")}, restart_delay ${val("mp_round_restart_delay")}`);

  if (HUMANS.length === 2) {
    console.log(`\n${ts()} 2. РЕЖИМ С ЛЮДЬМИ: подключайтесь — connect ${ready?.server_address}; играйте серию (.ready). Слежу до 90 минут.`);
    let lastMap = s1.map;
    const shown = new Set();
    for (let i = 0; i < 1800; i++) {
      for (const e of await events(m.id)) {
        const k = `${e.event}:${e.map_number}`;
        if (!shown.has(k)) {
          shown.add(k);
          console.log(`${ts()}    событие ${e.event}${e.map_number != null ? ` (карта ${e.map_number + 1})` : ""}`);
        }
      }
      const s = await inst();
      if (s.map && s.map !== lastMap) {
        console.log(`${ts()}    сервер сменил карту: ${lastMap} → ${s.map}, игроков ${s.players} (тот же матч: ${s.matchzy_match_id === m.matchzy_id})`);
        lastMap = s.map;
      }
      const { data: mm } = await db.from("matches").select("status").eq("id", m.id).single();
      if (mm.status === "finished" && [...shown].some((k) => k.startsWith("series_end"))) break;
      await sleep(3000);
    }
    const { data: fin } = await db.from("matches").select("status, team1_score, team2_score").eq("id", m.id).single();
    const { data: mapsDb } = await db.from("match_maps").select("map_number, map_name, status, team1_score, team2_score").eq("match_id", m.id).order("map_number");
    for (const x of mapsDb ?? []) console.log(`     карта ${x.map_number} ${x.map_name}: ${x.status} ${x.team1_score}:${x.team2_score}`);
    check([...shown].includes("going_live:1"), "после карты 1 сервер сам запустил карту 2");
    check(fin.status === "finished", `серия завершена ${fin.team1_score}:${fin.team2_score}`);
    const { data: rbm } = await db.from("match_rounds").select("map_number").eq("match_id", m.id);
    check(new Set((rbm ?? []).map((r) => r.map_number)).size >= 2, "Swing-лог шёл на каждой сыгранной карте");
  } else {
    console.log(`${ts()} 2. принудительный старт (css_start) без игроков`);
    await cmd("rcon", { command: "css_start" });
    let live = false;
    for (let i = 0; i < 20 && !live; i++) {
      await sleep(3000);
      live = (await events(m.id)).some((e) => e.event === "going_live" && e.map_number === 0);
    }
    check(live, "going_live карты 1 дошёл до сайта (адрес событий выставлен после загрузки)");
    const { data: mm } = await db.from("matches").select("status").eq("id", m.id).single();
    check(mm.status === "live", `матч на сайте перешёл в live`);
    const { data: ls } = await db.from("match_log_state").select("live, map_number").eq("match_id", m.id).maybeSingle();
    check(ls?.live === true && ls?.map_number === 1, "Swing-лог карты 1 включён");
  }
} finally {
  console.log(`${ts()} 3. снимаем матч и чистим`);
  const em = await cmd("end_match");
  let s = await inst();
  // агент отчитывается раз в 5 с — ждём, пока сайт увидит освобождённый сервер
  for (let i = 0; i < 10 && (s.gamestate ?? "none") !== "none"; i++) {
    await sleep(3000);
    s = await inst();
  }
  console.log(`     end_match: ${em.status} — ${em.result.slice(0, 60)}`);
  check((s.gamestate ?? "none") === "none", `end_match освободил сервер (gamestate ${s.gamestate ?? "none"})`);
  if (!wasRunning) await cmd("stop");
  await cleanup();
  console.log(`${ts()}    тестовые данные удалены, ${INSTANCE} ${wasRunning ? "оставлен запущенным" : "остановлен"}`);
}
console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
