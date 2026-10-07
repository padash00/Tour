// Буфер событий на серверном ПК: защита от обрыва интернета в клубе.
//
// MatchZy (matchzy_remote_log_url) и HTTP-лог CS2 (logaddress_add_http) шлют события сюда, на 127.0.0.1,
// а не на сайт. Каждое событие сразу пишется на диск (outbox/) и досылается на сайт с повторами.
// Если связь пропала — события копятся на диске и уходят, когда она вернётся;
// перезапуск агента их не теряет. Сайт отбрасывает повторы (ответ мог потеряться), поэтому
// досылать безопасно.
//
// Очередь разбита на дорожки: события одного матча (и отдельно его HTTP-лог) идут строго по порядку,
// а разные матчи друг друга не ждут. Сайт раз за разом отвечает ошибкой 5xx на одно событие
// (не обрыв связи, а сбой обработки) — через PARK_AFTER_MS и PARK_AFTER_ATTEMPTS событие уходит
// в outbox/failed, и дорожка идёт дальше. Отложенные события админ возвращает в очередь командой
// replay_failed_events. Обрыв связи (сайт не ответил вовсе) ничего не откладывает — ждём сколько нужно.
//
// Конфиг матча агент скачивает с сайта при загрузке матча и отдаёт MatchZy отсюда же (/config/<id>):
// после падения сервера матч можно загрузить заново даже без интернета.
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

// файловые операции очереди не должны ронять цикл досылки (файл мог исчезнуть)
const quiet = (fn) => {
  try {
    fn();
  } catch {}
};

const RETRY_MAX_MS = 30_000;
const PARK_AFTER_MS = 5 * 60_000;
const PARK_AFTER_ATTEMPTS = 10;

/** Дорожка события: матч MatchZy или HTTP-лог матча. Только [\w], потому что она часть имени файла */
export function laneOf(item) {
  const clean = (s) => String(s ?? "x").replace(/[^\w]/g, "").slice(0, 24) || "x";
  if (String(item.path).startsWith("/api/cs2/log")) {
    const m = /[?&]m=([^&]*)/.exec(item.path)?.[1];
    return `log${clean(m)}`;
  }
  try {
    return `mz${clean(JSON.parse(item.body)?.matchid)}`;
  } catch {
    return "mzx";
  }
}

/** Имя файла: <время>-<порядковый>-<дорожка>.json; у файлов прежней версии дорожки нет */
export const laneOfFile = (name) => /^\d+-\d+-(\w+)\.json$/.exec(name)?.[1] ?? "legacy";

