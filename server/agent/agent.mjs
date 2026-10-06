// F16 Server Agent — работает на серверном ПК.
// Сам устанавливает исходящее HTTPS-соединение с сайтом (входящие из интернета не нужны):
// раз в 5 секунд отправляет состояние инстансов CS2 и получает команды.
//
// Защита от сбоев:
//   - буфер событий (relay.mjs): MatchZy и HTTP-лог CS2 шлют события агенту, он хранит их на диске
//     и досылает на сайт — обрыв интернета не теряет счёт и статистику;
//   - автоподъём: если CS2 с назначенным матчем упал, агент запускает его, загружает матч заново
//     и восстанавливает последний раунд из бэкапа MatchZy (до 2 попыток), админам уходит уведомление;
//   - версия CS2 и ожидающая перезагрузка Windows уходят на сайт для предупреждений в F16 Control.
//
// Конфиг: D:\cs2server\f16\agent.json  { "siteUrl": "...", "token": "...", "lanIp": "192.168.0.159", "relayPort": 27099 }
// Запуск:  node agent.mjs   (или D:\cs2server\F16-agent.bat)

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cs2Patch, rebootPending, selfCheck } from "./checks.mjs";
import { a2sInfo, rcon } from "./lib.mjs";
import { applyBundle, cs2Build, localBundleVersion, prefetchMaps, readVersions, restartAll, updateCs2, updatePlugins } from "./maintenance.mjs";
import { createRelay } from "./relay.mjs";
import { CommandJournal } from "./command-journal.mjs";
import { ensureUpnp } from "./upnp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = process.env.F16_SERVER_DIR ?? "D:\\cs2server";
const F16_DIR = path.join(SERVER_DIR, "f16");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
const readJsonSafe = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

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
let busy = null; // долгая команда обслуживания, которая сейчас выполняется

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INTERVAL_MS = 5000;

// ───────────────────────── буфер событий

const relay = createRelay({ port: Number(config.relayPort ?? 27099), dir: STATE_DIR, siteUrl: config.siteUrl, log, onMatchzyEvent: handleLocalMatchzyEvent });

// ───────────────────────── удержание настроек режима

// настройки режима, которые надо держать на инстансе весь матч: { [instance]: { matchid, cvars } }
const ENFORCE_FILE = path.join(STATE_DIR, "enforce.json");
const enforce = readJsonSafe(ENFORCE_FILE, {});
const saveEnforce = () => writeFileSync(ENFORCE_FILE, JSON.stringify(enforce));
const AUTO_HALFTIME_VOICE = "sv_auto_full_alltalk_during_warmup_half_end";
const DEFAULT_VOICE = `${AUTO_HALFTIME_VOICE} 0;sv_voiceenable 1;sv_alltalk 0;sv_deadtalk 1;sv_full_alltalk 0;sv_talk_enemy_living 0;sv_talk_enemy_dead 0`;

async function handleLocalMatchzyEvent(ev, token) {
  if (!ev || !["going_live", "map_result", "series_end"].includes(ev.event)) return;
  for (const inst of INSTANCES) {
    const rule = enforce[inst.name];
    if (!rule?.halftimeVoiceMaps?.length || Number(rule.matchid) !== Number(ev.matchid) || !rule.eventToken || token !== rule.eventToken) continue;
    const mapNumber = Number(ev.map_number);
    if (ev.event === "map_result" && rule.halftimeVoiceActiveMap !== mapNumber) continue;
    const enabled = ev.event === "going_live" && rule.halftimeVoiceMaps.includes(mapNumber);
    rule.halftimeVoiceActiveMap = enabled ? mapNumber : null;
    saveEnforce();
    await rcon(inst.port, secrets.rcon, `${AUTO_HALFTIME_VOICE} ${enabled ? 1 : 0}`);
    log(`голос на смене сторон ${inst.name}: ${enabled ? "включён" : "выключен"} (карта ${Number.isFinite(mapNumber) ? mapNumber + 1 : "—"})`);
  }
}

async function clearEnforce(inst) {
  const rule = enforce[inst.name];
  if (!rule) return;
  delete enforce[inst.name];
  saveEnforce();
  if (rule.cvars && (Object.hasOwn(rule.cvars, "sv_alltalk") || Object.hasOwn(rule.cvars, AUTO_HALFTIME_VOICE))) {
    await rcon(inst.port, secrets.rcon, DEFAULT_VOICE).catch(() => {});
  }
}

