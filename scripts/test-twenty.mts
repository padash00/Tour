// «Двадцатка» без базы: рейтинг по картам, коронная карта, роли, форма, номинации, рекорды, связки, перевес для вето.
// Запуск: npx tsx scripts/test-twenty.mts
import { buildTwenty, mapEdge, ratingOf, type CoreGame, type CoreStat } from "../src/lib/twenty-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

const games: CoreGame[] = [];
const stats: CoreStat[] = [];
type P = Partial<CoreStat> & { id: string; k: number; d: number };
/** Игра: карты [название, победитель], составы; статистика каждого — одна и та же на всех картах, если не задано иначе */
function game(id: string, at: string, code: string | null, maps: [string, 1 | 2][], team1: P[], team2: P[], base = 1) {
  const w1 = maps.filter((m) => m[1] === 1).length;
  games.push({ id, code, winner: w1 * 2 > maps.length ? 1 : 2, finished_at: at, maps: maps.map(([map, winner]) => ({ map, status: "finished", winner, team1_score: winner === 1 ? 13 : 7, team2_score: winner === 2 ? 13 : 7 })) });
  maps.forEach((_, i) => {
    for (const [team, list] of [[1, team1], [2, team2]] as const)
      for (const { id: steam, k, d, ...rest } of list)
        stats.push({ game_id: id, map_number: i + base, steam_id: steam, name: steam, team, kills: k, deaths: d, assists: 3, damage: k * 100, headshot_kills: Math.round(k / 2), rounds_played: 20, kast: 0, mvp: 1, clutch_wins: 0, first_kills: 0, k3: 0, k4: 0, k5: 0, utility_damage: 20, enemies_flashed: 2, bomb_plants: 1, bomb_defuses: 0, ...rest });
  });
}
const p = (id: string, k: number, d: number, extra: Partial<CoreStat> = {}): P => ({ id, k, d, ...extra });

// вечер AAAA: A и B в одной команде, выигрывают оба матча; ACE — сильный на mirage, слабый на nuke
game("g1", "2026-11-10T15:00:00Z", "AAAA", [["de_mirage", 1], ["de_nuke", 1]], [p("ACE", 30, 10), p("BUD", 15, 15), p("SUP", 10, 15, { assists: 12, enemies_flashed: 15, utility_damage: 200 })], [p("X", 12, 18), p("Y", 14, 17), p("CLU", 15, 15, { clutch_wins: 3 })]);
game("g2", "2026-11-10T17:00:00Z", "AAAA", [["de_mirage", 1], ["de_nuke", 2], ["de_dust2", 1]], [p("ACE", 28, 12), p("BUD", 16, 14), p("SUP", 9, 16, { assists: 11, enemies_flashed: 14, utility_damage: 180 })], [p("X", 13, 17), p("Y", 12, 18), p("CLU", 14, 16, { clutch_wins: 2 })], 0);
// второй вечер BBBB: ACE играет хуже и проигрывает, X прибавляет
game("g3", "2026-11-12T15:00:00Z", "BBBB", [["de_nuke", 2], ["de_mirage", 2]], [p("ACE", 12, 18), p("BUD", 10, 18), p("SUP", 9, 17, { assists: 10, enemies_flashed: 12, utility_damage: 150 })], [p("X", 25, 10, { k3: 3, k5: 1 }), p("Y", 15, 14), p("CLU", 14, 14, { clutch_wins: 2 })]);
// отдельная игра на банк (без кода) тем же вечером, после полуночи по местному времени
game("g4", "2026-11-12T20:30:00Z", null, [["de_mirage", 1]], [p("ACE", 20, 15), p("X", 20, 12)], [p("BUD", 12, 18), p("Y", 13, 18)]);

// поправим ACE на nuke: там он слабый
for (const s of stats) if (s.steam_id === "ACE" && games.find((g) => g.id === s.game_id)!.maps[s.map_number - (s.game_id === "g2" ? 0 : 1)].map === "de_nuke") Object.assign(s, { kills: 8, deaths: 18, damage: 800 });

const t = buildTwenty(games, stats);
const row = (id: string) => t.rows.find((r) => r.steam_id === id)!;
const ace = row("ACE");

