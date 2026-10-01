// F16 Server Agent — работает на серверном ПК.
// Сам устанавливает исходящее HTTPS-соединение с сайтом (входящие из интернета не нужны):
// раз в 5 секунд отправляет состояние инстансов CS2 и получает команды.
//
// Конфиг: D:\cs2server\f16\agent.json  { "siteUrl": "...", "token": "...", "lanIp": "192.168.0.159" }
// Запуск:  node agent.mjs   (или D:\cs2server\F16-agent.bat)

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { a2sInfo, rcon } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = process.env.F16_SERVER_DIR ?? "D:\\cs2server";
const F16_DIR = path.join(SERVER_DIR, "f16");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

const config = readJson(path.join(F16_DIR, "agent.json"));
const secrets = readJson(path.join(SERVER_DIR, "f16-secrets.json"));
const instancesCsv = existsSync(path.join(F16_DIR, "instances.csv"))
  ? path.join(F16_DIR, "instances.csv")
  : path.join(here, "..", "instances.csv");
const INSTANCES = readFileSync(instancesCsv, "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => {
    const [name, port, role] = l.split(",");
    return { name, port: Number(port), role };
  });
const START_PS1 = path.join(F16_DIR, "start.ps1");
const INTERVAL_MS = 5000;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ───────────────────────── состояние

function listCs2Processes() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='cs2.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 10000 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        try {
          const v = JSON.parse(stdout);
          resolve(Array.isArray(v) ? v : [v]);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

let hostInfo = {};
let hostInfoAt = 0;

function diskFreeGb() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-Command", `(Get-PSDrive ${SERVER_DIR[0]}).Free`],
      { windowsHide: true, timeout: 10000 },
      (err, out) => resolve(err ? null : Math.round(Number(out.trim()) / 1e9)),
    );
  });
}

async function collectHostInfo() {
  if (Date.now() - hostInfoAt < 60_000) return hostInfo;
  const manifest = path.join(SERVER_DIR, "steamapps", "appmanifest_730.acf");
  const build = existsSync(manifest) ? /"buildid"\s+"(\d+)"/.exec(readFileSync(manifest, "utf8"))?.[1] : null;
  const load = os.loadavg()[0]; // на Windows всегда 0 — считаем по cpu times
  const cpus = os.cpus();
  const idle = cpus.reduce((a, c) => a + c.times.idle, 0);
  const total = cpus.reduce((a, c) => a + Object.values(c.times).reduce((x, y) => x + y, 0), 0);
  const prev = hostInfo._cpu;
  const cpuLoad = prev ? Math.round(100 * (1 - (idle - prev.idle) / (total - prev.total))) : null;
  hostInfo = {
    _cpu: { idle, total },
    cpu_load: cpuLoad ?? (load || null),
    ram_total_gb: Math.round(os.totalmem() / 1e9),
    ram_used_gb: Math.round((os.totalmem() - os.freemem()) / 1e9),
    disk_free_gb: await diskFreeGb(),
    cs2_build: build,
    hostname: os.hostname(),
    agent_version: "1.0.0",
  };
  hostInfoAt = Date.now();
  return hostInfo;
}

async function collectInstances() {
  const procs = await listCs2Processes();
  return Promise.all(
    INSTANCES.map(async (inst) => {
      const running = procs.some((p) => new RegExp(`-port ${inst.port}(\\s|$)`).test(p.CommandLine ?? ""));
      if (!running) return { name: inst.name, running: false };
      const [info, status] = await Promise.all([
        a2sInfo(inst.port),
        rcon(inst.port, secrets.rcon, "get5_status").catch(() => null),
      ]);
      let get5 = null;
      try {
        get5 = status ? JSON.parse(status.slice(status.indexOf("{"))) : null;
      } catch {}
      return {
        name: inst.name,
        running: true,
        map: info?.map ?? null,
        players: info?.players ?? null,
        get5: get5 && { gamestate: get5.gamestate, matchid: get5.matchid, map_number: get5.map_number },
      };
    }),
  );
}

// ───────────────────────── команды

