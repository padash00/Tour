// Проверка защит действий игроков (без изменения данных, кроме временной записи в audit_logs):
// - определение картинки по содержимому (логотип команды): PNG/JPEG/WEBP да, подделка — нет;
// - окно check-in: до открытия / после закрытия — ошибка, внутри и без дат — можно;
// - ограничение частоты по журналу действий (audit_logs).
// Запуск: NODE_OPTIONS=--conditions=react-server npx tsx scripts/test-player-guards.mts
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const { sniffImage, checkinWindowError, isRateLimited } = await import("../src/lib/data");
const { db } = await import("../src/lib/supabase");

let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};
const b = (...xs: number[]) => new Uint8Array([...xs, ...Array(16).fill(0)]);

console.log("Логотип по содержимому:");
check(sniffImage(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) === "image/png", "PNG");
check(sniffImage(b(0xff, 0xd8, 0xff, 0xe0)) === "image/jpeg", "JPEG");
check(sniffImage(b(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)) === "image/webp", "WEBP");
check(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")) === null, "SVG/HTML под видом картинки — отклоняется");
check(sniffImage(new TextEncoder().encode("MZ\x90\x00 exe")) === null, "исполняемый файл — отклоняется");
check(sniffImage(new Uint8Array()) === null, "пустой файл — отклоняется");

console.log("Окно check-in:");
const h = 3600_000;
const now = Date.now();
check(checkinWindowError({ checkin_opens_at: null, checkin_closes_at: null }) === null, "без дат — можно");
check(checkinWindowError({ checkin_opens_at: new Date(now + h).toISOString(), checkin_closes_at: null }) !== null, "до открытия — нельзя");
check(checkinWindowError({ checkin_opens_at: null, checkin_closes_at: new Date(now - h).toISOString() }) !== null, "после закрытия — нельзя");
check(
  checkinWindowError({ checkin_opens_at: new Date(now - h).toISOString(), checkin_closes_at: new Date(now + h).toISOString() }) === null,
  "внутри окна — можно",
);

console.log("Ограничение частоты:");
const { data: p } = await db().from("players").insert({ steam_id: "76561199000000991", nickname: "guard_test" }).select("id").single();
try {
  check(!(await isRateLimited(p!.id, "test.guard", 5)), "первое действие — можно");
  await db().from("audit_logs").insert({ actor_id: p!.id, action: "test.guard" });
  check(await isRateLimited(p!.id, "test.guard", 5), "повтор сразу — ограничено");
  check(!(await isRateLimited(p!.id, "test.other", 5)), "другое действие — не ограничено");
} finally {
  await db().from("audit_logs").delete().eq("actor_id", p!.id);
  await db().from("players").delete().eq("id", p!.id);
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
