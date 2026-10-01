// Проверка групповых форматов без базы (та же логика, что progressStages):
// - швейцарка: N команд (4..16, включая нечётные) × порог побед 2..3 — стадия должна завершиться,
//   у каждой команды итог advanced/eliminated, без бесконечного цикла и «забытых» команд;
// - круговая: каждый с каждым ровно один раз, у нечётных — выходные;
// - группы змейкой: размеры групп отличаются не более чем на 1.
// Запуск: npx tsx scripts/test-stage-formats.mts
import { roundRobinRounds, splitGroups, standings, swissFirstRound, swissPairings, type StageMatch } from "../src/lib/formats";

let failed = 0;
const fail = (m: string) => {
  failed++;
  console.log("  ✕ " + m);
};

function simulateSwiss(n: number, wins: number) {
  const seeded = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  const matches: StageMatch[] = [];
  let id = 0;
  const add = (pairs: [string, string | null][], round: number) =>
    pairs.forEach(([a, b]) => {
      if (!b) {
        // бай — как в matches.ts: завершённый матч без соперника
        matches.push({ id: String(id++), team1_id: a, team2_id: null, winner_id: a, status: "finished", round, maps: [], team1_score: 0, team2_score: 0 });
        return;
      }
      const fav = Number(a.slice(1)) < Number(b.slice(1)) ? a : b;
      const w = Math.random() < 0.6 ? fav : fav === a ? b : a;
      matches.push({
        id: String(id++), team1_id: a, team2_id: b, winner_id: w, status: "finished", round,
        maps: [{ team1_score: w === a ? 13 : 7, team2_score: w === b ? 13 : 7, winner_id: w, status: "finished" }],
        team1_score: w === a ? 1 : 0, team2_score: w === b ? 1 : 0,
      });
    });
  add(swissFirstRound(seeded), 1);
  for (let round = 2; round < 40; round++) {
    const table = standings(seeded, matches, { swiss: true, swissWins: wins });
    if (!table.some((r) => r.status === "active")) return { table, rounds: round - 1, stuck: false };
    const played = new Set(matches.map((m) => (m.team1_id && m.team2_id ? [m.team1_id, m.team2_id].sort().join(":") : `${m.team1_id}:BYE`)));
    const pairs = swissPairings(table, played, wins);
    if (!pairs.length) return { table, rounds: round - 1, stuck: true };
    add(pairs, round);
  }
  return { table: standings(seeded, matches, { swiss: true, swissWins: wins }), rounds: 40, stuck: true };
}

for (let n = 4; n <= 16; n++) {
  for (const wins of [2, 3]) {
    for (let rep = 0; rep < 20; rep++) {
      const { table, rounds, stuck } = simulateSwiss(n, wins);
      const active = table.filter((r) => r.status === "active");
      const never = table.filter((r) => r.played === 0);
      if (stuck || active.length) {
        fail(`швейцарка n=${n} wins=${wins}: стадия не завершилась (раундов ${rounds}, активных ${active.length}: ${active.map((r) => `${r.teamId} ${r.wins}-${r.losses}`).join(", ")})`);
        break;
      }
      if (never.length) {
        fail(`швейцарка n=${n} wins=${wins}: команды без матчей ${never.map((r) => r.teamId).join(",")}`);
        break;
      }
    }
  }
}

for (let n = 2; n <= 12; n++) {
  const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  const rounds = roundRobinRounds(teams);
  const seen = new Map<string, number>();
  for (const r of rounds) {
    const inRound = new Set<string>();
    for (const [a, b] of r) {
      const k = [a, b].sort().join(":");
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (inRound.has(a) || inRound.has(b)) fail(`круговая n=${n}: команда дважды в одном туре`);
      inRound.add(a).add(b);
    }
  }
  if (seen.size !== (n * (n - 1)) / 2 || [...seen.values()].some((v) => v !== 1)) fail(`круговая n=${n}: не каждый с каждым ровно раз`);
}

for (let n = 4; n <= 16; n++) {
  for (let g = 2; g <= 4; g++) {
    const gs = splitGroups(Array.from({ length: n }, (_, i) => i), g);
    const sizes = gs.map((x) => x.length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) fail(`группы n=${n} g=${g}: размеры ${sizes.join(",")}`);
  }
}

console.log(failed ? `ПРОВАЛЕНО: ${failed}` : "ШВЕЙЦАРКА, КРУГОВАЯ, ГРУППЫ — ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
