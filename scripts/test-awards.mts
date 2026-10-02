// Проверка чистой логики наград без базы: места 1–3 (Double / Single Elimination / таблица),
// лучший по показателю с порогом карт, тренды прогресса.
// Запуск: npx tsx scripts/test-awards.mts
import { bestBy, computePlacements, trend, type PlacementMatch } from "../src/lib/awards-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};
const m = (bracket: PlacementMatch["bracket"], round: number, t1: string, t2: string, w: string | null, status = "finished"): PlacementMatch => ({
  bracket,
  round,
  status,
  team1_id: t1,
  team2_id: t2,
  winner_id: w,
});
const places = (list: { teamId: string; place: number }[]) => list.map((p) => `${p.teamId}:${p.place}`).sort().join(",");

// Double Elimination: A чемпион (UB), B второй (LB), C проиграл финал нижней сетки
const de = [
  m("upper", 1, "A", "D", "A"),
  m("upper", 1, "B", "C", "B"),
  m("upper", 2, "A", "B", "A"),
  m("lower", 1, "D", "C", "C"),
  m("lower", 2, "B", "C", "B"),
  m("grand_final", 1, "A", "B", "A"),
];
check(places(computePlacements(de)) === "A:1,B:2,C:3", "DE: 1 — победитель ГФ, 2 — проигравший, 3 — проигравший финала нижней сетки");
check(computePlacements(de.map((x) => (x.bracket === "grand_final" ? { ...x, status: "live", winner_id: null } : x))).length === 0, "DE: гранд-финал не сыгран — мест нет");

// Single Elimination: финал A–B, полуфиналы проиграли C и D (делят 3 место)
const se = [m("upper", 1, "A", "C", "A"), m("upper", 1, "B", "D", "B"), m("upper", 2, "A", "B", "B")];
check(places(computePlacements(se)) === "A:2,B:1,C:3,D:3", "SE: 1/2 — финал, 3 — оба проигравших полуфинала");

// SE с баем: полуфинал без соперника не даёт 3 места
const seBye = [m("upper", 1, "A", "", "A"), m("upper", 1, "B", "C", "B"), m("upper", 2, "A", "B", "A")];
check(places(computePlacements(seBye)) === "A:1,B:2,C:3", "SE с баем: пустой соперник не получает место");

// Без плей-офф: по итоговой таблице
check(places(computePlacements([m("group", 1, "A", "B", "A")], ["X", "Y", "Z", "W"])) === "X:1,Y:2,Z:3", "круговая: первые три строки таблицы");
check(computePlacements([], []).length === 0, "нет матчей и таблицы — мест нет");

// Лучший по показателю: игрок с малым числом карт не участвует
const lines = [
  { key: "p1", maps: 1, clutches: 9, adr: 140, teamMaps: 6 }, // сыграл мало — не участвует
  { key: "p2", maps: 5, clutches: 4, adr: 92, teamMaps: 6 },
  { key: "p3", maps: 6, clutches: 2, adr: 101, teamMaps: 6 },
];
check(bestBy(lines, (l) => l.clutches)?.key === "p2", "лучший клатч — среди сыгравших ≥ половины карт команды");
check(bestBy(lines, (l) => l.adr)?.key === "p3", "лучший ADR — то же правило");
check(bestBy([{ key: "x", maps: 3, clutches: 0, adr: 0, teamMaps: 3 }], (l) => l.clutches) === null, "ноль клатчей — награды нет");

// Тренды
check(trend(1.1, 1.0) === "up" && trend(0.9, 1.0) === "down" && trend(1.01, 1.0) === "flat" && trend(1.2, null) === "flat", "тренд: ±3% порог, без прошлого — без стрелки");

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
