// Рассадка в зале без базы: запреты по схеме клуба, 5 матчей одновременно, победитель остаётся на месте.
// Запуск: npx tsx scripts/test-hall.mts
import { chooseSeats, defaultForbidden, pairKey, parseForbidden, parseOff, serializeForbidden } from "../src/lib/hall-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

const F = defaultForbidden();
check(F.has(pairKey("P1", "P2")), "1–5 и 6–10 смотрят друг на друга — нельзя");
check(F.has(pairKey("P1", "P3")), "1–5 против 11–15 — нельзя (видно экраны)");
check(!F.has(pairKey("P1", "P4")), "1–5 против 16–20 — можно");
check(F.has(pairKey("P4", "P5")), "16–20 и 21–25 спиной к спине — нельзя");
check(F.has(pairKey("S2", "S3")) && F.has(pairKey("S1", "S4")), "Standart против Standart — нельзя");
check(!F.has(pairKey("P1", "S2")), "Premium против Standart — можно");
check(F.has(pairKey("S2", "P2")) && F.has(pairKey("S2", "P3")), "37–41 против 6–10 и 11–15 — нельзя");
check(serializeForbidden(parseForbidden(serializeForbidden(F))) === serializeForbidden(F), "запреты сохраняются и читаются без потерь");
check(parseForbidden("").size === F.size, "пустая настройка — запреты по умолчанию");

// первая волна: 5 матчей, все новые
const occupied = new Map<string, string>();
const last = new Map<string, string>();
const plans = [];
for (let k = 0; k < 5; k++) {
  const p = chooseSeats({ team1: `a${k}`, team2: `b${k}`, last, occupied, reserved: new Map(), forbidden: F });
  check(!!p, `волна 1, матч ${k + 1}: места нашлись (${p?.seat1} против ${p?.seat2})`);
  if (!p) continue;
  plans.push(p);
  occupied.set(p.seat1, `a${k}`);
  occupied.set(p.seat2, `b${k}`);
  check(!F.has(pairKey(p.seat1, p.seat2)), `матч ${k + 1}: соперники не в запрещённой паре`);
}
check(occupied.size === 10, "5 матчей заняли все 10 блоков");
check(!chooseSeats({ team1: "x", team2: "y", last, occupied, reserved: new Map(), forbidden: F }), "шестой матч ждёт — мест нет");

// победитель матча 1 остаётся на своём месте, соперник садится туда, где сидел проигравший
const p0 = plans[0];
occupied.delete(p0.seat2); // b0 проиграл и ушёл
last.set("a0", p0.seat1);
const next = chooseSeats({ team1: "a0", team2: "c", last, occupied, reserved: new Map(), forbidden: F });
check(next?.seat1 === p0.seat1 && !next.moved1, "победитель не пересаживается");
check(next?.seat2 === p0.seat2, "новый соперник — на место проигравшего");

// обе команды уже сидят, и их места не мешают друг другу — никого не двигаем
const both = chooseSeats({ team1: "a", team2: "b", last: new Map([["a", "P1"], ["b", "P4"]]), occupied: new Map([["P1", "a"], ["P4", "b"]]), reserved: new Map(), forbidden: F });
check(both?.seat1 === "P1" && both.seat2 === "P4" && !both.moved1 && !both.moved2, "оба на своих местах, если они не мешают");

// сидят рядом (1–5 и 11–15) — пересаживаем только одного
const near = chooseSeats({ team1: "a", team2: "b", last: new Map([["a", "P1"], ["b", "P3"]]), occupied: new Map([["P1", "a"], ["P3", "b"]]), reserved: new Map(), forbidden: F });
check(!!near && Number(near.moved1) + Number(near.moved2) === 1, "соседей пересаживаем, но только одну команду");
check(!!near && !F.has(pairKey(near.seat1, near.seat2)), "после пересадки соперники далеко");

// место ждущей команды занимаем только если других нет
const res = chooseSeats({ team1: "a", team2: "b", last: new Map(), occupied: new Map(), reserved: new Map([["P3", "w"], ["S1", "w2"]]), forbidden: F });
check(!!res && res.seat1 !== "P3" && res.seat2 !== "S1" && res.seat1 !== "S1" && res.seat2 !== "P3", "места ждущих команд не занимаем без нужды");

// блоки вне игры (31–36, 42–47): туда не сажаем; 8 блоков в игре вмещают 4 матча сразу с запретами по умолчанию
{
  const off = parseOff("");
  check(off.has("S1") && off.has("S3") && !off.has("S2") && !off.has("S4") && parseOff("none").size === 0, "по умолчанию не используются 31–36 и 42–47");
  const occupied = new Map<string, string>();
  let seated = 0;
  for (let i = 0; i < 4; i++) {
    const r = chooseSeats({ team1: `a${i}`, team2: `b${i}`, last: new Map(), occupied, reserved: new Map(), forbidden: F, off });
    if (!r) break;
    check(!off.has(r.seat1) && !off.has(r.seat2) && !F.has(pairKey(r.seat1, r.seat2)), `матч ${i + 1}: ${r.seat1}–${r.seat2} — блоки в игре, пара разрешена`);
    occupied.set(r.seat1, `a${i}`);
    occupied.set(r.seat2, `b${i}`);
    seated++;
  }
  check(seated === 4, `4 матча сразу на 8 блоках (рассажено ${seated})`);
}

if (failed) {
  console.error(`\n${failed} проверок не прошли`);
  process.exit(1);
}
console.log("\nРассадка в порядке");
