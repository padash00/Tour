// Демо матчей: MatchZy пишет .dem каждой карты в game/csgo/MatchZy/ (matchzy_demo_name_format в config.cfg).
// Агент сообщает сайту готовые записи, а игроки скачивают их прямо с серверного ПК: сайт выдаёт ссылку,
// подписанную HMAC на токене агента, агент отдаёт файл со своего порта (TCP, проброшен по UPnP).
// В облако демо не уходят — на Vercel запрос ограничен 4.5 МБ, а демо 5×5 весит 80–150 МБ.
//
// Чтобы скачивание не мешало идущим матчам: не больше MAX_ACTIVE загрузок сразу и общий лимит скорости
// (agent.json "demoRateMbit", по умолчанию 40 Мбит/с) — делится поровну между активными загрузками.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Transform } from "node:stream";

// {TIME}_{MATCH_ID}_map{MAPNUMBER}_{MAP}_{TEAM1}_vs_{TEAM2}.dem
const FILE_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(\d+)_map(\d+)_.+\.dem$/;
const SETTLED_MS = 90_000; // файл не менялся 1.5 мин — запись карты закончена
const MAX_ACTIVE = 3;
const MAX_LISTED = 200;

/** Подпись ссылки: то же вычисляет сайт (src/lib/demos.ts) */
export function demoSignature(token, file, exp, name) {
  return createHmac("sha256", token).update(`${file}\n${exp}\n${name}`).digest("hex");
}

export function createDemos({ dir, port, token, rateMbit, isLive, log }) {
  let active = 0;
  let listed = { at: 0, files: [] };

  /** Готовые демо, новые первыми. isLive(matchid, map) — карта ещё идёт, её файл не показываем */
  function list() {
    if (Date.now() - listed.at < 30_000) return listed.files;
    const files = [];
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        const m = FILE_RE.exec(file);
        if (!m) continue;
        try {
          const st = statSync(path.join(dir, file));
          if (!st.isFile() || st.size === 0 || Date.now() - st.mtimeMs < SETTLED_MS) continue;
          const matchzy_id = Number(m[1]);
          const map = Number(m[2]);
          if (isLive(matchzy_id, map)) continue;
          files.push({ file, matchzy_id, map, size: st.size, at: new Date(st.mtimeMs).toISOString() });
        } catch {}
      }
    }
    files.sort((a, b) => (a.at < b.at ? 1 : -1));
    listed = { at: Date.now(), files: files.slice(0, MAX_LISTED) };
    return listed.files;
  }

  // общий лимит скорости: каждый кусок ждёт свою долю полосы
  const bytesPerSec = Math.max(1, Number(rateMbit) || 40) * 125_000;
  const throttle = () =>
    new Transform({
      transform(chunk, _enc, done) {
        const share = bytesPerSec / Math.max(1, active);
        setTimeout(() => done(null, chunk), Math.round((chunk.length / share) * 1000));
      },
    });

  const send = (res, status, text, headers = {}) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
    res.end(text);
  };

  function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://agent");
    if (req.method !== "GET" || url.pathname !== "/demo") return send(res, 404, "F16 Arena: не найдено");
    const file = url.searchParams.get("f") ?? "";
    const exp = url.searchParams.get("e") ?? "";
    const name = url.searchParams.get("n") ?? "";
    const sig = url.searchParams.get("s") ?? "";
    const want = Buffer.from(demoSignature(token, file, exp, name));
    const got = Buffer.from(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return send(res, 403, "Ссылка недействительна — откройте её заново со страницы матча");
    if (!/^\d+$/.test(exp) || Number(exp) * 1000 < Date.now()) return send(res, 410, "Ссылка устарела — откройте её заново со страницы матча");
    // только имя файла из папки демо: без путей, по тому же шаблону, что и в списке
    if (path.basename(file) !== file || !FILE_RE.test(file)) return send(res, 404, "Демо не найдено");
    const full = path.join(dir, file);
    let st;
    try {
      st = statSync(full);
    } catch {
      return send(res, 404, "Демо удалено с сервера");
    }
    if (active >= MAX_ACTIVE) return send(res, 503, "Сервер сейчас отдаёт другие демо — попробуйте через пару минут", { "Retry-After": "120" });

    // докачка: Range: bytes=start-[end]
    let start = 0;
    let end = st.size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(end, Number(range[2]));
      } else {
        start = Math.max(0, st.size - Number(range[2]));
      }
      if (start > end || start >= st.size) return send(res, 416, "Неверный диапазон", { "Content-Range": `bytes */${st.size}` });
    }
    const safeName = (/^[\w.-]{1,120}\.dem$/.test(name) ? name : "f16-demo.dem");
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${st.size}` } : {}),
    });
    active++;
    const ip = req.socket.remoteAddress ?? "?";
    if (start === 0) log(`демо: ${file} → ${ip} (${Math.round(st.size / 1e6)} МБ)`);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    const source = createReadStream(full, { start, end, highWaterMark: 256 * 1024 });
    const limiter = throttle();
    res.on("close", () => {
      release();
      source.destroy();
      limiter.destroy();
    });
    source.on("error", () => res.destroy());
    source.pipe(limiter).pipe(res);
  }

  function start() {
    const server = http.createServer((req, res) => {
      try {
        handle(req, res);
      } catch (e) {
        log(`демо: ${e?.message ?? e}`);
        if (!res.headersSent) send(res, 500, "Ошибка сервера");
        else res.destroy();
      }
    });
    server.on("error", (e) => log(`демо: порт ${port} недоступен — ${e.message}`));
    server.listen(port, "0.0.0.0", () => log(`демо: раздача на TCP ${port}`));
  }

  return { list, start, port, get active() { return active; } };
}
