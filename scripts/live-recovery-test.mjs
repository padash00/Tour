// Живой тест автоподъёма сервера и буфера событий на серверном ПК (настоящий агент не затрагивается):
//   - поддельный «сайт» на localhost, отдельный тестовый агент (F16_AGENT_CONFIG / F16_STATE_DIR / F16_ONLY=CS2-01);
//   - матч грузится на CS2-01 через буфер агента (конфиг из локального кэша, события MatchZy → буфер → «сайт»);
//   - css_start → матч live → убиваем cs2.exe → агент сам поднимает сервер, грузит матч и восстанавливает раунд;
//   - уборка: end_match, CS2-01 выключается, тестовые бэкапы MatchZy удаляются.
// Запуск на серверном ПК: node scripts/live-recovery-test.mjs
import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { a2sInfo, rcon } from "../server/agent/lib.mjs";

const SERVER_DIR = "D:\\cs2server";
const PW = JSON.parse(readFileSync(path.join(SERVER_DIR, "f16-secrets.json"), "utf8").replace(/^\uFEFF/, "")).rcon;
const PORT = 27015;
const MATCHID = 990001;
const BACKUP_DIR = path.join(SERVER_DIR, "game", "csgo", "MatchZyDataBackup");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✕"} ${what}`);
  if (!ok) failed++;
};
const g5 = async () => {
  const o = await rcon(PORT, PW, "get5_status").catch(() => null);
  try {
    return o ? JSON.parse(o.slice(o.indexOf("{"))) : null;
  } catch {
    return null;
  }
};
const waitFor = async (fn, ms, step = 2000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
};

// ── поддельный сайт
const queue = [];
const acks = [];
const syncEvents = [];
const mzEvents = [];
let logBatches = 0; // пачки HTTP-лога CS2, дошедшие через буфер
const config = {
  matchid: MATCHID,
  team1: { name: "Recovery A", tag: "RA", players: {} },
  team2: { name: "Recovery B", tag: "RB", players: {} },
  num_maps: 1,
  maplist: ["de_mirage"],
  map_sides: ["team1_ct"],
  skip_veto: true,
  clinch_series: true,
  players_per_team: 1,
  min_players_to_ready: 1,
  wingman: false,
  min_spectators_to_ready: 0,
  spectators: { players: {} },
  cvars: { mp_maxrounds: 24 },
};
const site = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (o) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(o));
    if (req.url === "/api/agent/sync") {
      const b = JSON.parse(body);
      for (const e of b.events ?? []) syncEvents.push(e);
      return json({ commands: queue.splice(0) });
    }
    if (req.url === "/api/agent/ack") {
      acks.push(JSON.parse(body));
      return json({ ok: true });
    }
    if (req.url?.startsWith("/api/matchzy/config/")) return json(config);
    if (req.url === "/api/matchzy/events") {
      mzEvents.push(JSON.parse(body).event);
      return json({ ok: true });
    }
    if (req.url?.startsWith("/api/cs2/log")) {
      logBatches++;
      return json({ ok: true });
    }
    res.writeHead(404).end();
  });
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const siteUrl = `http://127.0.0.1:${site.address().port}`;

