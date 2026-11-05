// Фильтр общего Telegram-чата: мат с маскировкой, казахский, оскорбления, ссылки — и отсутствие ложных срабатываний.
// Запуск: npx tsx scripts/test-tg-moderation.mts
import { findViolation, parseDuration, punishmentFor } from "../src/lib/tg-moderation-core";

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};
const kind = (t: string) => findViolation(t)?.kind ?? null;

const mat = ["ну ты и сука", "бля, опять лагает", "это пиздец", "иди нахуй", "Xуй знает", "х*й", "п*зда", "х у й", "х.у.й", "заебал уже", "долбоёб", "ебать ты", "уебок", "пидор", "блядь", "бляяяять", "мудак", "сигейин", "анаңды сігейін", "қотақ", "blyat", "suka", "pizdec", "nahui", "fuck you", "shit happens",
  // маскировка, которой обходили бота
  "п!зда", "пезда", "писда", "пи$да", "ссука", "сцука", "сюка", "cyka", "бл@ть", "бл ять", "х уй", "п изда", "е бать", "ибать", "йобаный", "ёпта", "x y й", "пздц", "отъебись", "нах", "пох", "нахер", "блэт", "блеать", "fck", "f*ck", "пи*да", "е*ать", "б**ть", "х​уй", "Ьляяяяяяяяяя", "ъля", "ьлять"];
for (const t of mat) check(kind(t) === "mat", `мат: «${t}»`);

const clean = ["себе", "небо", "и бал", "на хату", "ипотека", "ибо", "подъезд", "объект", "съел", "отъезд", "псд файл", "спс дружище", "кс го", "скинь psd", "ссора", "похоже", "нахожу", "привет!как дела", "епископ", "блеск", "скипидар", "спидран", "хлеб", "колыбель", 
  "себе возьму", "небо голубое", "требовать замену", "сигнал пропал", "сигарета", "оскорблять нельзя", "ebay", "home sweet home",
  "хлеба купи", "учебник", "психуй меньше", "страхуй тиммейта", "сукно", "мудрый ход", "командир", "ребята го лобби", "небось успеем",
  "т.е. завтра", "и т.д.", "регистрация до 13.11", "сайт tournament.f16-arena.kz", "https://steamcommunity.com/id/test", "наш чат t.me/f16arena_cs2",
  "faceit.com/ru/players/abc", "Привет всем, ищем еще одного игрока", "застрахуй", "ахахах", "хулиган", "одобрили заявку", "дебют", "в команде сколько эло в среднем? 2100-2200?", "Всем здарова", "спидран", "всё кончено", "игра кончена", "спидометр", "командование", "рекомендую", "сигма", "скотина",
];
for (const t of clean) check(kind(t) === null, `чисто: «${t}»`);

check(kind("ты дебил") === "insult", "оскорбление: дебил");
check(kind("ну ты лох") === "insult", "оскорбление: лох");
check(kind("заходите t.me/cheapskins") === "link", "чужой t.me — реклама");
check(kind("скины дёшево https://skins-cheap.ru") === "link", "чужой сайт — реклама");

check(punishmentFor(1).action === "warn" && punishmentFor(2).action === "warn", "1–2 — предупреждение");
check(punishmentFor(3).seconds === 3600 && punishmentFor(4).seconds === 86_400 && punishmentFor(5).action === "ban", "3 — мут 1 ч, 4 — 24 ч, 5 — бан");
check(parseDuration("30m") === 1800 && parseDuration("2h") === 7200 && parseDuration("1d") === 86_400 && parseDuration("15") === 900 && parseDuration("abc") === null, "длительность мута");

if (failed) {
  console.error(`\n${failed} moderation checks failed`);
  process.exit(1);
}
console.log("\nmoderation checks passed");
