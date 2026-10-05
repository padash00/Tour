// F16 Server Agent без окна, с входа пользователя в Windows.
// Задача Планировщика «F16 Server Agent» (её создаёт service.ps1) запускает:
//   node D:\cs2server\f16\agent\service.mjs
// Сторож один раз поднимает активные серверы CS2 (start.ps1 -Active), дальше держит agent.mjs живым:
// агент упал или обновился (выходит сам после самообновления) — через 5 секунд запускается снова, уже новый код.
// Лог — в D:\cs2server\f16\agent.log (окна нет — заморозить кликом нечего).
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, openSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F16_DIR = path.dirname(HERE);
const LOG = path.join(F16_DIR, "agent.log");
const START_PS1 = path.join(F16_DIR, "start.ps1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    p.on("error", (e) => resolve(`ошибка запуска: ${e.message}`));
    p.on("exit", (code) => resolve(`код ${code}`));
  });
}

note("старт службы");
if (process.argv.includes("--no-servers")) note("серверы CS2 не поднимаю (--no-servers)");
else note(`активные серверы CS2: ${await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", START_PS1, "-Active"])}`);

for (;;) {
  const started = Date.now();
  const result = await run(process.execPath, [path.join(HERE, "agent.mjs")]);
  note(`агент завершился (${result}), перезапуск через 5 с`);
  // падает сразу и раз за разом (нет сети, сломан конфиг) — не крутим впустую, ждём дольше
  await sleep(Date.now() - started < 10_000 ? 30_000 : 5_000);
}
