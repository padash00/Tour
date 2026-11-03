// Рейтинг команд F16 без базы: места и очки, вес турнира, свежесть, неделя назад, скрытие неактивных.
// Запуск: npx tsx scripts/test-team-ranking.mts
import { achievementOf, decay, rankTeams, type RankMatch, type RankTournament } from "../src/lib/team-ranking-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};
const DAY = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
let n = 0;
const m = (tid: string, bracket: RankMatch["bracket"], round: number, t1: string, t2: string, w: string, at: string, walkover = false): RankMatch => ({
  id: `m${++n}`, tournamentId: tid, bracket, round, status: "finished", team1_id: t1, team2_id: t2, winner_id: w, finishedAt: at, walkover,
});
const T = (id: string, daysAgo: number, extra: Partial<RankTournament> = {}): RankTournament => ({ id, name: id, slug: id, startsAt: ago(daysAgo), official: false, lan: true, finished: true, ...extra });

// Single Elimination на 8 команд с матчем за 3-е место
const se = (tid: string, d: number) => [
  m(tid, "upper", 1, "A", "H", "A", ago(d)), m(tid, "upper", 1, "B", "G", "B", ago(d)), m(tid, "upper", 1, "C", "F", "C", ago(d)), m(tid, "upper", 1, "D", "E", "D", ago(d)),
  m(tid, "upper", 2, "A", "D", "A", ago(d)), m(tid, "upper", 2, "B", "C", "B", ago(d)),
  m(tid, "third_place", 1, "D", "C", "C", ago(d)),
  m(tid, "upper", 3, "A", "B", "A", ago(d)),
];
const a = achievementOf(se("t1", 1));
check(a.get("A")?.base === 100 && a.get("B")?.base === 70 && a.get("C")?.base === 50 && a.get("D")?.base === 40, "места 1–4: 100 / 70 / 50 / 40");
check(a.get("E")?.base === 10 && a.get("E")?.place === null, "вылет в первом раунде плей-офф — 10 очков, без места");

check(decay(ago(10), NOW) === 1 && decay(ago(120), NOW) === 0.75 && decay(ago(200), NOW) === 0.5 && decay(ago(400), NOW) === 0, "свежесть: 1 / 0.75 / 0.5 / 0");

const all = () => true;
const r1 = rankTeams([T("t1", 1)], se("t1", 1), NOW, all);
check(r1[0].teamId === "A" && r1[0].rank === 1 && r1[1].teamId === "B", "чемпион первый, финалист второй");
check(r1.find((x) => x.teamId === "A")!.wins === 3 && r1.find((x) => x.teamId === "A")!.losses === 0, "победы и поражения за полгода");

const official = rankTeams([T("t1", 1, { official: true })], se("t1", 1), NOW, all);
const online = rankTeams([T("t1", 1, { lan: false })], se("t1", 1), NOW, all);
check(official[0].achievement === 200 && online[0].achievement === 50, "вес: официальный ×2, онлайн ×0.5");

const old = rankTeams([T("t1", 200)], se("t1", 200), NOW, all);
check(old.length === 0, "команды без матчей больше полугода скрыты");

const prev = rankTeams([T("t1", 1)], se("t1", 1), NOW - 7 * DAY, all);
check(prev.length === 0, "неделю назад турнира ещё не было — рейтинг пуст");

const solo = rankTeams([T("t1", 1)], se("t1", 1), NOW, (id) => id !== "A");
check(solo[0].teamId === "B" && !solo.some((x) => x.teamId === "A"), "распущенные и «одиночки» не показываются");

const wo = rankTeams([T("t2", 1)], [m("t2", "group", 1, "X", "Y", "X", ago(1), true)], NOW, all);
check(!wo.some((x) => x.teamId === "X" && x.form > 0), "техническая победа не идёт в форму");

if (failed) {
  console.error(`\n${failed} team ranking checks failed`);
  process.exit(1);
}
console.log("\nteam ranking checks passed");
