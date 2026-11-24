// Раунды игр лобби по HTTP-логу CS2 без базы: разбор пачки, раунды, первые убийства, размены, KAST, оружие, стороны.
// Запуск: npx tsx scripts/test-lobby-rounds.mts
import { parseLogBatch, roundFacts } from "../src/lib/lobby-rounds-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

const STEAM = (n: number) => (BigInt("76561197960265728") + BigInt(n)).toString();
const A1 = STEAM(100), A2 = STEAM(101), B1 = STEAM(200), B2 = STEAM(201);
const who: Record<string, [string, number]> = { [A1]: ["Ace", 100], [A2]: ["Abe", 101], [B1]: ["Bob", 200], [B2]: ["Ben", 201] };
let clock = 20 * 3600;
const stamp = () => {
  const h = String(Math.floor(clock / 3600)).padStart(2, "0"), m = String(Math.floor((clock % 3600) / 60)).padStart(2, "0"), s = String(clock % 60).padStart(2, "0");
  return `L 11/24/2026 - ${h}:${m}:${s}: `;
};
const actor = (id: string, side: "CT" | "TERRORIST") => `"${who[id][0]}<${who[id][1]}><[U:1:${who[id][1]}]><${side}>"`;
const lines: string[] = [];
const say = (text: string, wait = 0) => {
  clock += wait;
  lines.push(stamp() + text);
};
const kill = (k: string, ks: "CT" | "TERRORIST", v: string, vs: "CT" | "TERRORIST", weapon: string, wait: number) => say(`${actor(k, ks)} [1 2 3] killed ${actor(v, vs)} [4 5 6] with "${weapon}"`, wait);
const end = (side: "CT" | "TERRORIST") => say(`Team "${side}" triggered "SFUI_Notice_${side === "CT" ? "CTs_Win" : "Terrorists_Win"}" (CT "1") (T "0")`, 5);

// разминка и ножевой раунд — в зачёт не идут
kill(B1, "TERRORIST", A1, "CT", "ak47", 1);
say(`World triggered "Match_Start" on "de_mirage"`, 10);
say(`World triggered "Round_Start"`, 1);
kill(A1, "CT", B1, "TERRORIST", "knife", 5);
end("CT");

// карта: 13 раундов за CT — первое убийство из AWP, размен, добивание
say(`World triggered "Match_Start" on "de_mirage"`, 30);
for (let r = 0; r < 13; r++) {
  say(`World triggered "Round_Start"`, 15);
  say(`"Ace<100><[U:1:100]><CT>" purchased "awp"`, 1);
  kill(A1, "CT", B1, "TERRORIST", "awp", 20);
  kill(B2, "TERRORIST", A1, "CT", "ak47", 2);
  kill(A2, "CT", B2, "TERRORIST", "m4a1", 1);
  end("CT");
}
// 14-й раунд — за T: Bob убивает обоих, второго через 8 секунд (не размен); Ben ослепил
say(`World triggered "Round_Start"`, 15);
kill(B1, "TERRORIST", A1, "CT", "ak47", 20);
say(`${actor(B2, "TERRORIST")} flash-assisted killing ${actor(A1, "CT")}`);
kill(B1, "TERRORIST", A2, "CT", "ak47", 8);
end("TERRORIST");
say(`Game Over: competitive mg_active de_mirage score 13:1 after 30 min`, 3);

const events = parseLogBatch(lines.join("\n"));
check(events.every((e) => e.type !== undefined) && !lines.every((_, i) => events[i]), "лишние строки лога (покупки) отбрасываются");
check(events.filter((e) => e.type === "match_start").length === 2 && events.filter((e) => e.type === "game_over").length === 1, "отметки начала и конца карты распознаются");
check(events.find((e) => e.type === "kill")!.t === 20 * 3600 + 1, "у события есть время из строки лога");

const players = [{ steam_id: A1, team: 1 }, { steam_id: A2, team: 1 }, { steam_id: B1, team: 2 }, { steam_id: B2, team: 2 }];
const [map1, map2] = roundFacts(events, [{ total: 14, players }, { total: 20, players }]);
const f = (id: string) => map1!.get(id)!;

check(!!map1 && map2 === null, "карта находится по числу раундов; карте без своего отрезка лога факты не приписываются");
check(f(A1).rounds === 14 && f(B2).rounds === 14, "ножевой раунд и разминка в раунды карты не попали");
check(f(A1).first_kills === 13 && f(B1).first_deaths === 13 && f(B1).first_kills === 1 && f(A1).first_deaths === 1, "первые убийства и первые смерти раунда");
check(f(A2).trade_kills === 13 && f(B1).trade_kills === 0, "размен — убийцу товарища убили в пределах 5 секунд; через 8 секунд — уже нет");
check(f(A1).weapons.awp === 13 && f(A1).weapons.knife === undefined && f(B1).weapons.ak47 === 2, "убийства по оружию считаются только в раундах карты");
check(f(A1).kast === 13 && f(A2).kast === 13 && f(B2).kast === 14 && f(B1).kast === 14, "KAST: убийство, ассист, выжил или разменян; погиб без пользы — раунд не засчитан");
check(f(B2).flash_assists === 1 && f(A1).flash_assists === 0, "флеш-ассисты");
check(f(A1).sides.CT.rounds === 14 && f(A1).sides.CT.wins === 13 && f(A1).sides.CT.kills === 13 && f(A1).sides.CT.deaths === 14 && f(A1).sides.T.rounds === 0, "стороны: раунды, победы, убийства и смерти за защиту");
check(f(B1).sides.T.rounds === 14 && f(B1).sides.T.wins === 1 && f(B1).sides.T.kills === 2, "стороны: то же за атаку");

// хвост лога не дошёл (последний раунд без итога) — карта всё равно находится
const cutAt = lines.map((l) => l.includes("Terrorists_Win")).lastIndexOf(true);
const [short] = roundFacts(parseLogBatch(lines.slice(0, cutAt).join("\n")), [{ total: 14, players }]);
check(!!short && short.get(A1)!.rounds === 13, "потерянный последний раунд не мешает: считаются найденные 13 из 14");

// половина лога пропала — цифры были бы обрывочными, поэтому фактов нет вовсе
const half = lines.findIndex((l) => l.includes("Match_Start") && lines.indexOf(l) > 6);
const [broken] = roundFacts(parseLogBatch(lines.slice(half, half + 30).join("\n")), [{ total: 14, players }]);
check(broken === null, "когда раундов в логе заметно меньше, чем сыграно, факты не записываются");

check(roundFacts([], [{ total: 14, players }])[0] === null && roundFacts(events, []).length === 0, "пустой лог и игра без карт не ломают расчёт");

if (failed) {
  console.error(`\nне прошло проверок: ${failed}`);
  process.exit(1);
}
console.log("\nвсе проверки раундов лобби прошли");
