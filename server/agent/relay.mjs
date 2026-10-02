// Буфер событий на серверном ПК: защита от обрыва интернета в клубе.
//
// MatchZy (matchzy_remote_log_url) и HTTP-лог CS2 (logaddress_add_http) шлют события сюда, на 127.0.0.1,
// а не на сайт. Каждое событие сразу пишется на диск (outbox/) и досылается на сайт по порядку
// с повторами. Если связь пропала — события копятся на диске и уходят, когда она вернётся;
// перезапуск агента их не теряет. Сайт отбрасывает повторы (ответ мог потеряться), поэтому
// досылать безопасно.
//
// Конфиг матча агент скачивает с сайта при загрузке матча и отдаёт MatchZy отсюда же (/config/<id>):
// после падения сервера матч можно загрузить заново даже без интернета.
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

// файловые операции очереди не должны ронять цикл досылки (файл мог исчезнуть)
const quiet = (fn) => {
  try {
    fn();
  } catch {}
};
import path from "node:path";

const RETRY_MAX_MS = 30_000;

export function createRelay({ port = 27099, dir, siteUrl, log = () => {} }) {
  const outbox = path.join(dir, "outbox");
  const failedDir = path.join(outbox, "failed");
  const configDir = path.join(dir, "match-configs");
  for (const d of [outbox, failedDir, configDir]) mkdirSync(d, { recursive: true });

  let seq = 0;
  let running = false;
  let lastError = null;
  let lastOkAt = null;
  let attempt = 0;
  let wake = null;

  const list = () => readdirSync(outbox).filter((f) => f.endsWith(".json")).sort();

  /** Атомарная запись: сначала .tmp, затем rename — обрыв питания не оставит полфайла */
  function enqueue(item) {
    const name = `${Date.now().toString().padStart(15, "0")}-${String(seq++).padStart(6, "0")}.json`;
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

  /** Досылка по порядку: первое событие не ушло — следующие ждут (порядок событий матча важен) */
  async function forwardLoop() {
    for (;;) {
      try {
        await forwardOnce();
      } catch (e) {
        lastError = String(e?.message ?? e);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /** Один шаг досылки: первое событие очереди или ожидание */
  async function forwardOnce() {
    const files = list();
    if (!files.length) {
      attempt = 0;
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 2000);
      });
      wake = null;
      return;
    }
    const file = path.join(outbox, files[0]);
    let item;
    try {
      item = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      quiet(() => renameSync(file, path.join(failedDir, files[0]))); // битый файл — в сторону, не блокирует очередь
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
      if (attempt > 2) log(`буфер: связь восстановлена, досылаю очередь (${list().length})`);
      attempt = 0;
      lastError = null;
      return;
    }
    // сайт отклонил событие (неверный токен/формат) — повтор не поможет, откладываем в failed/
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      quiet(() => renameSync(file, path.join(failedDir, files[0])));
      lastError = `HTTP ${status} — событие отложено в outbox/failed`;
      log(`буфер: ${item.path.split("?")[0]} → ${lastError}`);
      return;
    }
    if (status) lastError = `HTTP ${status}`;
    attempt++;
    if (attempt === 1 || attempt % 20 === 0) log(`буфер: сайт недоступен (${lastError}), в очереди ${files.length}`);
    await new Promise((r) => setTimeout(r, Math.min(RETRY_MAX_MS, 1000 * 2 ** Math.min(attempt - 1, 5))));
  }

  function stats() {
    const files = list();
    const oldest = files[0] ? Number(files[0].split("-")[0]) : null;
    return {
      running,
      port,
      queued: files.length,
      failed: readdirSync(failedDir).length,
      oldest_age_s: oldest ? Math.round((Date.now() - oldest) / 1000) : 0,
      last_error: lastError,
      last_ok_at: lastOkAt,
    };
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
        log(`буфер событий: 127.0.0.1:${port}, в очереди ${list().length}`);
        forwardLoop();
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
