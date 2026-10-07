// Буфер событий агента: матчи не ждут друг друга, сбойное событие откладывается, обрыв связи — нет.
//   1) сайт отвечает 500 на события матча 7 — события матча 8 и лог уходят сразу;
//   2) после N попыток и срока событие матча 7 уходит в outbox/failed, отчёт показывает число и возраст;
//   3) replay_failed_events возвращает отложенные в очередь, и они доходят;
//   4) сайт недоступен вовсе (обрыв) — ничего не откладывается, сколько бы ни длилось.
// Запуск: node scripts/test-agent-relay-park.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRelay, laneOf, laneOfFile } from "../server/agent/relay.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(50);
  }
  return cond();
};

let broken = true;
const received = [];
const site = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const matchid = req.url.startsWith("/api/matchzy") ? JSON.parse(body).matchid : null;
    if (broken && matchid === 7) return res.writeHead(500).end();
    received.push({ path: req.url, body });
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  });
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const siteUrl = `http://127.0.0.1:${site.address().port}`;
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "f16-relay-park-"));
  dirs.push(d);
  return d;
};
const post = (port, p, body) => fetch(`http://127.0.0.1:${port}${p}`, { method: "POST", body, headers: { "X-F16-Token": "tok" } }).then((r) => r.status);

try {
  assert.equal(laneOf({ path: "/api/matchzy/events", body: '{"matchid":7}' }), "mz7");
  assert.equal(laneOf({ path: "/api/cs2/log?m=7&sig=abc", body: "" }), "log7");
  assert.equal(laneOf({ path: "/api/matchzy/events", body: "not json" }), "mzx");
  assert.equal(laneOfFile("000001700000000-000001-mz7.json"), "mz7");
  assert.equal(laneOfFile("000001700000000-000001.json"), "legacy");
  console.log("✓ events are split into per-match lanes (legacy files keep one lane)");

  const PORT = 27299;
  const relay = createRelay({ port: PORT, dir: tmp(), siteUrl, parkAfterMs: 400, parkAfterAttempts: 3, retryMaxMs: 100, idleMs: 100 });
  assert.equal(await relay.start(), true);
  for (let i = 1; i <= 2; i++) await post(PORT, "/matchzy/events", JSON.stringify({ event: "round_end", matchid: 7, round_number: i }));
  for (let i = 1; i <= 3; i++) await post(PORT, "/matchzy/events", JSON.stringify({ event: "round_end", matchid: 8, round_number: i }));
  await post(PORT, "/cs2/log?m=7&sig=abc", "L killed");

  assert.ok(await until(() => received.filter((r) => r.body.includes('"matchid":8')).length === 3, 3000), "match 8 delivered while match 7 fails");
  assert.ok(await until(() => received.some((r) => r.path.startsWith("/api/cs2/log")), 3000), "log lane of match 7 is not blocked by its event lane");
  const rounds8 = received.filter((r) => r.body.includes('"matchid":8')).map((r) => JSON.parse(r.body).round_number);
  assert.deepEqual(rounds8, [1, 2, 3]);
  console.log("✓ a failing match does not block other matches or its own HTTP log");

  assert.ok(await until(() => relay.stats().failed === 2 && relay.stats().queued === 0, 8000), `parked: ${JSON.stringify(relay.stats())}`);
  await sleep(1100);
  const st = relay.stats();
  assert.ok(st.failed_oldest_age_s >= 1, `oldest failed age reported (${st.failed_oldest_age_s})`);
  assert.equal(received.filter((r) => r.body.includes('"matchid":7')).length, 0);
  console.log(`✓ repeatedly failing events are parked after attempts + time (failed ${st.failed}, oldest ${st.failed_oldest_age_s} s)`);

  broken = false;
  assert.equal(relay.replayFailed(), 2);
  assert.ok(await until(() => received.filter((r) => r.body.includes('"matchid":7')).length === 2, 3000));
  assert.deepEqual(received.filter((r) => r.body.includes('"matchid":7')).map((r) => JSON.parse(r.body).round_number), [1, 2]);
  assert.equal(relay.stats().failed, 0);
  console.log("✓ replay returns parked events to the queue in their original order");

  const offline = createRelay({ port: PORT + 1, dir: tmp(), siteUrl: "http://127.0.0.1:9", parkAfterMs: 200, parkAfterAttempts: 2, retryMaxMs: 100, idleMs: 100 });
  await offline.start();
  await post(PORT + 1, "/matchzy/events", JSON.stringify({ event: "round_end", matchid: 9 }));
  await sleep(1500);
  assert.equal(offline.stats().failed, 0);
  assert.equal(offline.stats().queued, 1);
  console.log("✓ an unreachable site (internet outage) never parks events");
} finally {
  site.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log("\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(0);