function runStartScript(name, stop) {
  // Без перехвата вывода: cs2.exe, запущенный через Start-Process, унаследовал бы наши pipe'ы
  // и держал их открытыми, и агент ждал бы вечно. Ждём только код выхода PowerShell.
  return new Promise((resolve) => {
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", START_PS1, "-Name", name];
    if (stop) args.push("-Stop");
    const p = spawn("powershell", args, { windowsHide: true, stdio: "ignore" });
    p.on("error", (e) => resolve({ ok: false, result: e.message }));
    p.on("exit", (code) => resolve({ ok: code === 0, result: `${stop ? "stop" : "start"} ${name}: exit ${code}` }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execute(cmd) {
  const inst = INSTANCES.find((i) => i.name === cmd.instance);
  if (!inst) return { ok: false, result: `unknown instance ${cmd.instance}` };
  const q = (s) => `"${String(s).replace(/"/g, "")}"`;

  switch (cmd.type) {
    case "start":
      return runStartScript(inst.name, false);
    case "stop":
      return runStartScript(inst.name, true);
    case "restart": {
      await runStartScript(inst.name, true);
      await sleep(3000);
      return runStartScript(inst.name, false);
    }
    case "load_match": {
      const { url, header_key, header_value, events_url } = cmd.payload;
      // на случай, если на сервере остался старый матч
      await rcon(inst.port, secrets.rcon, "get5_endmatch").catch(() => {});
      const out = await rcon(inst.port, secrets.rcon, `matchzy_loadmatch_url ${q(url)} ${q(header_key)} ${q(header_value)}`);
      // загрузка матча сбрасывает настройки отправки событий — выставляем после неё, в кавычках
      await sleep(2500);
      for (const c of [
        `matchzy_remote_log_url ${q(events_url)}`,
        `matchzy_remote_log_header_key ${q(header_key)}`,
        `matchzy_remote_log_header_value ${q(header_value)}`,
      ]) {
        await rcon(inst.port, secrets.rcon, c).catch(() => {});
      }
      return { ok: true, result: (out.trim() || "loadmatch sent") + " · events → site" };
    }
    case "end_match":
      return { ok: true, result: (await rcon(inst.port, secrets.rcon, "get5_endmatch")).trim() || "ended" };
    case "rcon":
      return { ok: true, result: (await rcon(inst.port, secrets.rcon, String(cmd.payload.command))).trim() };
    default:
      return { ok: false, result: `unknown command ${cmd.type}` };
  }
}

// ───────────────────────── связь с сайтом

async function api(pathname, body) {
  const res = await fetch(`${config.siteUrl}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${pathname} → HTTP ${res.status}`);
  return res.json();
}

let failures = 0;

async function tick() {
  const [info, instances] = await Promise.all([collectHostInfo(), collectInstances()]);
  const publicInfo = Object.fromEntries(Object.entries(info).filter(([k]) => k !== "_cpu"));
  const { commands } = await api("/api/agent/sync", { lan_ip: config.lanIp, info: publicInfo, instances });
  for (const cmd of commands ?? []) {
    log("cmd", cmd.type, cmd.instance ?? "");
    let r;
    try {
      r = await Promise.race([
        execute(cmd),
        sleep(60_000).then(() => ({ ok: false, result: "timeout 60s" })),
      ]);
    } catch (e) {
      r = { ok: false, result: String(e?.message ?? e) };
    }
    log(r.ok ? "  ok" : "  fail", r.result.slice(0, 200));
    await api("/api/agent/ack", { id: cmd.id, ...r }).catch((e) => log("ack failed", e.message));
  }
}

log(`F16 Server Agent → ${config.siteUrl} · инстансов: ${INSTANCES.length} · LAN ${config.lanIp}`);
for (;;) {
  try {
    await tick();
    if (failures) log("связь восстановлена");
    failures = 0;
  } catch (e) {
    failures++;
    if (failures === 1 || failures % 12 === 0) log("ошибка связи:", e.message);
  }
  await sleep(INTERVAL_MS);
}