check(t.matches === 4 && t.mapsPlayed === 8, "учтены 4 матча и 8 карт");
check(ace.maps === 8 && ace.matches === 4 && ace.wins === 3, "карты и матчи игрока: 8 карт, 3 победы из 4");
check(ace.best?.map === "de_mirage" && ace.worst?.map === "de_nuke", "коронная карта — mirage, слабая — nuke");
check(ace.byMap.find((c) => c.map === "de_nuke")!.maps === 3 && ace.byMap.find((c) => c.map === "de_nuke")!.wins === 1, "номера карт с нуля и с единицы приводятся к порядку серии: nuke — 3 игры, 1 победа");
check(ace.byMap.find((c) => c.map === "de_dust2")!.maps === 1 && ace.best!.maps >= 2, "карта с одной игрой коронной не становится");
check(Math.abs(ace.rating - ratingOf({ rounds: ace.rounds, kills: ace.kills, deaths: ace.deaths, assists: ace.assists, damage: Math.round(ace.adr * ace.rounds), kast: 0, clutches: 0 })) < 1e-6, "общий рейтинг — по сумме всех карт");

const mirage = t.boards.find((b) => b.map === "de_mirage")!;
check(t.boards[0].map === "de_mirage" && mirage.played === 4, "карты идут по числу игр: mirage сыграна 4 раза");
check(mirage.rows[0].steam_id === "ACE" || mirage.rows[0].steam_id === "X", "хозяин карты — лучший по рейтингу на ней");
check(mirage.rows.every((r, i, a) => !i || a[i - 1].rating >= r.rating), "таблица карты отсортирована по рейтингу");
const dust = t.boards.find((b) => b.map === "de_dust2")!;
check(dust.minMaps === 1 && dust.rows.length === 6, "редкая карта: в таблицу попадают и с одной игрой");

check(row("SUP").role === "support", "роль: много ассистов, ослеплений и урона гранатами — опорник");
check(row("CLU").role === "clutch", "роль: много выигранных клатчей — клатчер");
check(ace.radar != null && ace.radar.fire >= row("SUP").radar!.fire, "паутинка: у фраггера «огонь» выше, чем у опорника");
check(t.rows.every((r) => r.role !== "entry"), "без данных о первых убийствах роль «открывашка» не выдаётся");

check(ace.trend != null && ace.trend < 0 && row("X").trend! > 0, "форма: у ACE последний игровой день хуже прежних, у X — лучше");
check(ace.form.join("") === "WLWW" && ace.streak === 1 && ace.bestStreak === 2, "серии побед: идущая 1, лучшая 2; форма — свежий матч первым");

const kills = t.records.find((r) => r.key === "kills_map")!;
check(kills.steam_id === "ACE" && kills.value === "30" && kills.game_id === "g1", "рекорд убийств за карту: 30, при равенстве — у поставившего раньше");
const streak = t.records.find((r) => r.key === "streak")!;
check(streak.value === "2", "рекорд побед подряд — 2");

const duo = t.duos.find((d) => [d.a, d.b].sort().join() === "ACE,BUD")!;
check(duo.games === 3 && duo.wins === 2, "связка ACE + BUD: 3 матча вместе, 2 победы (игру друг против друга не считаем)");
check(t.duos.every((d) => d.games >= 3), "связки — от трёх матчей вместе");
const rel = t.relations("X");
check(rel.partner?.steam_id === "Y" || rel.partner?.steam_id === "CLU", "лучший напарник — тот, с кем чаще выигрывает");
check(["ACE", "SUP"].includes(rel.nemesis?.steam_id ?? "") && t.relations("BUD").nemesis === null, "неудобный соперник — тот, кому чаще проигрывает; при счёте поровну его нет");

const eve = buildTwenty(games, stats, { code: "BBBB" });
check(eve.matches === 1 && eve.rows.length === 6 && eve.rows[0].steam_id === "X", "вечер: только его матч, лучший игрок вечера — X");
check(eve.nominations.find((n) => n.key === "multi")?.steam_id === "X" && eve.nominations.find((n) => n.key === "multi")?.value === "8", "номинация вечера «мультикиллер» — сумма за вечер");
check(eve.nominations.find((n) => n.key === "progress")?.steam_id === "X", "прогресс вечера — против всего сыгранного раньше");
check(eve.records.length === t.records.length, "рекорды от выбранного вечера не зависят");
check(t.nominations.find((n) => n.key === "clutch")?.steam_id === "CLU", "общая номинация «клатчер»");

const edge = mapEdge(t.rows, ["ACE", "BUD"], ["X", "NOBODY"], ["de_mirage", "de_train"]);
check(edge.de_mirage.team1!.known === 2 && edge.de_mirage.team2!.known === 1 && edge.de_train.team1 === null, "перевес для вето: средний рейтинг команды на карте; где никто не играл — пусто");

check(buildTwenty([], []).rows.length === 0 && buildTwenty([], []).nominations.length === 0, "пустые данные не ломают расчёт");

if (failed) {
  console.error(`\nне прошло проверок: ${failed}`);
  process.exit(1);
}
console.log("\nвсе проверки «Двадцатки» прошли");
