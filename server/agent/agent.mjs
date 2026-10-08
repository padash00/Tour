// F16 Server Agent — работает на серверном ПК.
// Сам устанавливает исходящее HTTPS-соединение с сайтом (входящие из интернета не нужны):
// раз в 5 секунд отправляет состояние инстансов CS2 и получает команды.
//
// Три независимых цикла — медленный сервер или долгая команда не останавливают связь с сайтом:
//   - опрос инстансов: у каждого инстанса свой цикл (A2S, get5_status, удержание настроек, автостарт);
//   - синхронизация с сайтом: отчёт из последних результатов опроса, приём команд;
//   - обслуживание раз в минуту: версии, диск, UPnP, плагин F16Hud, брандмауэр.
// Команды сайта выполняются параллельно на разных инстансах и строго по очереди на одном (recovery.mjs
// тоже идёт через эту очередь). Команда, не уложившаяся в срок, отчитывается тайм-аутом, но следующая
// команда того же инстанса ждёт, пока она действительно закончится.
//
// Защита от сбоев:
//   - буфер событий (relay.mjs): MatchZy и HTTP-лог CS2 шлют события агенту, он хранит их на диске
//     и досылает на сайт — обрыв интернета не теряет счёт и статистику;
//   - автоподъём (recovery.mjs): если CS2 с назначенным матчем упал, агент запускает его, загружает матч заново
//     и восстанавливает последний раунд из бэкапа MatchZy, админам уходит уведомление;
//   - самообновление (bundle.mjs): проверка кода до установки, откат службой, не во время матча;
//   - версия CS2 и ожидающая перезагрузка Windows уходят на сайт для предупреждений в F16 Control.
//
// Конфиг: D:\cs2server\f16\agent.json  { "siteUrl": "...", "token": "...", "lanIp": "192.168.0.159", "relayPort": 27099 }
// Запуск:  node agent.mjs   (или D:\cs2server\F16-agent.bat)

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAutostart } from "./autostart.mjs";
import { UPDATE_EXIT_CODE, applyBundle, localBundleVersion, rejectedBundleVersion } from "./bundle.mjs";
import { cs2Patch, rebootPending, selfCheck } from "./checks.mjs";
import { CommandJournal } from "./command-journal.mjs";
import { createEnforce } from "./enforce.mjs";
import { createHousekeeping } from "./housekeeping.mjs";
import { createHud } from "./hud.mjs";
import { a2sInfo, parseGet5, rcon } from "./lib.mjs";
import { cs2Build, prefetchMaps, readVersions, restartAll, updateCs2, updatePlugins } from "./maintenance.mjs";
import { createMatchLoader } from "./match-load.mjs";
import { createRecovery } from "./recovery.mjs";
import { createRelay } from "./relay.mjs";
import { ensureUpnp } from "./upnp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = process.env.F16_SERVER_DIR ?? "D:\\cs2server";
const F16_DIR = path.join(SERVER_DIR, "f16");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

// для живых тестов: свой конфиг, отдельная папка состояния и подмножество инстансов (на ПК работает настоящий агент)
const config = readJson(process.env.F16_AGENT_CONFIG ?? path.join(F16_DIR, "agent.json"));
const STATE_DIR = process.env.F16_STATE_DIR ?? F16_DIR;
mkdirSync(STATE_DIR, { recursive: true });
const commandJournal = new CommandJournal(path.join(STATE_DIR, "command-journal.json"));
const flushCommandResults = () => commandJournal.flush((reply) => api("/api/agent/ack", reply));
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
  })
  .filter((i) => !process.env.F16_ONLY || process.env.F16_ONLY.split(",").includes(i.name));
const START_PS1 = path.join(F16_DIR, "start.ps1");
const STEAMCMD_DIR = config.steamcmdDir ?? "D:\\SteamCMD";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INTERVAL_MS = 5000;
const SNAPSHOT_FRESH_MS = 20_000; // старее — инстанс в отчёт не попадает, сайт увидит, что данных нет
const rc = (inst, command, opts) => rcon(inst.port, secrets.rcon, command, opts);

let busy = null; // долгая команда обслуживания всего хоста (обновление CS2/плагинов, проверка)
const busyInstances = new Map(); // инстанс → чем занят вне очереди команд (прогрев карт)
let prefetching = false;

// ───────────────────────── очереди команд по инстансам

const lanes = new Map(); // инстанс → хвост очереди
const laneActive = new Map(); // инстанс → тип выполняемой команды

