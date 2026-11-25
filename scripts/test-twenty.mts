// «Двадцатка» без базы: рейтинг по картам, коронная карта, роли, форма, номинации, рекорды, связки, перевес для вето.
// Запуск: npx tsx scripts/test-twenty.mts
import { rating2, rating3, rating3Parts, RATING3_AVERAGE, RATING3_FROM, weaponBoards, weaponGroup, eloFit, playerStrength, teamBalance, ACHIEVEMENTS_TOTAL, SEASON_MIN_MAPS, SEASON_PRIZES, buildTwenty, currentSeason, mapEdge, ratingOf, seasonOf, type CoreGame, type CoreStat } from "../src/lib/twenty-core";

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
        stats.push({ game_id: id, map_number: i + base, steam_id: steam, name: steam, team, kills: k, deaths: d, assists: 3, damage: k * 100, headshot_kills: Math.round(k / 2), rounds_played: 20, kast: 0, mvp: 1, clutch_wins: 0, first_kills: 0, k3: 0, k4: 0, k5: 0, utility_damage: 20, enemies_flashed: 2, bomb_plants: 1, bomb_defuses: 0, first_deaths: 0, trade_kills: 0, sniper_kills: 0, ct_rounds: 0, ct_wins: 0, ct_kills: 0, ct_deaths: 0, t_rounds: 0, t_wins: 0, t_kills: 0, t_deaths: 0, ...rest });
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

// ───────────────────────── достижения и история
const ach = (id: string, key: string) => t.achievements(id).find((x) => x.key === key)!;
check(t.achievements("ACE").length === ACHIEVEMENTS_TOTAL && ACHIEVEMENTS_TOTAL >= 40, "у каждого игрока полный список достижений — полученные и нет");
check(ach("ACE", "map30").earned && !ach("ACE", "map40").earned && ach("ACE", "map40").have === "30" && ach("ACE", "map40").need === "40" && ach("ACE", "map40").progress === 0.75, "достижение «30 убийств за карту» получено, до «40» — прогресс 30 из 40");
check(ach("CLU", "clutchMap3").earned && !ach("ACE", "clutchMap3").earned, "достижение за три клатча на карте — только у того, кто их сделал");
check(ach("ACE", "record").earned && ach("ACE", "eveningKing").earned && !ach("BUD", "eveningKing").earned, "звания: рекордсмен и король вечера");
check(!ach("ACE", "champion").earned, "чемпионом сезона нельзя стать, пока сезон идёт");
check(t.achievementBoard().find((x) => x.key === "map30")!.holders.join() === "ACE", "доска достижений: у кого какое есть");
const hist = t.history("ACE");
check(hist.length === 2 && hist[0].day === "2026-11-10" && hist[1].day === "2026-11-12" && hist[0].maps === 5 && hist[0].rating > hist[1].rating, "история рейтинга — по игровым дням, старые первыми");

// ───────────────────────── сезоны
check(seasonOf("2026-12-01T00:30:00Z") === "2026-11" && seasonOf("2026-12-01T02:00:00Z") === "2026-12", "сезон — месяц игрового дня: игра до 6 утра первого числа относится к прошлому месяцу");
check(currentSeason(Date.parse("2026-11-24T12:00:00Z")) === "2026-11", "текущий сезон — по сегодняшней дате");
const NOV = Date.parse("2026-11-24T12:00:00Z");
const nov = buildTwenty(games, stats, { season: "2026-11", now: NOV });
check(nov.rows.length === 6 && nov.rows.every((r) => !r.qualified && r.prize === null), `в сезоне меньше ${SEASON_MIN_MAPS} карт — вне зачёта и без приза`);
check(nov.seasons.length === 1 && !nov.seasons[0].finished && nov.seasons[0].podium.length === 0, "идущий сезон не завершён, призёров ещё нет");

// декабрь: две серии по пять карт — у четверых по 10 карт, они в зачёте
game("d1", "2026-12-05T15:00:00Z", null, [["de_mirage", 1], ["de_nuke", 1], ["de_dust2", 2], ["de_ancient", 1], ["de_anubis", 2]], [p("ACE", 22, 12), p("BUD", 14, 15)], [p("X", 16, 16), p("Y", 11, 18)]);
game("d2", "2026-12-06T15:00:00Z", null, [["de_mirage", 1], ["de_nuke", 2], ["de_dust2", 1], ["de_ancient", 1], ["de_anubis", 2]], [p("ACE", 21, 13), p("BUD", 15, 15)], [p("X", 17, 15), p("Y", 12, 19)]);
const DEC = Date.parse("2026-12-20T12:00:00Z");
const dec = buildTwenty(games, stats, { season: "2026-12", now: DEC });
check(dec.rows.length === 4 && dec.rows.every((r) => r.qualified) && dec.rows[0].steam_id === "ACE", "сезон считается только по своим играм: четверо в зачёте, лидер — ACE");
check(dec.rows.map((r) => r.prize).join() === [...SEASON_PRIZES, ""].join(), "призы: 15 000, 10 000 и 5 000 за первые три места, четвёртому — ничего");
check(dec.seasons.map((x) => x.key).join() === "2026-12,2026-11" && dec.seasons[1].finished && !dec.seasons[0].finished, "сезоны идут свежим первым; прошлый месяц завершён");
check(dec.records.length > 0 && dec.achievements("ACE").find((x) => x.key === "maps10")!.earned, "рекорды и достижения считаются по всем играм, а не по сезону");
const jan = buildTwenty(games, stats, { now: Date.parse("2027-01-10T12:00:00Z") });
check(jan.seasons[0].finished && jan.seasons[0].podium.map((x) => x.steam_id)[0] === "ACE" && jan.seasons[0].podium[0].prize === SEASON_PRIZES[0], "после конца месяца у сезона есть призёры");
check(jan.achievements("ACE").find((x) => x.key === "champion")!.earned && jan.achievements("X").find((x) => x.key === "podium")!.earned && !jan.achievements("X").find((x) => x.key === "champion")!.earned, "достижения «чемпион сезона» и «призёр сезона» выдаются по завершённым сезонам");
check(jan.rows.every((r) => r.qualified && r.prize === null), "за всё время зачёта и призов нет");

