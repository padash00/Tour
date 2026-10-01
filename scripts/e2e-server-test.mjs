// Сквозная проверка: сайт → агент → MatchZy → сайт.
// Создаёт скрытый черновик-турнир с двумя тестовыми командами, отправляет матч на сервер,
// ждёт подтверждения загрузки и удаляет все тестовые данные.
// Запуск: node scripts/e2e-server-test.mjs [CS2-01]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const INSTANCE = process.argv[2] ?? "CS2-01";
const SLUG = "e2e-server-test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function cleanup() {
  const { data: t } = await db.from("tournaments").select("id").eq("slug", SLUG).maybeSingle();
  if (t) {
    await db.from("matches").update({ winner_to_match: null, loser_to_match: null }).eq("tournament_id", t.id);
    await db.from("matches").delete().eq("tournament_id", t.id);
    await db.from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db.from("teams").select("id").like("invite_code", "E2E-%");
  for (const team of teams ?? []) {
    await db.from("team_members").delete().eq("team_id", team.id);
    await db.from("teams").delete().eq("id", team.id);
  }
  await db.from("players").delete().like("steam_id", "765611990000000%");
}

await cleanup();
console.log("1. тестовые данные…");
const players = must(
  await db
    .from("players")
    .insert(Array.from({ length: 10 }, (_, i) => ({ steam_id: `7656119900000000${i}`, nickname: `e2e_player_${i}` })))
    .select("id, steam_id"),
  "players",
);
const [teamA, teamB] = must(
  await db
    .from("teams")
    .insert([
      { name: "E2E Alpha", tag: "E2EA", captain_id: players[0].id, invite_code: "E2E-A" },
      { name: "E2E Bravo", tag: "E2EB", captain_id: players[5].id, invite_code: "E2E-B" },
    ])
    .select("id"),
  "teams",
);
const t = must(
  await db
    .from("tournaments")
    .insert({ slug: SLUG, name: "E2E server test", status: "draft", map_pool: ["de_mirage", "de_inferno", "de_nuke"] })
    .select("id")
    .single(),
  "tournament",
);
const regs = must(
  await db
    .from("tournament_registrations")
    .insert([
      { tournament_id: t.id, team_id: teamA.id, status: "approved" },
      { tournament_id: t.id, team_id: teamB.id, status: "approved" },
    ])
    .select("id, team_id"),
  "registrations",
);
must(
  await db.from("tournament_roster_players").insert(
    players.map((p, i) => ({
      registration_id: regs[i < 5 ? 0 : 1].id,
      tournament_id: t.id,
      player_id: p.id,
      role: "main",
    })),
  ),
  "roster",
);
const match = must(
  await db
    .from("matches")
    .insert({
      tournament_id: t.id,
      number: 1,
      bracket: "upper",
      round: 1,
      position: 0,
      best_of: 1,
      status: "ready",
      team1_id: teamA.id,
      team2_id: teamB.id,
      server_instance: INSTANCE,
      server_state: "loading",
    })
    .select("id, matchzy_id")
    .single(),
  "match",
);
must(await db.from("match_maps").insert({ match_id: match.id, map_number: 1, map_name: "de_inferno" }), "map");

console.log(`2. команда load_match → ${INSTANCE} (matchzy_id ${match.matchzy_id})`);
must(await db.from("agent_commands").insert({ instance: INSTANCE, type: "load_match", payload: { match_id: match.id, matchzy_id: match.matchzy_id } }), "cmd");

let ok = false;
for (let i = 0; i < 30; i++) {
  await sleep(2000);
  const { data: m } = await db.from("matches").select("server_state, server_address").eq("id", match.id).single();
  const { data: inst } = await db.from("server_instances").select("gamestate, matchzy_match_id, map").eq("name", INSTANCE).single();
  const { data: cmd } = await db.from("agent_commands").select("status, result").eq("payload->>match_id", match.id).maybeSingle();
  process.stdout.write(`\r   команда: ${cmd?.status} · сервер: ${inst?.gamestate} (${inst?.map}) · матч: ${m?.server_state}      `);
  if (m?.server_state === "ready") {
    console.log(`\n3. ✓ матч загружен, игроки получают адрес ${m.server_address}`);
    ok = true;
    break;
  }
  if (m?.server_state === "error" || cmd?.status === "error") {
    console.log(`\n✕ ошибка: ${cmd?.result}`);
    break;
  }
}
if (!ok) {
  const { data: cmd } = await db.from("agent_commands").select("result").eq("payload->>match_id", match.id).maybeSingle();
  console.log(`\n✕ не дождались. Ответ сервера: ${cmd?.result}`);
}

if (ok) {
  console.log("3b. принудительный старт (css_start) — ждём событие от MatchZy…");
  await db.from("agent_commands").insert({ instance: INSTANCE, type: "rcon", payload: { command: "css_start" } });
  let got = null;
  for (let i = 0; i < 20 && !got; i++) {
    await sleep(2000);
    const { data } = await db.from("match_events").select("event").eq("matchzy_id", match.matchzy_id);
    if (data?.length) got = data.map((e) => e.event);
  }
  // с ножевым раундом MatchZy шлёт going_live только после ножа — тогда старт подтверждаем по ответу сервера
  let knife = false;
  if (!got) {
    const { data: r } = await db
      .from("agent_commands")
      .select("result")
      .eq("instance", INSTANCE)
      .eq("type", "rcon")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    knife = /knife\.cfg/i.test(r?.result ?? "");
  }
  if (got) console.log(`   ✓ события дошли до сайта: ${got.join(", ")}`);
  else if (knife) console.log("   ✓ матч стартовал с ножевого раунда (going_live придёт после ножа)");
  else {
    console.log("   ✕ событий от MatchZy нет");
    ok = false;
  }
  const { data: st } = await db.from("matches").select("status").eq("id", match.id).single();
  console.log(`   статус матча на сайте: ${st?.status}`);
}

console.log("4. снимаем матч с сервера и удаляем тестовые данные…");
await db.from("agent_commands").insert({ instance: INSTANCE, type: "end_match" });
await sleep(8000);
await db.from("agent_commands").delete().eq("payload->>match_id", match.id);
await db.from("match_events").delete().eq("matchzy_id", match.matchzy_id);
await cleanup();
console.log(ok ? "Готово: цепочка сайт → агент → MatchZy → сайт работает." : "Готово, но проверка не прошла.");
process.exit(ok ? 0 : 1);