async function enforceCvars(inst, get5) {
  const rule = enforce[inst.name];
  if (!rule) return;
  const active = get5 && get5.matchid === rule.matchid && ["warmup", "knife", "waiting_for_knife_decision", "going_live", "live"].includes(get5.gamestate);
  if (!active) {
    // снимаем правило только по явному ответу «матча нет / другой матч». Пустой ответ (get5 = null) бывает,
    // пока сервер меняет карту между картами серии — правило нужно сохранить для следующей карты.
    if (get5 && (get5.gamestate === "none" || get5.matchid !== rule.matchid)) {
      await clearEnforce(inst);
    }
    return;
  }
  const names = Object.keys(rule.cvars);
  const out = await rcon(inst.port, secrets.rcon, names.join(";")).catch(() => "");
  const expected = (name) => name === AUTO_HALFTIME_VOICE && rule.halftimeVoiceMaps?.length
    ? rule.halftimeVoiceActiveMap === get5.map_number && ["going_live", "live"].includes(get5.gamestate) ? 1 : 0
    : rule.cvars[name];
  const fix = names.filter((n) => {
    const m = new RegExp(`${n} = (true|false|[-+]?\\d+(?:\\.\\d+)?)`, "i").exec(out);
    if (!m) return false;
    const value = m[1].toLowerCase();
    const current = value === "true" ? 1 : value === "false" ? 0 : Number(value);
    return current !== Number(expected(n));
  });
  if (fix.length) {
    await rcon(inst.port, secrets.rcon, fix.map((n) => `${n} ${expected(n)}`).join(";")).catch(() => {});
    log(`enforce ${inst.name}: ${fix.map((n) => `${n}=${expected(n)}`).join(" ")}`);
  }
}

// ───────────────────────── назначенные матчи (для автоподъёма после падения)

// { [instance]: { payload, matchid, match_id, loaded_at, seen, live, map_number, missing, attempts } }
const ASSIGN_FILE = path.join(STATE_DIR, "assignments.json");
const assignments = readJsonSafe(ASSIGN_FILE, {});
const saveAssignments = () => writeFileSync(ASSIGN_FILE, JSON.stringify(assignments, null, 1));
const recovering = new Set();
const MAX_RECOVERY_ATTEMPTS = 2;

// события для сайта (уведомления админам): копятся до успешной синхронизации
const EVENTS_FILE = path.join(STATE_DIR, "events-pending.json");
let pendingEvents = readJsonSafe(EVENTS_FILE, []);
function pushEvent(e) {
  pendingEvents.push({ ...e, at: new Date().toISOString() });
  pendingEvents = pendingEvents.slice(-50);
  writeFileSync(EVENTS_FILE, JSON.stringify(pendingEvents));
}

/** Отслеживает матч на инстансе: увидели загруженным, идёт live, закончился сам — или процесс пропал */
function trackAssignment(inst, running, get5) {
  const a = assignments[inst.name];
  if (!a || recovering.has(inst.name)) return;
  let changed = false;
  if (!running) {
    // процесс пропал 3 тика подряд (~15 с) — не мигание списка процессов, а падение
    a.missing = (a.missing ?? 0) + 1;
    saveAssignments();
    if (a.missing >= 3) recover(inst);
    return;
  }
  if (a.missing) {
    a.missing = 0;
    changed = true;
  }
  if (get5 && get5.matchid === a.matchid) {
    if (!a.seen) {
      a.seen = true;
      changed = true;
    }
    if (["going_live", "live"].includes(get5.gamestate)) {
      if (!a.live || a.map_number !== get5.map_number) {
        a.live = true;
        a.map_number = get5.map_number ?? a.map_number ?? 0;
        changed = true;
      }
    }
  } else if (get5 && a.seen && (get5.gamestate === "none" || get5.matchid !== a.matchid)) {
    // серия закончилась сама (или матч сняли мимо агента) — следить больше не за чем
    delete assignments[inst.name];
    changed = true;
  }
  if (changed) saveAssignments();
}

// ───────────────────────── автостарт карт серии
// Перед первой картой игроки пишут .r сами. На следующих картах серии ждать .r не нужно: как только
// весь состав зашёл на новую карту, через 15 с сервер стартует сам (css_start — дальше нож, если он
// включён, или сразу игра). Если кто-то вышел за эти 15 с — отсчёт начинается заново.
const AUTOSTART_DELAY_MS = 15_000;
const autoStart = {}; // { [instance]: { key, since, announced, done } }
const mapTitle = (m) => String(m ?? "").split("@")[0].replace(/^(de|cs|aim|awp)_/, "").replace(/^./, (c) => c.toUpperCase());

