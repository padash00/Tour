// F16 Server Agent без окна, с входа пользователя в Windows.
// Задача Планировщика «F16 Server Agent» (её создаёт service.ps1) запускает:
//   node D:\cs2server\f16\agent\service.mjs
// При запуске без --no-servers поднимает активные серверы CS2 (start.ps1 -Active),
// дальше держит agent.mjs живым:
// агент упал или обновился (выходит сам после самообновления) — через 5 секунд запускается снова, уже новый код.
// Новая версия агента падает в первую минуту после запуска три раза подряд — служба возвращает
// прежнюю версию из prev/ и помечает новую отклонённой (агент не скачает её снова).
// Лог — в D:\cs2server\f16\agent.log (окна нет — заморозить кликом нечего).
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, openSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UPDATE_EXIT_CODE, rollbackBundle } from "./bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F16_DIR = path.dirname(HERE);
const SERVER_DIR = process.env.F16_SERVER_DIR ?? path.dirname(F16_DIR);
const LOG = path.join(F16_DIR, "agent.log");
const START_PS1 = path.join(F16_DIR, "start.ps1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const QUICK_EXIT_MS = 60_000;
const ROLLBACK_AFTER_QUICK_EXITS = 3;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const note = (msg) => appendFileSync(LOG, `${stamp()} [служба] ${msg}\n`);

/** Лог больше 20 МБ — в agent.log.1 (один старый файл), чтобы диск не забивался */
function rotate() {
  try {
    if (existsSync(LOG) && statSync(LOG).size > 20 * 1024 * 1024) renameSync(LOG, `${LOG}.1`);
  } catch {}
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    rotate();
    const out = openSync(LOG, "a");
    const p = spawn(cmd, args, { cwd: F16_DIR, windowsHide: true, stdio: ["ignore", out, out], ...opts });
    p.on("error", (e) => resolve({ code: null, text: `ошибка запуска: ${e.message}` }));
    p.on("exit", (code) => resolve({ code, text: `код ${code}` }));
  });
}

note("старт службы");
if (process.argv.includes("--no-servers")) note("серверы CS2 не поднимаю (--no-servers)");
else note(`активные серверы CS2: ${(await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", START_PS1, "-Active"])).text}`);

let quickExits = 0;
for (;;) {
  const started = Date.now();
  // путь к agent.mjs каждый раз заново: после отката папка agent/ — уже другая
  const result = await run(process.execPath, [path.join(F16_DIR, "agent", "agent.mjs")]);
  const updated = result.code === UPDATE_EXIT_CODE;
  const quick = !updated && Date.now() - started < QUICK_EXIT_MS;
  quickExits = quick ? quickExits + 1 : 0;
  note(`агент завершился (${updated ? "обновление" : result.text}), перезапуск через 5 с`);
  if (quickExits >= ROLLBACK_AFTER_QUICK_EXITS) {
    try {
      const r = await rollbackBundle({ f16Dir: F16_DIR, serverDir: SERVER_DIR, reason: `агент ${quickExits} раза подряд завершился в первую минуту (${result.text})` });
      if (r) {
        note(`откат обновления агента: ${r.from} → ${r.to}`);
        quickExits = 0;
        continue;
      }
    } catch (e) {
      note(`откат не удался: ${e?.message ?? e}`);
    }
  }
  // падает сразу и раз за разом (нет сети, сломан конфиг) — не крутим впустую, ждём дольше
  await sleep(updated ? 1_000 : quick ? 30_000 : 5_000);
}
