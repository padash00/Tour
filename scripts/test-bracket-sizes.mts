// Проверка генерации и прохождения сеток без базы: Single/Double Elimination на 2..16 команд,
// включая нечётные количества (баи). Турнир отыгрывается до конца, проверяется:
// - нет зависших матчей, у каждой сетки ровно один чемпион;
// - в DE каждая команда выбывает только после 2 поражений (кроме чемпиона), в SE — после 1;
// - баи не создают матчей «команда против пустоты» в статусе upcoming.
// Запуск: npx tsx scripts/test-bracket-sizes.mts
import { generateBracket, resolveBracket, type BracketMatch } from "../src/lib/bracket";

let failed = 0;
const fail = (msg: string) => {
  failed++;
  console.log("  ✕ " + msg);
};

function play(matches: BracketMatch[], pick: (m: BracketMatch) => string) {
  for (let i = 0; i < 500; i++) {
    const ready = matches.filter((m) => m.status === "upcoming");
    if (!ready.length) break;
    for (const m of ready) {
      if (!m.team1_id || !m.team2_id) fail(`${m.key}: upcoming без двух команд`);
      m.winner_id = pick(m);
      m.status = "finished";
    }
    resolveBracket(matches);
  }
}

for (const double of [false, true]) {
  for (let n = 2; n <= 16; n++) {
    for (const mode of ["fav", "underdog", "random"] as const) {
      const seeded = Array.from({ length: n }, (_, i) => `T${i + 1}`);
      const ms = generateBracket({ seeded, double });
      const seedOf = (t: string) => Number(t.slice(1));
      play(ms, (m) => {
        const a = m.team1_id!, b = m.team2_id!;
        if (mode === "random") return Math.random() < 0.5 ? a : b;
        const fav = seedOf(a) < seedOf(b) ? a : b;
        return mode === "fav" ? fav : fav === a ? b : a;
      });
      const label = `${double ? "DE" : "SE"} n=${n} ${mode}`;
      const stuck = ms.filter((m) => !["finished", "cancelled"].includes(m.status));
      if (stuck.length) fail(`${label}: зависли ${stuck.map((m) => `${m.key}[${m.status} ${m.team1_id}/${m.team2_id}]`).join(", ")}`);
      const last = double ? ms.find((m) => m.bracket === "grand_final")! : ms.filter((m) => m.bracket === "upper").sort((a, b) => b.round - a.round)[0];
      const champ = last.winner_id;
      if (!champ) fail(`${label}: нет чемпиона`);
      // поражения в реальных (не walkover) матчах
      const losses = new Map<string, number>();
      const played = new Map<string, number>();
      for (const m of ms) {
        if (m.status !== "finished" || !m.team1_id || !m.team2_id || m.is_walkover) continue;
        const loser = m.winner_id === m.team1_id ? m.team2_id : m.team1_id;
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        played.set(m.team1_id, (played.get(m.team1_id) ?? 0) + 1);
        played.set(m.team2_id, (played.get(m.team2_id) ?? 0) + 1);
      }
      for (const t of seeded) {
        const l = losses.get(t) ?? 0;
        if (t === champ) {
          if (l > (double ? 1 : 0)) fail(`${label}: чемпион ${t} проиграл ${l} раз`);
          continue;
        }
        // гранд-финал без «сброса сетки»: финалист верхней сетки, проигравший GF, выбывает с 1 поражением
        const gfLoserFromUpper = double && last.team1_id === t && last.winner_id !== t;
        const need = double && !gfLoserFromUpper ? 2 : 1;
        if (l !== need) fail(`${label}: ${t} выбыл с ${l} поражениями (нужно ${need}), сыграл ${played.get(t) ?? 0}`);
      }
    }
  }
}
console.log(failed ? `ПРОВАЛЕНО: ${failed}` : "ВСЕ СЕТКИ 2..16 (SE/DE) ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
