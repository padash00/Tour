// Мелкое обслуживание серверного ПК на каждой синхронизации: язык сервера, перевод MatchZy,
// админы MatchZy, чистка старых бэкапов и демо, правило брандмауэра для RCON.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// фразы, которые в ru.json MatchZy остались по-английски
const MATCHZY_RU = {
  "matchzy.ready.readytotestorebackupinfomessage": "Не готовы: {0}. Напишите .ready, когда будете готовы восстановить раунд. {1}",
  "matchzy.restore.loadedsuccessfully": "Бэкап раунда загружен: {0}",
  "matchzy.restore.stopcommandrequiresnodamage": "Переиграть раунд нельзя: кто-то уже нанёс урон сопернику.",
};

/** ctx: { serverDir, f16Dir, stateDir, instances, rc(inst, command), log, activeMatchIds() → Set<string> } */
export function createHousekeeping({ serverDir, f16Dir, stateDir, instances, rc, log, activeMatchIds, rconPassword }) {
  const csgo = path.join(serverDir, "game", "csgo");
  const readJsonSafe = (p, fallback) => {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return fallback;
    }
  };

  // Язык сообщений сервера: CounterStrikeSharp берёт его из core.json, MatchZy переведён (lang/ru.json).
  // По умолчанию там "en" — ставим "ru" (и возвращаем, если обновление плагинов перезапишет файл).
  // Движок читает файл при старте, поэтому язык меняется со следующего запуска сервера.
  const cssCore = path.join(csgo, "addons", "counterstrikesharp", "configs", "core.json");
  function ensureServerLanguage() {
    if (!existsSync(cssCore)) return;
    const text = readFileSync(cssCore, "utf8");
    const m = /"ServerLanguage"\s*:\s*"([^"]*)"/.exec(text);
    if (!m || m[1] === "ru") return;
    writeFileSync(cssCore, text.replace(m[0], '"ServerLanguage": "ru"'));
    log(`язык сервера: ${m[1]} → ru (сообщения MatchZy на русском со следующего запуска серверов)`);
  }

  const matchzyRuFile = path.join(csgo, "addons", "counterstrikesharp", "plugins", "MatchZy", "lang", "ru.json");
  function ensureMatchzyRu() {
    if (!existsSync(matchzyRuFile)) return;
    const json = JSON.parse(readFileSync(matchzyRuFile, "utf8").replace(/^﻿/, ""));
    const fix = Object.entries(MATCHZY_RU).filter(([k, v]) => k in json && json[k] !== v);
    if (!fix.length) return;
    for (const [k, v] of fix) json[k] = v;
    writeFileSync(matchzyRuFile, JSON.stringify(json, null, 2));
    log(`MatchZy ru.json: переведено ${fix.length} фраз`);
  }

  // Админы сайта → админы MatchZy (cfg/MatchZy/admins.json): .asay, пауза, откат раунда прямо из игры.
  // Свои записи помечаем значением "f16" и меняем только их — добавленные вручную не трогаем.
  const matchzyAdmins = path.join(csgo, "cfg", "MatchZy", "admins.json");
  async function syncMatchzyAdmins(siteAdmins) {
    if (!Array.isArray(siteAdmins)) return;
    const current = readJsonSafe(matchzyAdmins, {});
    const next = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== "f16"));
    for (const id of siteAdmins) if (/^\d{17}$/.test(id) && !(id in next)) next[id] = "f16";
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    mkdirSync(path.dirname(matchzyAdmins), { recursive: true });
    writeFileSync(matchzyAdmins, JSON.stringify(next, null, 2));
    log(`MatchZy admins: ${Object.keys(next).length} (с сайта: ${siteAdmins.length})`);
    for (const inst of instances) await rc(inst, "reload_admins").catch(() => {});
  }

  // Чистка бэкапов раундов и демо старше срока из настроек сайта (раз в час). Файлы матчей,
  // которые сейчас на серверах, не трогаем — по ним может понадобиться откат раунда.
  let cleanupAt = 0;
  function cleanupBackups(days) {
    if (!Number.isFinite(days) || days < 1 || Date.now() - cleanupAt < 60 * 60_000) return;
    cleanupAt = Date.now();
    const cutoff = Date.now() - days * 86_400_000;
    const active = activeMatchIds();
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

  // RCON (TCP на игровом порту) — только с этого ПК: firewall.ps1 ставит запрещающее правило для входящих
  // TCP не с 127.0.0.1. UDP (игра) не трогаем. Повторяем при смене портов или скрипта; ошибка — в отчёт сайту.
  const firewallScript = path.join(f16Dir, "firewall.ps1");
  const firewallState = path.join(stateDir, "firewall.json");
  let firewall = readJsonSafe(firewallState, null);
  let firewallAt = 0;
  async function ensureFirewall() {
    if (process.platform !== "win32" || !existsSync(firewallScript)) return firewall;
    const key = createHash("sha256").update(readFileSync(firewallScript)).update(instances.map((i) => i.port).join(",")).digest("hex").slice(0, 12);
    if (firewall?.ok && firewall.key === key) return firewall;
    if (Date.now() - firewallAt < 30 * 60_000) return firewall; // ошибка — не повторяем на каждом тике
    firewallAt = Date.now();
    const result = await new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", firewallScript], { windowsHide: true, timeout: 60_000 }, (err, out, stderr) =>
        resolve(err ? { ok: false, error: String(stderr || err.message).trim().slice(0, 300) } : { ok: true, detail: String(out).trim().slice(0, 300) }),
      );
    });
    firewall = { ...result, key, ports: instances.map((i) => i.port), at: new Date().toISOString() };
    writeFileSync(firewallState, JSON.stringify(firewall));
    log(firewall.ok ? `брандмауэр: ${firewall.detail}` : `брандмауэр: не удалось закрыть RCON — ${firewall.error}`);
    return firewall;
  }

  // Задачи Планировщика агента — без мигающего окна консоли (hide-tasks.ps1). Удачный результат запоминаем по хэшу скрипта.
  const hideTasksScript = path.join(f16Dir, "hide-tasks.ps1");
  const hideTasksState = path.join(stateDir, "hide-tasks.json");
  let hideTasksAt = 0;
  async function ensureHiddenTasks() {
    if (process.platform !== "win32" || !existsSync(hideTasksScript)) return;
    const key = createHash("sha256").update(readFileSync(hideTasksScript)).digest("hex").slice(0, 12);
    if (readJsonSafe(hideTasksState, null)?.key === key) return;
    if (Date.now() - hideTasksAt < 30 * 60_000) return;
    hideTasksAt = Date.now();
    const result = await new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", hideTasksScript], { windowsHide: true, timeout: 60_000 }, (err, out, stderr) =>
        resolve(err ? { ok: false, text: String(stderr || err.message).trim().slice(0, 300) } : { ok: true, text: String(out).trim().slice(0, 300) }),
      );
    });
    if (result.ok) writeFileSync(hideTasksState, JSON.stringify({ key, at: new Date().toISOString() }));
    log(result.ok ? `планировщик: ${result.text}` : `планировщик: не удалось скрыть окно задач — ${result.text}`);
  }

  // Конфиг инстанса (hostname, RCON) пишет install.ps1. Новый инстанс в instances.csv (пришёл с сайта
  // вместе с агентом) получает свой cfg здесь — без ручного запуска install.ps1 на ПК.
  function ensureInstanceCfgs() {
    const dir = path.join(csgo, "cfg", "f16");
    if (!existsSync(dir) || !rconPassword) return;
    for (const inst of instances) {
      const file = path.join(dir, `${inst.name.toLowerCase()}.cfg`);
      if (existsSync(file)) continue;
      writeFileSync(file, ["// generated by F16 agent (same as install.ps1)", "exec f16/instance.cfg", `hostname "F16 Arena | ${inst.name}"`, `rcon_password "${rconPassword}"`, ""].join("\r\n"), "ascii");
      log(`конфиг нового инстанса: ${inst.name}`);
    }
  }

  return {
    ensureInstanceCfgs,
    ensureHiddenTasks,
    ensureServerLanguage,
    ensureMatchzyRu,
    syncMatchzyAdmins,
    cleanupBackups,
    ensureFirewall,
    get firewall() {
      return firewall && { ok: firewall.ok, ports: firewall.ports, error: firewall.error ?? null, at: firewall.at };
    },
  };
}
