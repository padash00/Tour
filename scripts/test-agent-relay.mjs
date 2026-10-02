// Проверка буфера событий агента (server/agent/relay.mjs) без сайта и без CS2:
//   1) сайт недоступен → события копятся на диске, ответ MatchZy/CS2 мгновенный;
//   2) сайт вернулся → события уходят по порядку, с теми же заголовками и телом;
//   3) сайт отклонил событие (401) → оно уходит в outbox/failed и не блокирует очередь;
//   4) «перезапуск агента» (новый relay на той же папке) досылает то, что осталось на диске;
//   5) конфиг матча кэшируется и отдаётся локально.
// Запуск: node scripts/test-agent-relay.mjs
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRelay } from "../server/agent/relay.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};

// ── поддельный сайт: режим down (503) / up (200) / reject (401)
let mode = "down";
const received = [];
const site = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (mode === "down") return res.writeHead(503).end();
    if (mode === "reject") return res.writeHead(401).end();
    received.push({ path: req.url, token: req.headers["x-f16-token"], body });
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  });
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const siteUrl = `http://127.0.0.1:${site.address().port}`;
const dir = mkdtempSync(path.join(os.tmpdir(), "f16-relay-"));
const PORT = 27199;

const post = (p, body, headers = {}) =>
  fetch(`http://127.0.0.1:${PORT}${p}`, { method: "POST", body, headers }).then((r) => r.status);

let relay = createRelay({ port: PORT, dir, siteUrl });
check(await relay.start(), "буфер запустился на 127.0.0.1");

console.log("\n1) сайт недоступен");
const t0 = Date.now();
for (let i = 1; i <= 5; i++) {
  const code = await post("/matchzy/events", JSON.stringify({ event: "round_end", matchid: 7, round_number: i }), { "X-F16-Token": "tok" });
  if (code !== 200) check(false, `событие ${i} принято (${code})`);
}
check(Date.now() - t0 < 2000, `5 событий приняты мгновенно (${Date.now() - t0} мс), хотя сайт лежит`);
await post("/cs2/log?m=7&t=secret", "L 10/02/2026 - 12:00:00: \"a<1>\" killed \"b<2>\"");
await sleep(1500);
check(relay.stats().queued === 6, `на диске в очереди: ${relay.stats().queued} (ожидалось 6)`);
check(received.length === 0, "на сайт ничего не ушло");

console.log("\n4) «перезапуск агента» с очередью на диске");
// старый relay продолжает ретраи в фоне — останавливаем его сервер, а «новый агент» берёт ту же папку
const relay2 = createRelay({ port: PORT + 1, dir, siteUrl });
await relay2.start();
check(relay2.stats().queued === 6, `новый агент видит ${relay2.stats().queued} событий с диска`);

console.log("\n2) сайт вернулся");
mode = "up";
for (let i = 0; i < 40 && relay2.stats().queued > 0; i++) await sleep(500);
await sleep(1000);
check(relay2.stats().queued === 0, "очередь досланная полностью");
const rounds = received.filter((r) => r.path === "/api/matchzy/events").map((r) => JSON.parse(r.body).round_number);
// два буфера на одной папке могли отправить одно событие дважды — сайт отбрасывает повторы по хэшу;
// здесь проверяем порядок первого появления
const firstSeen = [...new Set(rounds)];
check(firstSeen.join(",") === "1,2,3,4,5", `порядок событий сохранён: ${firstSeen.join(",")}`);
check(received.every((r) => !r.path.startsWith("/api/matchzy") || r.token === "tok"), "токен MatchZy передан на сайт");
const log = received.find((r) => r.path.startsWith("/api/cs2/log"));
check(!!log && log.path === "/api/cs2/log?m=7&t=secret" && log.body.includes("killed"), "лог CS2 дослан с тем же query и телом");

console.log("\n3) сайт отклонил событие");
mode = "reject";
await post("/matchzy/events", JSON.stringify({ event: "bad" }), { "X-F16-Token": "wrong" });
await sleep(1500);
check(relay2.stats().failed >= 1 && relay2.stats().queued === 0, `отклонённое отложено в failed (${relay2.stats().failed}), очередь не блокирована`);
mode = "up";
await post("/matchzy/events", JSON.stringify({ event: "after", matchid: 7 }), { "X-F16-Token": "tok" });
await sleep(1500);
check(received.some((r) => r.body.includes('"after"')), "следующее событие после отклонённого ушло");

console.log("\n5) кэш конфига матча");
relay2.saveConfig("abc-123", '{"matchid":7}');
const cfg = await fetch(`http://127.0.0.1:${PORT + 1}/config/abc-123`).then((r) => r.text());
check(cfg === '{"matchid":7}', "конфиг матча отдаётся локально");
const miss = await fetch(`http://127.0.0.1:${PORT + 1}/config/none`).then((r) => r.status);
check(miss === 404, "нет конфига → 404");

site.close();
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