// записанные итоги сезона: тройка берётся из записи, а не из пересчёта по истории
const JAN = Date.parse("2027-01-10T12:00:00Z");
const fixedDec = { "2026-12": [{ steam_id: "X", name: "X", rating: 1.11, maps: 10, prize: SEASON_PRIZES[0], paid: true }, { steam_id: "ACE", name: "ACE", rating: 1.5, maps: 10, prize: SEASON_PRIZES[1], paid: false }] };
const janFixed = buildTwenty(games, stats, { now: JAN, fixed: fixedDec });
check(janFixed.seasons[0].fixed === true && janFixed.seasons[0].podium.map((x) => x.steam_id).join() === "X,ACE" && janFixed.seasons[0].podium[0].paid === true, "у завершённого сезона с записью призёры — из записи, вместе с отметкой о выплате");
check(janFixed.achievements("X").find((x) => x.key === "champion")!.earned && !janFixed.achievements("ACE").find((x) => x.key === "champion")!.earned, "«чемпион сезона» выдаётся по записанным итогам");
check(!jan.seasons[0].fixed, "без записи сезон считается по истории и записанным не помечен");
const decFixed = buildTwenty(games, stats, { season: "2026-12", now: JAN, fixed: fixedDec });
check(decFixed.rows.slice(0, 2).map((r) => r.steam_id).join() === "X,ACE" && decFixed.rows.map((r) => r.prize ?? "").join() === [SEASON_PRIZES[0], SEASON_PRIZES[1], "", ""].join(), "таблица завершённого сезона: записанные призёры сверху, призы только у них");
const decLive = buildTwenty(games, stats, { season: "2026-12", now: DEC, fixed: fixedDec });
check(decLive.rows[0].steam_id === "ACE" && !decLive.seasons[0].fixed, "идущий сезон запись не трогает");

// ───────────────────────── баланс составов
const fitRows = Array.from({ length: 10 }, (_, i) => ({ rating: 0.9 + i * 0.04, maps: 8, elo: 2000 + i * 100 }));
const fit = eloFit(fitRows)!;
check(Math.abs(fit.perPoint - 0.0004) < 1e-9 && Math.abs(fit.elo - 2450) < 1e-9, "связь ELO и рейтинга: +100 ELO = +0.04 рейтинга");
check(eloFit(fitRows.slice(0, 5)) === null && eloFit(fitRows.map((r) => ({ ...r, maps: 2 }))) === null, "по малому числу игроков связь не строится");
check(playerStrength({ rating: 1.3, maps: 10 }, 1500, fit).by === "mix" && playerStrength({ rating: 1.3, maps: 10 }, 1500, fit).value === 1.3, "сила игрока — его рейтинг в Миксе, когда игр хватает");
const newbie = playerStrength({ rating: 2.0, maps: 1 }, 2950, fit);
check(newbie.by === "elo" && Math.abs(newbie.value - (fit.rating + 0.2)) < 1e-9, "одна удачная карта силой не считается — берётся оценка по ELO");
check(playerStrength(null, null, fit).by === "none" && playerStrength(null, null, null).value < 1, "без истории и без ELO — чуть ниже среднего");
const S = (v: number) => ({ value: v, by: "mix" as const });
check(teamBalance([S(1), S(1)], [S(1), S(1), S(1)]) === null, "пока в команде меньше трёх игроков, составы не сравниваются");
check(teamBalance([S(1), S(1.02), S(1)], [S(1.01), S(1), S(1)])!.level === "even" && teamBalance([S(1), S(1), S(1)], [S(1), S(1), S(1)])!.favored === null, "близкие составы — равны, перевеса ни у кого");
const slight = teamBalance([S(1.05), S(1.05), S(1.05)], [S(1), S(1), S(1)])!;
const clear = teamBalance([S(1), S(1), S(1)], [S(1.1), S(1.1), S(1.1)])!;
check(slight.level === "slight" && slight.favored === 1 && clear.level === "clear" && clear.favored === 2, "небольшой и заметный перевес — у той команды, что сильнее");
check(teamBalance([S(1), S(1), newbie], [S(1), S(1), S(1)])!.estimated === 1, "сколько игроков оценено не по Миксу — сообщается отдельно");