// ── тестовый агент
const state = mkdtempSync(path.join(os.tmpdir(), "f16-agent-test-"));
writeFileSync(path.join(state, "agent.json"), JSON.stringify({ siteUrl, token: "t", lanIp: "127.0.0.1", relayPort: 27098 }));
const agentLog = path.join(state, "agent.log");
const agent = spawn(process.execPath, ["server/agent/agent.mjs"], {
  env: { ...process.env, F16_AGENT_CONFIG: path.join(state, "agent.json"), F16_STATE_DIR: state, F16_ONLY: "CS2-01" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const out = createWriteStream(agentLog);
agent.stdout.pipe(out);
agent.stderr.pipe(out);
const cmd = (type, payload = {}) => {
  const id = randomUUID();
  queue.push({ id, instance: "CS2-01", type, payload });
  return id;
};
const ack = (id, ms) => waitFor(() => acks.find((a) => a.id === id), ms, 1000);

try {
  console.log("1) CS2-01 запущен, тестовый агент на связи");
  const started = await ack(cmd("start"), 60_000);
  check(!!started, "команда start выполнена");
  check(!!(await waitFor(async () => (await a2sInfo(PORT))?.map, 120_000)), "CS2-01 отвечает");

  console.log("\n2) загрузка матча через буфер агента");
  const loadId = cmd("load_match", {
    match_id: "rectest",
    matchzy_id: MATCHID,
    url: `${siteUrl}/api/matchzy/config/rectest`,
    header_key: "X-F16-Token",
    header_value: "tok",
    events_url: `${siteUrl}/api/matchzy/events`,
    log_url: `${siteUrl}/api/cs2/log?m=${MATCHID}&t=tok`,
    post_cmds: [],
    enforce: null,
  });
  const loaded = await ack(loadId, 90_000);
  check(!!loaded?.ok, `load_match: ${loaded?.result}`);
  check(/буфер агента/.test(loaded?.result ?? "") && /кэша/.test(loaded?.result ?? ""), "события идут через буфер, конфиг из локального кэша");
  check(!!(await waitFor(async () => (await g5())?.matchid === MATCHID, 60_000)), `MatchZy загрузил матч ${MATCHID}`);

  console.log("\n3) старт матча и события через буфер");
  await rcon(PORT, PW, "css_start").catch(() => {});
  check(!!(await waitFor(async () => ["going_live", "live"].includes((await g5())?.gamestate), 60_000)), "матч live");
  check(!!(await waitFor(() => mzEvents.includes("going_live"), 60_000)), `событие going_live дошло через буфер (события: ${mzEvents.join(", ")})`);
  const backup = await waitFor(() => readdirSync(BACKUP_DIR).some((f) => f.startsWith(`matchzy_${MATCHID}_0_round`)), 90_000);
  check(!!backup, "MatchZy пишет бэкап раунда");
  await sleep(12_000); // агент должен увидеть live (тик 5 с)

  console.log("\n4) падение сервера → автоподъём");
  await new Promise((r) =>
    execFile(
      "powershell",
      ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='cs2.exe'" | ? { $_.CommandLine -match '-port ${PORT}(\\s|$)' } | % { Stop-Process -Id $_.ProcessId -Force }`],
      { windowsHide: true },
      r,
    ),
  );
  console.log("   cs2.exe CS2-01 убит, ждём агента…");
  const ev = await waitFor(() => syncEvents.find((e) => e.instance === "CS2-01" && e.type !== "recovery_started"), 300_000, 3000);
  check(ev?.type === "recovered", `агент сообщил: ${ev?.type ?? "ничего"} — ${ev?.detail ?? ""}`);
  const after = await g5();
  console.log(`   пачек HTTP-лога CS2 через буфер: ${logBatches}`);
  check(after?.matchid === MATCHID, `после подъёма на сервере снова матч ${after?.matchid} (${after?.gamestate})`);
  check(/восстановлен раунд/.test(ev?.detail ?? "") && !/не удалось/.test(ev?.detail ?? ""), "восстановлен последний раунд из бэкапа MatchZy");
} catch (e) {
  check(false, `тест упал: ${e.message}`);
} finally {
  console.log("\n5) уборка");
  const endId = cmd("end_match");
  await ack(endId, 60_000);
  const stopId = cmd("stop");
  await ack(stopId, 60_000);
  agent.kill();
  site.close();
  for (const f of readdirSync(BACKUP_DIR)) if (f.startsWith(`matchzy_${MATCHID}_`)) unlinkSync(path.join(BACKUP_DIR, f));
  console.log(`   журнал тестового агента:\n${existsSync(agentLog) ? readFileSync(agentLog, "utf8").split("\n").map((l) => "     " + l).join("\n") : ""}`);
  rmSync(state, { recursive: true, force: true });
  check(!(await a2sInfo(PORT)), "CS2-01 выключен");
  check(!readdirSync(BACKUP_DIR).some((f) => f.startsWith(`matchzy_${MATCHID}_`)), "тестовые бэкапы удалены");
}
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failed ? 1 : 0);