// ───────────────────────── окно по центру экрана (плагин F16Hud)
// Плагин лежит на сайте (/agent/F16Hud.dll). Раз в 10 минут сверяем его с установленным и при отличии
// кладём новый и загружаем на запущенных серверах — без ручного копирования.
const HUD_DIR = path.join(SERVER_DIR, "game", "csgo", "addons", "counterstrikesharp", "plugins", "F16Hud");
let hudCheckedAt = 0;
async function ensureHudPlugin() {
  if (Date.now() - hudCheckedAt < 10 * 60_000) return;
  // замена плагина на сервере с идущим матчем может уронить CS2 — обновляем только когда матчей нет
  if (Object.keys(assignments).length > 0) return;
  hudCheckedAt = Date.now();
  const res = await fetch(`${config.siteUrl}/agent/F16Hud.dll`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const target = path.join(HUD_DIR, "F16Hud.dll");
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  if (existsSync(target) && sha(readFileSync(target)) === sha(buf)) return;
  mkdirSync(HUD_DIR, { recursive: true });
  writeFileSync(target, buf);
  log(`F16Hud: установлен плагин (${buf.length} байт)`);
  // уже загруженный плагин CounterStrikeSharp перезагрузит сам (hot reload); повторный load его роняет
  for (const inst of INSTANCES) {
    const list = await rcon(inst.port, secrets.rcon, "css_plugins list").catch(() => null);
    if (list != null && !/F16 HUD/.test(list)) await rcon(inst.port, secrets.rcon, "css_plugins load F16Hud").catch(() => {});
  }
}

const hudClean = (t) => String(t ?? "").replace(/[";|\u0000-\u001f\u007f]/g, "").slice(0, 60);
const hudShown = {}; // { [instance]: true } — окно сейчас показано

/** Разминка матча: карта, счёт серии, кого ждём — по центру экрана, обновляется на каждом тике */
async function warmupHud(inst, info, get5, extra) {
  const a = assignments[inst.name];
  const active = a && get5 && get5.matchid === a.matchid && get5.gamestate === "warmup";
  if (!active) {
    if (hudShown[inst.name]) {
      delete hudShown[inst.name];
      await rcon(inst.port, secrets.rcon, "f16_hud_clear").catch(() => {});
    }
    return;
  }
  const cfg = readJsonSafe(path.join(STATE_DIR, "match-configs", `${a.match_id}.json`), null);
  const mapNo = get5.map_number ?? 0;
  const total = cfg?.num_maps ?? 1;
  const map = cfg?.maplist?.[mapNo] ? mapTitle(cfg.maplist[mapNo]) : "";
  const t1 = hudClean(get5.team1?.name ?? cfg?.team1?.name ?? "Команда 1");
  const t2 = hudClean(get5.team2?.name ?? cfg?.team2?.name ?? "Команда 2");
  const s1 = get5.team1?.series_score ?? 0;
  const s2 = get5.team2?.series_score ?? 0;
  const lines = [
    // окно в CS2 узкое — короткие строки, иначе переносятся
    `F16 · КАРТА ${mapNo + 1}${total > 1 ? `/${total}` : ""}${map ? ` · ${hudClean(map).toUpperCase()}` : ""}`,
    total > 1 ? `${t1} ${s1} : ${s2} ${t2}` : `${t1} vs ${t2}`,
    extra,
  ].filter(Boolean);
  hudShown[inst.name] = true;
  // состав матча для табло: плагин сам считает, кто не готов и кто не зашёл
  const team = (t) => `${hudClean(t?.name ?? "").replace(/[#,=]/g, "")}#${Object.entries(t?.players ?? {}).map(([id, n]) => `${id}=${hudClean(n).replace(/[#,=]/g, "")}`).join(",")}`;
  if (cfg?.team1 && cfg?.team2) {
    await rcon(inst.port, secrets.rcon, `f16_roster ${a.matchid}-${mapNo}#${team(cfg.team1)}#${team(cfg.team2)}`).catch(() => {});
  }
  // «не готовы» нужно только на первой карте — дальше старт автоматический
  await rcon(inst.port, secrets.rcon, `f16_hud_ready ${mapNo < 1 ? 1 : 0}`).catch(() => {});
  await rcon(inst.port, secrets.rcon, `f16_hud 8 ${lines.join("|")}`).catch(() => {});
}

async function autoStartNextMap(inst, info, get5) {
  const a = assignments[inst.name];
  const mapNo = get5?.map_number ?? 0;
  if (!a || !get5 || get5.matchid !== a.matchid || get5.gamestate !== "warmup") {
    delete autoStart[inst.name];
    await warmupHud(inst, info, get5, null);
    return;
  }
  // игра лобби с ботами: A2S считает ботов игроками — ждать «все зашли» нельзя, игроки пишут .r сами
  if (a.payload?.lobby && a.payload?.autostart_off) {
    delete autoStart[inst.name];
    await warmupHud(inst, info, get5, "Напишите .r в чат, когда готовы");
    return;
  }
  // лобби: готовность уже подтвердили на сайте — первая карта тоже стартует сама, когда все зашли
  if (mapNo < 1 && !a.payload?.autostart_first) {
    // первая карта — игроки сами пишут .r
    const cfg0 = readJsonSafe(path.join(STATE_DIR, "match-configs", `${a.match_id}.json`), null);
    const need0 = (cfg0?.players_per_team ?? 5) * 2;
    const humans0 = Math.max(0, (info?.players ?? 0) - 1);
    delete autoStart[inst.name];
    await warmupHud(inst, info, get5, humans0 < need0 ? "Напишите .r в чат, когда готовы" : "Все на месте · напишите .r");
    return;
  }
  const key = `${a.matchid}:${mapNo}`;
  let st = autoStart[inst.name];
  if (!st || st.key !== key) st = autoStart[inst.name] = { key, since: null, announced: false, done: false };
  if (st.done) return;
  const cfg = readJsonSafe(path.join(STATE_DIR, "match-configs", `${a.match_id}.json`), null);
  // в лобби команды бывают неполными — ждём столько людей, сколько в составе
  const need = Number(a.payload?.autostart_need) || (cfg?.players_per_team ?? 5) * 2;
  // A2S считает и GOTV — он всегда включён
  const humans = Math.max(0, (info?.players ?? 0) - 1);
  if (!st.announced) {
    st.announced = true;
    const total = cfg?.num_maps ? ` из ${cfg.num_maps}` : "";
    const name = cfg?.maplist?.[mapNo] ? ` — ${mapTitle(cfg.maplist[mapNo])}` : "";
    await rcon(inst.port, secrets.rcon, `css_asay Карта ${mapNo + 1}${total}${name}. Писать .r не нужно: старт сам, когда все зайдут`).catch(() => {});
  }
  if (humans < need) {
    st.since = null;
    await warmupHud(inst, info, get5, `Ждём игроков ${humans}/${need} · старт сам`);
    return;
  }
  st.since ??= Date.now();
  const left = Math.ceil((AUTOSTART_DELAY_MS - (Date.now() - st.since)) / 1000);
  if (left > 0) {
    await warmupHud(inst, info, get5, `Все на месте · старт через ${left} с`);
    return;
  }
  st.done = true;
  delete hudShown[inst.name];
  await rcon(inst.port, secrets.rcon, "f16_hud_clear").catch(() => {});
  await rcon(inst.port, secrets.rcon, "css_asay Все на месте — старт!").catch(() => {});
  const out = await rcon(inst.port, secrets.rcon, "css_start").catch((e) => String(e.message));
  log(`автостарт ${inst.name}: матч ${a.matchid}, карта ${mapNo + 1} (${humans}/${need}) ${String(out ?? "").trim().slice(0, 80)}`);
}

/** Последний бэкап раунда MatchZy для матча и карты: matchzy_<matchid>_<map>_round<N>.json */
function latestBackup(matchid, mapNumber) {
  const dir = path.join(SERVER_DIR, "game", "csgo", "MatchZyDataBackup");
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^matchzy_${matchid}_${mapNumber}_round(\\d+)\\.json$`);
  let best = null;
  for (const f of readdirSync(dir)) {
    const m = re.exec(f);
    if (m && (!best || Number(m[1]) > best.round)) best = { file: f, round: Number(m[1]) };
  }
  return best;
}

async function waitRcon(inst, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const out = await rcon(inst.port, secrets.rcon, "get5_status").catch(() => null);
    if (out != null) {
      try {
        return JSON.parse(out.slice(out.indexOf("{")));
      } catch {
        return { gamestate: "unknown" };
      }
    }
    await sleep(3000);
  }
  return null;
}

/** CS2 с назначенным матчем упал: поднять, загрузить матч заново, восстановить раунд */
async function recover(inst) {
  const a = assignments[inst.name];
  if (!a || recovering.has(inst.name)) return;
  recovering.add(inst.name);
  a.attempts = (a.attempts ?? 0) + 1;
  saveAssignments();
  log(`автоподъём ${inst.name}: попытка ${a.attempts}/${MAX_RECOVERY_ATTEMPTS} (матч ${a.matchid}${a.live ? `, карта ${a.map_number}` : ""})`);
  try {
    await runStartScript(inst.name, false);
    const g5 = await waitRcon(inst, 150_000);
    if (!g5) throw new Error("сервер не ответил по RCON за 2,5 минуты после запуска");
    const r = await loadMatch(inst, a.payload);
    if (!r.ok) throw new Error(`матч не загрузился: ${r.result}`);
    let detail = "Матч загружен заново, игроки могут переподключаться по тому же адресу.";
    if (a.live) {
      // ждём, пока MatchZy поставит матч в разминку на нужной карте, затем восстанавливаем раунд
      for (let k = 0; k < 40; k++) {
        const s = await waitRcon(inst, 5000);
        if (s && s.matchid === a.matchid && s.gamestate && s.gamestate !== "none") break;
        await sleep(3000);
      }
      const b = latestBackup(a.matchid, a.map_number ?? 0);
      if (b) {
        // MatchZy принимает имя файла из MatchZyDataBackup (listbackups показывает полный путь) — пробуем оба, без кавычек
        const full = path.join(SERVER_DIR, "game", "csgo", "MatchZyDataBackup", b.file);
        let out = "";
        let restored = false;
        for (const arg of [b.file, full]) {
          out = String(await rcon(inst.port, secrets.rcon, `matchzy_loadbackup ${arg}`).catch((e) => e.message));
          if (!/does not exist|error|invalid|usage|not found|failed/i.test(out)) {
            restored = true;
            break;
          }
        }
        detail = restored
          ? `Матч загружен заново, восстановлен раунд ${b.round} карты ${(a.map_number ?? 0) + 1} — MatchZy поставит паузу, снимите её, когда все подключатся.`
          : `Матч загружен заново, но раунд восстановить не удалось (${out.trim().slice(0, 140)}). Восстановите вручную в пульте матча: matchzy_loadbackup ${b.file}`;
      } else {
        detail = "Матч загружен заново, но бэкап раунда не найден (на Workshop-картах CS2 запрещает бэкапы) — карта начнётся с разминки.";
      }
    }
    a.missing = 0;
    saveAssignments();
    pushEvent({ type: "recovered", instance: inst.name, matchzy_id: a.matchid, detail });
    log(`автоподъём ${inst.name}: ok — ${detail}`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    log(`автоподъём ${inst.name}: не удалось — ${msg}`);
    if (a.attempts >= MAX_RECOVERY_ATTEMPTS) {
      pushEvent({ type: "recovery_failed", instance: inst.name, matchzy_id: a.matchid, detail: `${msg}. Перенесите матч на другой сервер.` });
      delete assignments[inst.name];
      saveAssignments();
    }
  } finally {
    recovering.delete(inst.name);
  }
}

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

const isRunning = (procs, inst) => procs.some((p) => new RegExp(`-port ${inst.port}(\\s|$)`).test(p.CommandLine ?? ""));

let hostInfo = {};
let hostInfoAt = 0;
const rtts = [];
const siteRtt = () => (rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null);

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
  if (Date.now() - hostInfoAt >= 60_000) {
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
      cs2_build: cs2Build(SERVER_DIR),
      cs2_patch: cs2Patch(SERVER_DIR),
      reboot_pending: await rebootPending().catch(() => null),
      hostname: os.hostname(),
      agent_version: localBundleVersion(F16_DIR),
      versions: readVersions(F16_DIR),
    };
    hostInfoAt = Date.now();
  }
  // меняется часто — свежие на каждой синхронизации
  return { ...hostInfo, busy, relay: relay.stats(), site_rtt_ms: siteRtt(), recovering: [...recovering] };
}

async function collectInstances() {
  const procs = await listCs2Processes();
  return Promise.all(
    INSTANCES.map(async (inst) => {
      const running = isRunning(procs, inst);
      if (!running) {
        trackAssignment(inst, false, null);
        return { name: inst.name, running: false };
      }
      const [info, status] = await Promise.all([
        a2sInfo(inst.port),
        rcon(inst.port, secrets.rcon, "get5_status").catch(() => null),
      ]);
      let get5 = null;
      try {
        get5 = status ? JSON.parse(status.slice(status.indexOf("{"))) : null;
      } catch {}
      await enforceCvars(inst, get5).catch(() => {});
      trackAssignment(inst, true, get5);
      await autoStartNextMap(inst, info, get5).catch((e) => log(`автостарт ${inst.name}: ${e.message}`));
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
    return new Set(INSTANCES.filter((i) => isRunning(procs, i)).map((i) => i.name));
  },
  runStart: runStartScript,
  hostSnapshot: async () => {
    hostInfoAt = 0;
    return collectHostInfo();
  },
  relayStats: () => relay.stats(),
  siteRtt,
});
const HOST_COMMANDS = {
  update_cs2: updateCs2,
  update_plugins: updatePlugins,
  restart_all: restartAll,
  prefetch_maps: prefetchMaps,
  self_check: selfCheck,
};

/** Долгие команды обслуживания выполняются в фоне, агент продолжает отчитываться сайту */
function runHostCommand(cmd) {
  if (busy) {
    commandJournal.complete(cmd.id, { ok: false, result: `агент занят: ${busy}` });
    return;
  }
  busy = cmd.type;
  hostInfoAt = 0;
  log("maintenance start", cmd.type);
  HOST_COMMANDS[cmd.type](maintenanceCtx(), cmd.payload)
    .then((result) => ({ ok: true, result }))
    .catch((e) => ({ ok: false, result: String(e?.message ?? e) }))
    .then(async (r) => {
      busy = null;
      hostInfoAt = 0;
      log("maintenance", r.ok ? "ok" : "fail", r.result.slice(0, 300));
      commandJournal.complete(cmd.id, r);
      await flushCommandResults().catch((e) => log("ack failed; сохранён для повтора", e.message));
    }).catch((e) => log("command journal failed", e.message));
}

const q = (s) => `"${String(s).replace(/"/g, "")}"`;

/**
 * Адреса матча — через буфер агента: события и лог копятся на диске при обрыве связи,
 * конфиг кэшируется и отдаётся MatchZy локально (матч можно загрузить заново без интернета).
 * Буфер не запустился — оставляем прямые адреса сайта.
 */
async function viaRelay(payload) {
  if (!relay.running) return payload;
  const out = { ...payload, events_url: relay.urls.events };
  if (payload.log_url) {
    try {
      out.log_url = relay.urls.log(new URL(payload.log_url).searchParams.toString());
    } catch {}
  }
  try {
    const res = await fetch(payload.url, { headers: { [payload.header_key]: payload.header_value }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      relay.saveConfig(payload.match_id, await res.text());
      out.url = relay.urls.config(payload.match_id);
    }
  } catch {
    // сайт не ответил — MatchZy попробует скачать конфиг напрямую
  }
  return out;
}

/** Загрузка матча в MatchZy на инстансе (и при команде сайта, и при автоподъёме после падения) */
async function loadMatch(inst, payload) {
  const { url, header_key, header_value, events_url, log_url, post_cmds = [], enforce: rule = null } = payload;
  if (rule) enforce[inst.name] = { ...rule, eventToken: header_value };
  else delete enforce[inst.name];
  saveEnforce();
  // на случай, если на сервере остался старый матч
  await rcon(inst.port, secrets.rcon, "get5_endmatch").catch(() => {});
  await rcon(inst.port, secrets.rcon, `${AUTO_HALFTIME_VOICE} 0`).catch(() => {});
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
  const local = String(url).startsWith("http://127.0.0.1");
  return { ok: true, result: `${out.trim() || "loadmatch sent"} · события → ${String(events_url).startsWith("http://127.0.0.1") ? "буфер агента" : "сайт"}${local ? " · конфиг из кэша" : ""}` };
}

async function execute(cmd) {
  const inst = INSTANCES.find((i) => i.name === cmd.instance);
  if (!inst) return { ok: false, result: `unknown instance ${cmd.instance}` };
  const forget = () => {
    if (assignments[inst.name]) {
      delete assignments[inst.name];
      saveAssignments();
    }
  };

  switch (cmd.type) {
    case "start":
      return runStartScript(inst.name, false);
    case "stop":
      forget(); // остановлен по команде — это не падение
      return runStartScript(inst.name, true);
    case "restart": {
      forget();
      await runStartScript(inst.name, true);
      await sleep(3000);
      return runStartScript(inst.name, false);
    }
    case "load_match": {
      const payload = await viaRelay(cmd.payload);
      const r = await loadMatch(inst, payload);
      if (r.ok && payload.matchzy_id != null) {
        assignments[inst.name] = {
          payload,
          matchid: Number(payload.matchzy_id),
          match_id: payload.match_id,
          loaded_at: Date.now(),
          seen: false,
          live: false,
          map_number: null,
          missing: 0,
          attempts: 0,
        };
        saveAssignments();
      }
      return r;
    }
    case "end_match": {
      forget();
      await rcon(inst.port, secrets.rcon, "logaddress_delall_http").catch(() => {});
      const result = (await rcon(inst.port, secrets.rcon, "get5_endmatch")).trim() || "ended";
      await clearEnforce(inst);
      return { ok: true, result };
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

// UPnP: игровые ПК могут быть в другой подсети (сервер за своим роутером) — пробрасываем UDP-порты
// инстансов на роутере и сообщаем сайту его внешний адрес. Выключается в agent.json: "upnp": false
let upnpState = null;
let upnpAt = 0;
async function refreshUpnp() {
  if (config.upnp === false || !config.lanIp) return;
  if (Date.now() - upnpAt < 10 * 60_000 && upnpState) return;
  upnpAt = Date.now();
  const prev = upnpState?.ip;
  upnpState = await ensureUpnp(config.lanIp, INSTANCES.map((i) => i.port));
  if (upnpState.error) log(`UPnP: ${upnpState.error}`);
  else if (upnpState.ip !== prev) log(`UPnP: роутер ${upnpState.model ?? ""} внешний адрес ${upnpState.ip}, проброшены UDP ${upnpState.mapped.join(", ")}`);
}

// Язык сообщений сервера: CounterStrikeSharp берёт его из core.json, MatchZy переведён (lang/ru.json).
// По умолчанию там "en" — ставим "ru" (и возвращаем, если обновление плагинов перезапишет файл).
// Движок читает файл при старте, поэтому язык меняется со следующего запуска сервера.
const CSS_CORE = path.join(SERVER_DIR, "game", "csgo", "addons", "counterstrikesharp", "configs", "core.json");
function ensureServerLanguage() {
  if (!existsSync(CSS_CORE)) return;
  const text = readFileSync(CSS_CORE, "utf8");
  const m = /"ServerLanguage"\s*:\s*"([^"]*)"/.exec(text);
  if (!m || m[1] === "ru") return;
  writeFileSync(CSS_CORE, text.replace(m[0], '"ServerLanguage": "ru"'));
  log(`язык сервера: ${m[1]} → ru (сообщения MatchZy на русском со следующего запуска серверов)`);
}

// Админы сайта → админы MatchZy (cfg/MatchZy/admins.json): .asay, пауза, откат раунда прямо из игры.
// Свои записи помечаем значением "f16" и меняем только их — добавленные вручную не трогаем.
const MATCHZY_ADMINS = path.join(SERVER_DIR, "game", "csgo", "cfg", "MatchZy", "admins.json");
async function syncMatchzyAdmins(siteAdmins) {
  if (!Array.isArray(siteAdmins)) return;
  const current = readJsonSafe(MATCHZY_ADMINS, {});
  const next = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== "f16"));
  for (const id of siteAdmins) if (/^\d{17}$/.test(id) && !(id in next)) next[id] = "f16";
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  mkdirSync(path.dirname(MATCHZY_ADMINS), { recursive: true });
  writeFileSync(MATCHZY_ADMINS, JSON.stringify(next, null, 2));
  log(`MatchZy admins: ${Object.keys(next).length} (с сайта: ${siteAdmins.length})`);
  for (const inst of INSTANCES) await rcon(inst.port, secrets.rcon, "reload_admins").catch(() => {});
}

// Чистка бэкапов раундов и демо старше срока из настроек сайта (раз в час). Файлы матчей,
// которые сейчас на серверах, не трогаем — по ним может понадобиться откат раунда.
let cleanupAt = 0;
function cleanupBackups(days) {
  if (!Number.isFinite(days) || days < 1 || Date.now() - cleanupAt < 60 * 60_000) return;
  cleanupAt = Date.now();
  const cutoff = Date.now() - days * 86_400_000;
  const active = new Set(Object.values(assignments).map((a) => String(a.matchid)));
  const csgo = path.join(SERVER_DIR, "game", "csgo");
  const targets = [
    { dir: path.join(csgo, "MatchZyDataBackup"), re: /^matchzy_(\d+)_.*\.json$/ },
    { dir: csgo, re: /^matchzy_(\d+)_.*\.txt$/ },
    { dir: path.join(csgo, "MatchZy"), re: /_(\d+)_map\d+_.*\.dem$/ },
  ];
  let removed = 0;
  for (const { dir, re } of targets) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = re.exec(f);
      if (!m || active.has(m[1])) continue;
      const full = path.join(dir, f);
      try {
        if (statSync(full).mtimeMs < cutoff) {
          rmSync(full, { force: true });
          removed++;
        }
      } catch {}
    }
  }
  if (removed) log(`очистка: удалено ${removed} бэкапов/демо старше ${days} дн.`);
}

// фразы, которые в ru.json MatchZy остались по-английски
const MATCHZY_RU = {
  "matchzy.ready.readytotestorebackupinfomessage": "Не готовы: {0}. Напишите .ready, когда будете готовы восстановить раунд. {1}",
  "matchzy.restore.loadedsuccessfully": "Бэкап раунда загружен: {0}",
  "matchzy.restore.stopcommandrequiresnodamage": "Переиграть раунд нельзя: кто-то уже нанёс урон сопернику.",
};
const MATCHZY_RU_FILE = path.join(SERVER_DIR, "game", "csgo", "addons", "counterstrikesharp", "plugins", "MatchZy", "lang", "ru.json");
function ensureMatchzyRu() {
  if (!existsSync(MATCHZY_RU_FILE)) return;
  const raw = readFileSync(MATCHZY_RU_FILE, "utf8").replace(/^\uFEFF/, "");
  const json = JSON.parse(raw);
  const fix = Object.entries(MATCHZY_RU).filter(([k, v]) => k in json && json[k] !== v);
  if (!fix.length) return;
  for (const [k, v] of fix) json[k] = v;
  writeFileSync(MATCHZY_RU_FILE, JSON.stringify(json, null, 2));
  log(`MatchZy ru.json: переведено ${fix.length} фраз`);
}

async function tick() {
  await flushCommandResults().catch((e) => log("ack retry failed", e.message));
  try {
    ensureServerLanguage();
    ensureMatchzyRu();
    await ensureHudPlugin().catch((e) => log(`F16Hud: ${e.message}`));
  } catch (e) {
    log(`язык сервера: ${e.message}`);
  }
  await refreshUpnp().catch(() => {});
  const [info, instances] = await Promise.all([collectHostInfo(), collectInstances()]);
  const publicInfo = { ...Object.fromEntries(Object.entries(info).filter(([k]) => k !== "_cpu")), upnp: upnpState, pending_results: commandJournal.pendingResults, protocol: 2 };
  const events = pendingEvents.slice();
  const t0 = Date.now();
  const { commands, bundle_version, admins, backup_days } = await api("/api/agent/sync", { protocol: 2, lan_ip: config.lanIp, info: publicInfo, instances, events });
  commandJournal.accept(commands ?? []);
  await syncMatchzyAdmins(admins).catch((e) => log(`MatchZy admins: ${e.message}`));
  try {
    cleanupBackups(Number(backup_days ?? 1));
  } catch (e) {
    log(`очистка: ${e.message}`);
  }
  rtts.push(Date.now() - t0);
  if (rtts.length > 10) rtts.shift();
  if (events.length) {
    // доставлены — убираем (новые, пришедшие во время синхронизации, остаются)
    pendingEvents = pendingEvents.slice(events.length);
    writeFileSync(EVENTS_FILE, JSON.stringify(pendingEvents));
  }

  // сайт уже пометил эти команды «отправлено» — выполняем их ДО самообновления, иначе они потеряются
  for (const cmd of commands ?? []) {
    if (!commandJournal.begin(cmd.id)) continue;
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
    commandJournal.complete(cmd.id, r);
    await flushCommandResults().catch((e) => log("ack failed; сохранён для повтора", e.message));
  }
  await flushCommandResults().catch((e) => log("ack retry failed", e.message));

  // на сайте новая версия агента/скриптов/конфигов → обновляемся и перезапускаемся (F16-agent.bat поднимет снова).
  // Не во время автоподъёма сервера — дождёмся конца.
  if (!busy && !recovering.size && bundle_version && bundle_version !== localBundleVersion(F16_DIR)) {
    const r = await applyBundle({ siteUrl: config.siteUrl, token: config.token, f16Dir: F16_DIR, serverDir: SERVER_DIR });
    log(`обновление агента ${localBundleVersion(F16_DIR)}: ${r.count} файлов, перезапуск`);
    process.exit(0);
  }
}

await relay.start();
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