// рейтинг с учётом Swing
const avg = { rounds: 100, kills: 68, deaths: 68, assists: 13, damage: 7600, kast: 70, clutches: 0, kastRounds: 100 };
const avg3 = { ...avg, swing: 0, ekills: 68, edeaths: 68, multi: 26 };
check(Math.abs(rating3(avg3) - rating2(avg)) < 0.01 && Math.abs(rating3(avg3) - RATING3_AVERAGE) < 1e-9, "средний игрок с нулевым Swing получает по новой формуле столько же, сколько по прежней");
check(rating3({ ...avg3, swing: 4 }) - rating3(avg3) > 0.13 && rating3({ ...avg3, swing: -4 }) < rating3(avg3), "Swing +4 п.п. за раунд поднимает рейтинг примерно на 0.14, отрицательный — опускает");
check(rating3({ ...avg3, ekills: 78 }) > rating3(avg3) && rating3({ ...avg3, edeaths: 78 }) < rating3(avg3) && rating3({ ...avg3, multi: 50 }) > rating3(avg3), "убийства лучше вооружённых и мультикиллы поднимают оценку, смерти от слабее вооружённых — опускают");
{
  const parts = rating3Parts({ ...avg3, swing: 4, ekills: 80 });
  const total = RATING3_AVERAGE + Object.values(parts).reduce((a, b) => a + b, 0);
  check(Math.abs(total - rating3({ ...avg3, swing: 4, ekills: 80 })) < 1e-9 && Math.abs(parts.swing - 0.14) < 1e-9 && Math.abs(parts.deaths) < 1e-9, "оценка раскладывается на части: средний игрок плюс вклад каждой");
  const g = (id: string, at: string): CoreGame => ({ ...games[0], id, finished_at: at });
  const line = (game_id: string, steam_id: string, swing: number | null): CoreStat => ({ ...stats[0], game_id, steam_id, name: steam_id, kills: 20, deaths: 15, swing });
  const nov = buildTwenty([g("old", "2026-11-20T15:00:00Z")], [line("old", "P", 0.8), line("old", "Q", null)], { code: "AAAA" });
  const dec = buildTwenty([g("new", "2026-12-05T15:00:00Z")], [line("new", "P", 0.8), line("new", "Q", null), line("new", "R", -0.8)], { code: "AAAA" });
  const r = (b: ReturnType<typeof buildTwenty>, id: string) => b.rows.find((x) => x.steam_id === id)!;
  check(RATING3_FROM === "2026-12" && r(nov, "P").rating === r(nov, "Q").rating && Math.abs(r(nov, "P").swing! - 4) < 1e-9 && r(nov, "P").rating3 !== null && r(nov, "P").parts3!.swing > 0.13 && r(nov, "Q").swing === null && r(nov, "Q").rating3 === null, "до сезона декабря 2026 новый рейтинг и Swing показываются справочно, на места не влияют");
  check(r(dec, "P").rating > r(dec, "R").rating && Math.abs(r(dec, "P").rating - r(dec, "P").rating3!) < 1e-9 && r(dec, "Q").rating === r(nov, "Q").rating, "с декабря новый рейтинг — официальный; карта без записи раундов считается по прежней формуле");
}

// оружие: группы и лидеры
check(weaponGroup("weapon_AK47") === "ak47" && weaponGroup("m4a1_silencer") === "m4" && weaponGroup("knife_karambit") === "melee" && weaponGroup("usp_silencer") === "pistols" && weaponGroup("world") === null, "оружие из лога раскладывается по группам, неизвестное пропускается");
const wb = weaponBoards([
  { steam_id: "A", name: "A", weapons: { ak47: 30, m4a1: 5, m4a1_silencer: 7, glock: 2 } },
  { steam_id: "B", name: "B", weapons: { ak47: 41, awp: 12, usp_silencer: 3, p250: 1 } },
  { steam_id: "C", name: "C", weapons: {} },
]);
check(wb.map((b) => b.key).join() === "ak47,m4,awp,pistols" && wb[0].rows.map((r) => r.steam_id + r.kills).join() === "B41,A30" && wb[0].total === 71 && wb[1].rows[0].kills === 12 && wb[3].rows[0].steam_id === "B" && wb[3].rows[0].kills === 4, "лидеры по оружию: M4A4 и M4A1-S вместе, пистолеты суммой, пустые группы скрыты");
check(Object.keys(t.rows[0].weapons).length === 0, "у игр без лога раундов убийств по оружию нет");

if (failed) {
  console.error(`\nне прошло проверок: ${failed}`);
  process.exit(1);
}
console.log("\nвсе проверки «Двадцатки» прошли");
