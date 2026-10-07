// Вето по таймауту на живой базе: капитаны не нажимают ничего, дедлайн давно прошёл —
// applyVetoTimeouts сам выбирает карты (авто), вето завершается, создаются карты серии, матч готов к серверу.
// Проверяется BO1 и BO3. Серверу ничего не отправляется. Тестовые данные удаляются.
// Запуск: NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e-veto-timeout-test.mts
import { readFileSync } from "node:fs";
import { assertTestDatabase } from "./lib/prod-guard.mjs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}
assertTestDatabase(process.env.SUPABASE_URL);
const { db } = await import("../src/lib/supabase");
const { applyVetoTimeouts, getMatch } = await import("../src/lib/matches");

const PREFIX = "e2e-vto-";
const POOL = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"];
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

async function cleanup() {
  const { data: ts } = await db().from("tournaments").select("id").like("slug", `${PREFIX}%`);
  for (const t of ts ?? []) {
    await db().from("matches").delete().eq("tournament_id", t.id);
    await db().from("tournaments").delete().eq("id", t.id);
  }
  const { data: teams } = await db().from("teams").select("id").like("invite_code", "E2EV-%");
  for (const tm of teams ?? []) await db().from("teams").delete().eq("id", tm.id);
  await db().from("players").delete().like("steam_id", "7656119900000098%");
}

await cleanup();
try {
  for (const bo of [1, 3]) {
    console.log(`BO${bo}, никто не голосует, дедлайн прошёл 30 минут назад:`);
    const { data: ps } = await db()
      .from("players")
      .insert([0, 1].map((i) => ({ steam_id: `7656119900000098${bo}${i}`, nickname: `vto_${bo}_${i}` })))
      .select("id");
    const { data: teams } = await db()
      .from("teams")
      .insert(ps!.map((p, i) => ({ name: `VTO ${bo}${i}`, tag: `V${bo}${i}`, captain_id: p.id, invite_code: `E2EV-${bo}${i}` })))
      .select("id");
    const { data: t } = await db().from("tournaments").insert({ slug: `${PREFIX}${bo}`, name: `E2E veto ${bo}`, status: "draft", map_pool: POOL }).select("id").single();
    const { data: m } = await db()
      .from("matches")
      .insert({
        tournament_id: t!.id, number: 1, bracket: "upper", round: 1, position: 0, best_of: bo, status: "veto",
        team1_id: teams![0].id, team2_id: teams![1].id, veto_deadline: new Date(Date.now() - 30 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    await applyVetoTimeouts(m!.id);
    const after = (await getMatch(m!.id))!;
    check(after.status === "ready", `вето завершено автоматически (статус ${after.status})`);
    check(after.veto.length === POOL.length, `шагов вето: ${after.veto.length} из ${POOL.length}`);
    check(after.veto.filter((v) => v.action !== "decider").every((v) => v.auto), "все ходы помечены как автоматические");
    check(after.maps.length === bo, `карт серии: ${after.maps.length}`);
    check(new Set(after.veto.map((v) => v.map_name)).size === POOL.length, "каждая карта использована один раз");
  }
} finally {
  await cleanup();
  console.log("тестовые данные удалены");
}
console.log(failed ? `ПРОВАЛЕНО: ${failed}` : "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
