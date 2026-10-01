// F16 Server Agent — работает на серверном ПК.
// Сам устанавливает исходящее HTTPS-соединение с сайтом (входящие из интернета не нужны):
// раз в 5 секунд отправляет состояние инстансов CS2 и получает команды.
//
// Конфиг: D:\cs2server\f16\agent.json  { "siteUrl": "...", "token": "...", "lanIp": "192.168.0.159" }
// Запуск:  node agent.mjs   (или D:\cs2server\F16-agent.bat)

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { a2sInfo, rcon } from "./lib.mjs";
import { applyBundle, cs2Build, localBundleVersion, prefetchMaps, readVersions, restartAll, updateCs2, updatePlugins } from "./maintenance.mjs";

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
const STEAMCMD_DIR = config.steamcmdDir ?? "D:\\SteamCMD";
let busy = null; // долгая команда обслуживания, которая сейчас выполняется

// настройки режима, которые надо держать на инстансе весь матч: { [instance]: { matchid, cvars } }
const ENFORCE_FILE = path.join(F16_DIR, "enforce.json");
let enforce = {};
try {
  enforce = JSON.parse(readFileSync(ENFORCE_FILE, "utf8"));
} catch {}
const saveEnforce = () => writeFileSync(ENFORCE_FILE, JSON.stringify(enforce));

async function enforceCvars(inst, get5) {
  const rule = enforce[inst.name];
  if (!rule) return;
  const active = get5 && get5.matchid === rule.matchid && ["warmup", "knife", "waiting_for_knife_decision", "going_live", "live"].includes(get5.gamestate);
  if (!active) {
    if (!get5 || get5.gamestate === "none" || get5.matchid !== rule.matchid) {
      delete enforce[inst.name];
      saveEnforce();
    }
    return;
  }
  const names = Object.keys(rule.cvars);
  const out = await rcon(inst.port, secrets.rcon, names.join(";")).catch(() => "");
  const fix = names.filter((n) => {
    const m = new RegExp(`${n} = ([\\d.]+)`).exec(out);
    return m && Number(m[1]) !== Number(rule.cvars[n]);
  });
  if (fix.length) {
    await rcon(inst.port, secrets.rcon, fix.map((n) => `${n} ${rule.cvars[n]}`).join(";")).catch(() => {});
    log(`enforce ${inst.name}: ${fix.map((n) => `${n}=${rule.cvars[n]}`).join(" ")}`);
  }
}
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
  const build = cs2Build(SERVER_DIR);
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
    agent_version: localBundleVersion(F16_DIR),
    versions: readVersions(F16_DIR),
  };
  hostInfoAt = Date.now();
  return { ...hostInfo, busy };
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
      await enforceCvars(inst, get5).catch(() => {});
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

const maintenanceCtx = () => ({
  f16Dir: F16_DIR,
  serverDir: SERVER_DIR,
  steamcmdDir: STEAMCMD_DIR,
  instances: INSTANCES,
  startPs1: START_PS1,
  rcon,
  a2sInfo,
  rconPassword: secrets.rcon,
});
const HOST_COMMANDS = { update_cs2: updateCs2, update_plugins: updatePlugins, restart_all: restartAll, prefetch_maps: prefetchMaps };

/** Долгие команды обслуживания выполняются в фоне, агент продолжает отчитываться сайту */
function runHostCommand(cmd) {
  if (busy) return api("/api/agent/ack", { id: cmd.id, ok: false, result: `агент занят: ${busy}` }).catch(() => {});
  busy = cmd.type;
  hostInfoAt = 0;
  log("maintenance start", cmd.type);
  HOST_COMMANDS[cmd.type](maintenanceCtx(), cmd.payload)
    .then((result) => ({ ok: true, result }))
    .catch((e) => ({ ok: false, result: String(e?.message ?? e) }))
    .then(async (r) => {
      busy = null;
      hostInfoAt = 0;
      log("maintenance", r.ok ? "ok" : "fail", r.result);
      await api("/api/agent/ack", { id: cmd.id, ...r }).catch((e) => log("ack failed", e.message));
    });
}

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
      const { url, header_key, header_value, events_url, log_url, post_cmds = [], enforce: rule = null } = cmd.payload;
      if (rule) enforce[inst.name] = rule;
      else delete enforce[inst.name];
      saveEnforce();
      // на случай, если на сервере остался старый матч
      await rcon(inst.port, secrets.rcon, "get5_endmatch").catch(() => {});
      const out = await rcon(inst.port, secrets.rcon, `matchzy_loadmatch_url ${q(url)} ${q(header_key)} ${q(header_value)}`);
      // загрузка матча сбрасывает настройки отправки событий — выставляем после неё, в кавычках
      await sleep(2500);
      for (const c of [
        `matchzy_remote_log_url ${q(events_url)}`,
        `matchzy_remote_log_header_key ${q(header_key)}`,
        `matchzy_remote_log_header_value ${q(header_value)}`,
        // HTTP-лог CS2 для Swing: каждое убийство, плент, дефьюз и конец раунда
        "logaddress_delall_http",
        ...(log_url ? [`logaddress_add_http ${q(log_url)}`] : []),
        // настройки MatchZy из турнира (без кавычек — int-convar'ы)
        ...post_cmds.filter((c) => /^matchzy_[a-z_]+ \d+$/.test(c)),
      ]) {
        await rcon(inst.port, secrets.rcon, c).catch(() => {});
      }
      return { ok: true, result: (out.trim() || "loadmatch sent") + " · events → site" };
    }
    case "end_match": {
      await rcon(inst.port, secrets.rcon, "logaddress_delall_http").catch(() => {});
      return { ok: true, result: (await rcon(inst.port, secrets.rcon, "get5_endmatch")).trim() || "ended" };
    }
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
  const { commands, bundle_version } = await api("/api/agent/sync", { lan_ip: config.lanIp, info: publicInfo, instances });

  // на сайте новая версия агента/скриптов/конфигов → обновляемся и перезапускаемся (F16-agent.bat поднимет снова)
  if (!busy && bundle_version && bundle_version !== localBundleVersion(F16_DIR)) {
    const r = await applyBundle({ siteUrl: config.siteUrl, token: config.token, f16Dir: F16_DIR, serverDir: SERVER_DIR });
    log(`обновление агента ${localBundleVersion(F16_DIR)}: ${r.count} файлов, перезапуск`);
    process.exit(0);
  }

  for (const cmd of commands ?? []) {
    if (cmd.type in HOST_COMMANDS) {
      runHostCommand(cmd);
      continue;
    }
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