/** Выполнить fn в очереди инстанса: на одном инстансе — строго по одной, на разных — параллельно */
function inLane(name, fn) {
  const prev = lanes.get(name) ?? Promise.resolve();
  const next = prev.then(() => fn());
  const tail = next.catch(() => {});
  lanes.set(name, tail);
  tail.then(() => {
    if (lanes.get(name) === tail) lanes.delete(name);
  });
  return next;
}

// ───────────────────────── модули

const enforce = createEnforce({ stateDir: STATE_DIR, instances: INSTANCES, rc, log });
const relay = createRelay({ port: Number(config.relayPort ?? 27099), dir: STATE_DIR, siteUrl: config.siteUrl, log, onMatchzyEvent: (ev, token) => enforce.onMatchzyEvent(ev, token) });
const loader = createMatchLoader({ rc, relay, enforce, log });
const recovery = createRecovery({
  stateDir: STATE_DIR,
  serverDir: SERVER_DIR,
  rc,
  a2sInfo,
  log,
  runStart: runStartScript,
  loadMatch: loader.loadMatch,
  inLane,
});
const hud = createHud({ serverDir: SERVER_DIR, stateDir: STATE_DIR, siteUrl: config.siteUrl, instances: INSTANCES, rc, log });
const autostart = createAutostart({ stateDir: STATE_DIR, rc, log, hud });
const housekeeping = createHousekeeping({
  serverDir: SERVER_DIR,
  f16Dir: F16_DIR,
  stateDir: STATE_DIR,
  instances: INSTANCES,
  rc,
  log,
  activeMatchIds: () => new Set(Object.values(recovery.assignments).map((a) => String(a.matchid))),
  rconPassword: secrets.rcon,
});
try {
  housekeeping.ensureInstanceCfgs();
} catch (e) {
  log(`конфиги инстансов: ${e.message}`);
}

// ───────────────────────── процессы CS2