export function createRelay({
  port = 27099,
  dir,
  siteUrl,
  log = () => {},
  onMatchzyEvent = null,
  parkAfterMs = PARK_AFTER_MS,
  parkAfterAttempts = PARK_AFTER_ATTEMPTS,
  retryMaxMs = RETRY_MAX_MS,
  idleMs = 2000,
}) {
  const outbox = path.join(dir, "outbox");
  const failedDir = path.join(outbox, "failed");
  const configDir = path.join(dir, "match-configs");
  for (const d of [outbox, failedDir, configDir]) mkdirSync(d, { recursive: true });

  let seq = 0;
  let running = false;
  let lastError = null;
  let lastOkAt = null;
  let wake = null;
  const workers = new Map(); // дорожка → работающая досылка
  const offline = { since: null, attempts: 0 }; // сайт недоступен вовсе: общий признак для всех дорожек

  const list = () => readdirSync(outbox).filter((f) => f.endsWith(".json")).sort();
  const failedList = () => readdirSync(failedDir).filter((f) => f.endsWith(".json")).sort();

  /** Атомарная запись: сначала .tmp, затем rename — обрыв питания не оставит полфайла */
  function enqueue(item) {
    const name = `${Date.now().toString().padStart(15, "0")}-${String(seq++).padStart(6, "0")}-${laneOf(item)}.json`;
    const tmp = path.join(outbox, `${name}.tmp`);
    writeFileSync(tmp, JSON.stringify(item));
    renameSync(tmp, path.join(outbox, name));
    if (wake) wake();
  }

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > 8 * 1024 * 1024) {
          reject(new Error("too large"));
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://relay");
    const send = (code, body, type = "application/json") => {
      res.writeHead(code, { "Content-Type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    try {
      if (req.method === "POST" && url.pathname === "/matchzy/events") {
        const body = await readBody(req);
        const token = req.headers["x-f16-token"];
        enqueue({ path: "/api/matchzy/events", headers: { "Content-Type": "application/json", ...(token ? { "X-F16-Token": String(token) } : {}) }, body });
        // Локальные настройки матча применяются сразу, даже если связь с сайтом пропала.
        if (onMatchzyEvent) {
          try { await onMatchzyEvent(JSON.parse(body), token); }
          catch (e) { log(`локальное событие MatchZy: ${e?.message ?? e}`); }
        }
        return send(200, { ok: true, queued: true });
      }
      if (req.method === "POST" && url.pathname === "/cs2/log") {
        const body = await readBody(req);
        enqueue({ path: `/api/cs2/log?${url.searchParams.toString()}`, headers: { "Content-Type": "text/plain" }, body });
        return send(200, { ok: true, queued: true });
      }
      if (req.method === "GET" && url.pathname.startsWith("/config/")) {
        const id = url.pathname.slice("/config/".length);
        const f = path.join(configDir, `${id.replace(/[^\w-]/g, "")}.json`);
        if (!existsSync(f)) return send(404, { error: "no cached config" });
        return send(200, readFileSync(f, "utf8"));
      }
      if (req.method === "GET" && url.pathname === "/health") return send(200, stats());
      send(404, { error: "not found" });
    } catch (e) {
      send(500, { error: String(e?.message ?? e) });
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Раздаёт дорожки работникам: у каждой дорожки с событиями — свой, независимый от остальных */
  async function scheduleLoop() {
    for (;;) {
      try {
        for (const f of list()) {
          const lane = laneOfFile(f);
          if (!workers.has(lane)) workers.set(lane, laneWorker(lane).finally(() => workers.delete(lane)));
        }
      } catch (e) {
        lastError = String(e?.message ?? e);
      }
      await new Promise((r) => {
        wake = r;
        setTimeout(r, idleMs);
      });
      wake = null;
    }
  }

  /** Досылка одной дорожки по порядку, пока в ней есть события */
  async function laneWorker(lane) {
    const state = { attempts: 0, failingSince: null, file: null };
    for (;;) {
      const files = list().filter((f) => laneOfFile(f) === lane);
      if (!files.length) return;
      try {
        await forwardHead(lane, files[0], state);
      } catch (e) {
        lastError = String(e?.message ?? e);
        await sleep(2000);
      }
    }
  }

  const park = (name, reason) => {
    quiet(() => renameSync(path.join(outbox, name), path.join(failedDir, name)));
    lastError = `${reason} — событие отложено в outbox/failed`;
  };

  /** Один шаг дорожки: первое событие ушло, отложено или ждёт повтора */
  async function forwardHead(lane, name, state) {
    if (state.file !== name) Object.assign(state, { attempts: 0, failingSince: null, file: name });
    const file = path.join(outbox, name);
    let item;
    try {
      item = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      park(name, "битый файл"); // не блокирует дорожку
      return;
    }
    let status = 0;
    try {
      const res = await fetch(`${siteUrl}${item.path}`, {
        method: "POST",
        headers: item.headers,
        body: item.body,
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
    } catch (e) {
      lastError = String(e?.cause?.code ?? e?.message ?? e);
    }
    if (status >= 200 && status < 300) {
      quiet(() => unlinkSync(file));
      lastOkAt = new Date().toISOString();
      if (offline.attempts > 2) log(`буфер: связь восстановлена, досылаю очередь (${list().length})`);
      offline.attempts = 0;
      offline.since = null;
      lastError = null;
      return;
    }
    // сайт отклонил событие (неверный токен/формат/чужой матч) — повтор не поможет
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      park(name, `HTTP ${status}`);
      log(`буфер: ${item.path.split("?")[0]} → ${lastError}`);
      return;
    }
    if (!status) {
      // сайт недоступен вовсе: это обрыв связи — ничего не откладываем, просто ждём
      offline.attempts++;
      offline.since ??= Date.now();
      if (offline.attempts === 1 || offline.attempts % 20 === 0) log(`буфер: сайт недоступен (${lastError}), в очереди ${list().length}`);
      await sleep(Math.min(retryMaxMs, 1000 * 2 ** Math.min(offline.attempts - 1, 5)));
      return;
    }
    // сайт ответил, но обработать не смог (5xx, 408, 429)
    lastError = `HTTP ${status}`;
    state.attempts++;
    state.failingSince ??= Date.now();
    if (state.attempts >= parkAfterAttempts && Date.now() - state.failingSince >= parkAfterMs) {
      park(name, `HTTP ${status} ${state.attempts} раз за ${Math.round((Date.now() - state.failingSince) / 1000)} с`);
      log(`буфер: дорожка ${lane}: ${lastError}`);
      return;
    }
    if (state.attempts === 1 || state.attempts % 10 === 0) log(`буфер: дорожка ${lane}: сайт ответил ${status}, повтор ${state.attempts}`);
    await sleep(Math.min(retryMaxMs, 1000 * 2 ** Math.min(state.attempts - 1, 5)));
  }

  const ageOf = (name, dirPath) => {
    const ts = Number(name.split("-")[0]);
    if (Number.isFinite(ts) && ts > 0) return Math.round((Date.now() - ts) / 1000);
    try {
      return Math.round((Date.now() - statSync(path.join(dirPath, name)).mtimeMs) / 1000);
    } catch {
      return 0;
    }
  };

  function stats() {
    const files = list();
    const failed = failedList();
    return {
      running,
      port,
      queued: files.length,
      lanes: new Set(files.map(laneOfFile)).size,
      oldest_age_s: files[0] ? ageOf(files[0], outbox) : 0,
      failed: failed.length,
      failed_oldest_age_s: failed[0] ? ageOf(failed[0], failedDir) : 0,
      last_error: lastError,
      last_ok_at: lastOkAt,
    };
  }

  /** Отложенные события → обратно в очередь (по порядку времени, со своими дорожками) */
  function replayFailed() {
    let moved = 0;
    for (const name of failedList()) {
      try {
        renameSync(path.join(failedDir, name), path.join(outbox, name));
        moved++;
      } catch {}
    }
    if (wake) wake();
    return moved;
  }

  /** Конфиг матча с сайта — на диск, чтобы MatchZy мог загрузить матч и без интернета */
  function saveConfig(matchId, json) {
    writeFileSync(path.join(configDir, `${String(matchId).replace(/[^\w-]/g, "")}.json`), json);
  }
  const hasConfig = (matchId) => existsSync(path.join(configDir, `${String(matchId).replace(/[^\w-]/g, "")}.json`));

  function start() {
    return new Promise((resolve) => {
      server.once("error", (e) => {
        log(`буфер событий не запущен (${e.code ?? e.message}) — события пойдут на сайт напрямую`);
        resolve(false);
      });
      server.listen(port, "127.0.0.1", () => {
        running = true;
        log(`буфер событий: 127.0.0.1:${port}, в очереди ${list().length}, отложено ${failedList().length}`);
        scheduleLoop();
        resolve(true);
      });
    });
  }

  const base = `http://127.0.0.1:${port}`;
  return {
    start,
    stats,
    saveConfig,
    hasConfig,
    replayFailed,
    get running() {
      return running;
    },
    urls: {
      events: `${base}/matchzy/events`,
      log: (query) => `${base}/cs2/log?${query}`,
      config: (matchId) => `${base}/config/${matchId}`,
    },
  };
}
