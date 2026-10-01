// Пересчёт Swing матча по сохранённым событиям раундов: npx tsx scripts/recompute-swing.mts <matchId>
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean)) {
  const i = l.indexOf("=");
  process.env[l.slice(0, i)] ??= l.slice(i + 1);
}
const { recomputeMatchSwing } = await import("../src/lib/swing-ingest");
const { db } = await import("../src/lib/supabase");
const id = process.argv[2];
console.log("пересчитано записей:", await recomputeMatchSwing(id));
const { data } = await db().from("player_map_swing").select("steam_id, swing_sum, rounds").eq("match_id", id);
for (const r of data ?? []) console.log(r.steam_id, `${((100 * r.swing_sum) / r.rounds).toFixed(1)} п.п./раунд`, `(${r.rounds} раундов)`);