/** Список cs2.exe. null — получить не удалось (тайм-аут PowerShell): это «неизвестно», а не «все упали» */
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
        if (err) return resolve(null);
        if (!stdout.trim()) return resolve([]); // процессов нет
        try {
          const v = JSON.parse(stdout);
          resolve(Array.isArray(v) ? v : [v]);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

// один запрос списка процессов на все циклы инстансов (PowerShell запускается не чаще раза в 4 с)
let procsCache = { at: 0, value: null, pending: null };
function cs2Processes() {
  if (Date.now() - procsCache.at < 4000) return Promise.resolve(procsCache.value);
  procsCache.pending ??= listCs2Processes().then((value) => {
    procsCache = { at: Date.now(), value, pending: null };
    return value;
  });
  return procsCache.pending;
}

const isRunning = (procs, inst) => procs.some((p) => new RegExp(`-port ${inst.port}(\\s|$)`).test(p.CommandLine ?? ""));

// ───────────────────────── опрос инстансов

const snapshots = {}; // { [instance]: { at, report } }
// Вход на серверы для всех (настройка сайта «Пускать на серверы всех»). Применяем при изменении,
// после перезапуска сервера и раз в 5 минут (MatchZy может вернуть значения из своего конфига)
let openJoin = true;
const openJoinApplied = new Map(); // инстанс → { value, at, uptime }
async function applyOpenJoin(inst) {
  const prev = openJoinApplied.get(inst.name);
  if (prev && prev.value === openJoin && Date.now() - prev.at < 5 * 60_000) return;
  await rc(inst, `matchzy_kick_when_no_match_loaded ${openJoin ? "false" : "true"};mp_allowspectators 1`);
  openJoinApplied.set(inst.name, { value: openJoin, at: Date.now() });
  if (prev?.value !== undefined && prev.value !== openJoin) log(`вход на ${inst.name}: ${openJoin ? "для всех" : "только матч"}`);
}

async function probeInstance(inst) {
  const procs = await cs2Processes();
  let running = procs ? isRunning(procs, inst) : null;
  if (running === false) {
    openJoinApplied.delete(inst.name);
    recovery.track(inst, false, null);
    snapshots[inst.name] = { at: Date.now(), report: { name: inst.name, running: false } };
    return;
  }
  const [info, status] = await Promise.all([
    a2sInfo(inst.port),
    rc(inst, "get5_status").catch(() => null),
  ]);
  if (running === null) {
    // списка процессов нет — судим по ответам самого сервера; молчит — состояние неизвестно, в отчёт не идёт
    if (!info && status == null) return;
    running = true;
  }
  const get5 = parseGet5(status);
  const maintenance = busyInstances.get(inst.name);
  // get5_status не ответил, идёт команда сайта или подъём — лишних RCON-запросов не шлём
  const quiet = status == null || laneActive.has(inst.name) || recovery.recovering.has(inst.name) || !!maintenance;
  if (!quiet) await enforce.apply(inst, get5).catch(() => {});
  if (!quiet) await applyOpenJoin(inst).catch(() => {});
  recovery.track(inst, true, get5);
  if (!quiet) await autostart.tick(inst, recovery.assignments[inst.name], info, get5).catch((e) => log(`автостарт ${inst.name}: ${e.message}`));
  snapshots[inst.name] = {
    at: Date.now(),
    report: {
      name: inst.name,
      running: true,
      map: info?.map ?? null,
      players: info?.players ?? null,
      // сервер занят прогревом карт: для сайта он не свободен, матч на него не назначат
      get5: maintenance
        ? { gamestate: "maintenance", matchid: null, map_number: null }
        : get5 && { gamestate: get5.gamestate, matchid: get5.matchid, map_number: get5.map_number },
    },
  };
}

async function probeLoop(inst) {
  for (;;) {
    const started = Date.now();
    try {
      await probeInstance(inst);
    } catch (e) {
      log(`опрос ${inst.name}: ${e?.message ?? e}`);
    }
    await sleep(Math.max(1000, INTERVAL_MS - (Date.now() - started)));
  }
}

// ───────────────────────── состояние хоста

let hostInfo = {};
let hostCpu = null;
let hostInfoAt = 0;
let hostRefreshing = null;
const rtts = [];
const siteRtt = () => (rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null);
let updateState = null; // самообновление отложено/отклонено — видно на сайте

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

/** Медленная часть (PowerShell, реестр) — раз в минуту в фоне; синхронизация её не ждёт */
function refreshHostInfo(force = false) {
  if (!force && Date.now() - hostInfoAt < 60_000) return hostRefreshing ?? Promise.resolve();
  hostRefreshing ??= (async () => {
    const cpus = os.cpus();
    const idle = cpus.reduce((a, c) => a + c.times.idle, 0);
    const total = cpus.reduce((a, c) => a + Object.values(c.times).reduce((x, y) => x + y, 0), 0);
    const cpuLoad = hostCpu ? Math.round(100 * (1 - (idle - hostCpu.idle) / (total - hostCpu.total))) : null;
    hostCpu = { idle, total };
    hostInfo = {
      cpu_load: cpuLoad ?? (os.loadavg()[0] || null),
      ram_total_gb: Math.round(os.totalmem() / 1e9),
      ram_used_gb: Math.round((os.totalmem() - os.freemem()) / 1e9),
      disk_free_gb: await diskFreeGb(),
      cs2_build: cs2Build(SERVER_DIR),
      cs2_patch: cs2Patch(SERVER_DIR),
      reboot_pending: await rebootPending().catch(() => null),
      hostname: os.hostname(),
      agent_version: localBundleVersion(F16_DIR),
      versions: readVersions(F16_DIR),
    };
    hostInfoAt = Date.now();
  })().finally(() => {
    hostRefreshing = null;
  });
  return hostRefreshing;
}

function hostReport() {
  // меняется часто — свежие на каждой синхронизации
  return {
    ...hostInfo,
    busy,
    busy_instances: Object.fromEntries(busyInstances),
    commands_running: Object.fromEntries(laneActive),
    relay: relay.stats(),
    site_rtt_ms: siteRtt(),
    recovering: [...recovery.recovering],
    update: updateState,
    firewall: housekeeping.firewall,
  };
}

// ───────────────────────── команды

function runStartScript(name, stop) {
  // Без перехвата вывода: cs2.exe, запущенный через Start-Process, унаследовал бы наши pipe'ы
  // и держал их открытыми, и агент ждал бы вечно. Ждём только код выхода PowerShell.
  return new Promise((resolve) => {
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", START_PS1, "-Name", name];
    if (stop) args.push("-Stop");
    // cs2.exe start.ps1 создаёт через WMI — вне задания (job) агента, поэтому detached здесь не нужен
    const p = spawn("powershell", args, { windowsHide: true, stdio: "ignore" });
    p.on("error", (e) => resolve({ ok: false, result: e.message }));
    p.on("exit", (code) => resolve({ ok: code === 0, result: `${stop ? "stop" : "start"} ${name}: exit ${code}` }));
  });
}

const maintenanceCtx = () => ({
  f16Dir: F16_DIR,
  serverDir: SERVER_DIR,
  steamcmdDir: STEAMCMD_DIR,
  instances: INSTANCES,
  startPs1: START_PS1,
  rcon,
  a2sInfo,
  rconPassword: secrets.rcon,
  // для «Проверки перед турниром»
  log,
  listRunning: async () => {
    const procs = await listCs2Processes();
    // список не получен — считаем запущенными все, чтобы проверка не приняла сбой PowerShell за падение CS2
    return new Set(INSTANCES.filter((i) => !procs || isRunning(procs, i)).map((i) => i.name));
  },
  runStart: runStartScript,
  hostSnapshot: async () => {
    await refreshHostInfo(true);
    return hostReport();
  },
  relayStats: () => relay.stats(),
  siteRtt,
  // прогрев карт: только свободный от матчей инстанс, занят только он
  isAssigned: (name) => !!recovery.assignments[name] || laneActive.has(name),
  markBusy: (name, on) => (on ? busyInstances.set(name, "prefetch_maps") : busyInstances.delete(name)),
});
const HOST_COMMANDS = {
  update_cs2: updateCs2,
  update_plugins: updatePlugins,
  restart_all: restartAll,
  prefetch_maps: prefetchMaps,
  self_check: selfCheck,
};

const completeCommand = async (cmd, r) => {
  log(r.ok ? "  ok" : "  fail", cmd.type, cmd.instance ?? "", String(r.result).slice(0, 200));
  commandJournal.complete(cmd.id, r);
  await flushCommandResults().catch((e) => log("ack failed; сохранён для повтора", e.message));
};

/** Долгие команды обслуживания выполняются в фоне, агент продолжает отчитываться сайту */
function runHostCommand(cmd) {
  // прогрев занимает один инстанс, остальное обслуживание — весь хост
  const exclusive = cmd.type !== "prefetch_maps";
  const conflict = busy ?? (prefetching ? "prefetch_maps" : null);
  if (conflict) {
    completeCommand(cmd, { ok: false, result: `агент занят: ${conflict}` }).catch((e) => log("command journal failed", e.message));
    return;
  }
  if (exclusive) busy = cmd.type;
  else prefetching = true;
  hostInfoAt = 0;
  log("maintenance start", cmd.type);
  HOST_COMMANDS[cmd.type](maintenanceCtx(), cmd.payload)
    .then((result) => ({ ok: true, result }))
    .catch((e) => ({ ok: false, result: String(e?.message ?? e) }))
    .then(async (r) => {
      if (exclusive) busy = null;
      else prefetching = false;
      hostInfoAt = 0;
      await completeCommand(cmd, r);
    }).catch((e) => log("command journal failed", e.message));
}

const COMMAND_TIMEOUT_MS = { restart: 170_000 }; // перезапуск с матчем — подъём и загрузка бэкапа
const TIMED_OUT = Symbol("timeout");

/** Команда инстанса — в его очередь. Тайм-аут отчитывается сразу, но очередь ждёт настоящего конца команды */
function runInstanceCommand(cmd) {
  inLane(cmd.instance ?? "-", async () => {
    laneActive.set(cmd.instance ?? "-", cmd.type);
    try {
      const work = execute(cmd).catch((e) => ({ ok: false, result: String(e?.message ?? e) }));
      const limit = COMMAND_TIMEOUT_MS[cmd.type] ?? 60_000;
      const r = await Promise.race([work, sleep(limit).then(() => TIMED_OUT)]);
      if (r !== TIMED_OUT) return completeCommand(cmd, r);
      await completeCommand(cmd, { ok: false, result: `timeout ${Math.round(limit / 1000)}s — команда ещё выполнялась, следующие команды ${cmd.instance} ждали её конца` });
      // не начинаем следующую команду этого сервера поверх незаконченной (но не вечно)
      await Promise.race([work, sleep(10 * 60_000)]);
    } finally {
      laneActive.delete(cmd.instance ?? "-");
    }
  }).catch((e) => log("command failed", e?.message ?? e));
}

async function execute(cmd) {
  if (cmd.type === "replay_failed_events") {
    const moved = relay.replayFailed();
    return { ok: true, result: moved ? `в очередь возвращено событий: ${moved}` : "отложенных событий нет" };
  }
  const inst = INSTANCES.find((i) => i.name === cmd.instance);
  if (!inst) return { ok: false, result: `unknown instance ${cmd.instance}` };
  const forget = () => {
    recovery.forget(inst);
    autostart.forget(inst.name);
    hud.forget(inst.name);
  };

  switch (cmd.type) {
    case "start":
      return runStartScript(inst.name, false);
    case "stop":
      forget(); // остановлен по команде — это не падение
      return runStartScript(inst.name, true);
    case "restart": {
      // посреди матча: матч остаётся за сервером — тот же путь, что автоподъём (загрузка заново + бэкап раунда)
      if (cmd.payload?.keep_match && recovery.assignments[inst.name]) return recovery.recoverNow(inst, { reason: "restart" });
      forget();
      await runStartScript(inst.name, true);
      await sleep(3000);
      return runStartScript(inst.name, false);
    }
    case "load_match": {
      const payload = await loader.viaRelay(cmd.payload);
      const r = await loader.loadMatch(inst, payload);
      if (r.ok && payload.matchzy_id != null) recovery.assign(inst, payload);
      return r;
    }
    case "end_match": {
      forget();
      await rc(inst, "logaddress_delall_http").catch(() => {});
      const result = (await rc(inst, "get5_endmatch")).trim() || "ended";
      await enforce.clear(inst);
      return { ok: true, result };
    }
    case "rcon":
      return { ok: true, result: (await rc(inst, String(cmd.payload.command))).trim() };
    default:
      return { ok: false, result: `unknown command ${cmd.type}` };
  }
}

function dispatch(commands) {
  for (const cmd of commands) {
    if (!commandJournal.begin(cmd.id)) continue; // уже выполнялась (повторная доставка)
    log("cmd", cmd.type, cmd.instance ?? "");
    if (cmd.type in HOST_COMMANDS) runHostCommand(cmd);
    else runInstanceCommand(cmd);
  }
}

// ───────────────────────── связь с сайтом

async function api(pathname, body, timeoutMs = 15_000) {
  const res = await fetch(`${config.siteUrl}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error(`${pathname} → HTTP ${res.status}`), { status: res.status });
  return res.json();
}

// Отдельные запросы не задерживают приём команд: быстрые игровые таймеры идут чаще обслуживания.
const siteJobs = {
  dispatch: { interval: 5_000, last: 0, inFlight: false },
  maintenance: { interval: 60_000, last: 0, inFlight: false },
};
function scheduleSiteJobs() {
  for (const [lane, state] of Object.entries(siteJobs)) {
    if (state.inFlight || Date.now() - state.last < state.interval) continue;
    state.inFlight = true;
    state.last = Date.now();
    api("/api/agent/jobs", { lane }, 65_000)
      .catch((e) => log(`фоновые задачи ${lane}: ${e.message}`))
      .finally(() => { state.inFlight = false; });
  }
}

// UPnP: игровые ПК могут быть в другой подсети (сервер за своим роутером) — пробрасываем UDP-порты
// инстансов на роутере и сообщаем сайту его внешний адрес. Выключается в agent.json: "upnp": false
let upnpState = null;
let upnpAt = 0;
async function refreshUpnp() {
  if (config.upnp === false || !config.lanIp) return;
  if (Date.now() - upnpAt < 10 * 60_000 && upnpState) return;
  upnpAt = Date.now();
  const prev = upnpState?.ip;
  // игровые порты и GOTV (порт + 5): зрители и ПК трансляции из сети игроков смотрят матч через GOTV
  upnpState = await ensureUpnp(config.lanIp, INSTANCES.flatMap((i) => [i.port, i.port + 5]));
  if (upnpState.error) log(`UPnP: ${upnpState.error}`);
  else if (upnpState.ip !== prev) log(`UPnP: роутер ${upnpState.model ?? ""} внешний адрес ${upnpState.ip}, проброшены UDP ${upnpState.mapped.join(", ")}`);
}

/**
 * Самообновление. Не во время обслуживания, подъёма, команд и не пока на сервере идёт матч (разминка или игра):
 * между сериями и в простое — можно. Отклонённую версию (не прошла проверку / откачена службой) не ставим.
 */
async function maybeUpdate(siteVersion) {
  const local = localBundleVersion(F16_DIR);
  if (!siteVersion || siteVersion === local) {
    updateState = null;
    return;
  }
  const rejected = rejectedBundleVersion(F16_DIR);
  if (rejected?.version === siteVersion) {
    updateState = { version: siteVersion, rejected: rejected.reason, at: rejected.at };
    return;
  }
  const live = recovery.liveAssignments();
  const reason = busy ? `обслуживание: ${busy}`
    : prefetching ? "прогрев карт"
    : recovery.recovering.size ? "автоподъём сервера"
    : laneActive.size || commandJournal.inFlight ? "выполняются команды"
    : Object.values(siteJobs).some((s) => s.inFlight) ? "фоновые задачи сайта"
    : live.length ? `идёт матч: ${live.join(", ")}`
    : null;
  if (reason) {
    if (updateState?.deferred !== reason) log(`обновление агента ${siteVersion} отложено: ${reason}`);
    updateState = { version: siteVersion, deferred: reason };
    return;
  }
  const r = await applyBundle({ siteUrl: config.siteUrl, token: config.token, f16Dir: F16_DIR, serverDir: SERVER_DIR });
  if (r.rejected) {
    log(`обновление агента ${siteVersion} отклонено: ${r.rejected.join(" · ").slice(0, 500)}`);
    updateState = { version: siteVersion, rejected: r.rejected.join(" · ").slice(0, 500) };
    return;
  }
  log(`обновление агента ${local} → ${r.version}: ${r.count} файлов, перезапуск`);
  await flushCommandResults().catch(() => {});
  process.exit(UPDATE_EXIT_CODE);
}

let failures = 0;

async function syncOnce() {
  await flushCommandResults().catch((e) => log("ack retry failed", e.message));
  refreshHostInfo().catch((e) => log(`состояние хоста: ${e.message}`));
  const now = Date.now();
  const instances = INSTANCES.map((i) => snapshots[i.name]).filter((s) => s && now - s.at < SNAPSHOT_FRESH_MS).map((s) => s.report);
  const publicInfo = { ...hostReport(), upnp: upnpState, pending_results: commandJournal.pendingResults, protocol: 3 };
  const events = recovery.pendingEvents;
  const t0 = Date.now();
  const res = await api("/api/agent/sync", { protocol: 3, lan_ip: config.lanIp, info: publicInfo, instances, events });
  rtts.push(Date.now() - t0);
  if (rtts.length > 10) rtts.shift();
  commandJournal.accept(res.commands ?? []);
  // сайт уже пометил эти команды «отправлено» — запускаем сразу, не дожидаясь их конца
  dispatch(res.commands ?? []);
  // события удаляем только те, что сайт подтвердил (старый сайт без processed_events — все отправленные)
  recovery.ackEvents(Array.isArray(res.processed_events) ? res.processed_events : events.map((e) => e.id));
  await housekeeping.syncMatchzyAdmins(res.admins).catch((e) => log(`MatchZy admins: ${e.message}`));
  if (typeof res.open_join === "boolean") openJoin = res.open_join;
  try {
    housekeeping.cleanupBackups(Number(res.backup_days ?? 1));
  } catch (e) {
    log(`очистка: ${e.message}`);
  }
  // до запуска фоновых задач: пока их запрос идёт, агент не обновляется
  await maybeUpdate(res.bundle_version).catch((e) => log(`обновление агента: ${e.message}`));
  scheduleSiteJobs();
}

async function syncLoop() {
  for (;;) {
    const started = Date.now();
    try {
      await syncOnce();
      if (failures) log("связь восстановлена");
      failures = 0;
    } catch (e) {
      failures++;
      if (failures === 1 || failures % 12 === 0) log("ошибка связи:", e.message);
    }
    await sleep(Math.max(500, INTERVAL_MS - (Date.now() - started)));
  }
}

/** Обслуживание ПК раз в минуту: не на пути отчёта сайту */
async function housekeepingLoop() {
  for (;;) {
    try {
      housekeeping.ensureServerLanguage();
      housekeeping.ensureMatchzyRu();
    } catch (e) {
      log(`язык сервера: ${e.message}`);
    }
    await hud.ensurePlugin(Object.keys(recovery.assignments).length > 0).catch((e) => log(`F16Hud: ${e.message}`));
    await refreshUpnp().catch(() => {});
    await housekeeping.ensureFirewall().catch((e) => log(`брандмауэр: ${e.message}`));
    await housekeeping.ensureHiddenTasks().catch((e) => log(`планировщик: ${e.message}`));
    await refreshHostInfo().catch(() => {});
    await sleep(60_000);
  }
}

await relay.start();
log(`F16 Server Agent → ${config.siteUrl} · инстансов: ${INSTANCES.length} · LAN ${config.lanIp}`);
await refreshHostInfo(true).catch(() => {});
for (const inst of INSTANCES) probeLoop(inst);
housekeepingLoop();
await syncLoop();
