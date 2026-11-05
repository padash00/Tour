// Видео-клипы из демки от первого лица: CS2 (обычный клиент) проигрывает демку, ffmpeg записывает окно.
//   node record.mjs <файл.dem> <clips.json> <папка для mp4>
// clips.json: [{ "id": "hl-1", "start": тик, "end": тик, "player": "ник" }]
// CS2 управляется через сетевую консоль (-netconport). Нужен Steam с CS2 и видеокарта — запускается на ПК клуба.
// ЧЕРНОВИК, не работает: 05.11 CS2 запустилась, но сетевая консоль не открылась (видимо, нужен -netconpassword);
// перезапуск игры автоматика проверки не разрешила. Следующий шаг — проверить с паролем.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const GAME = process.env.F16_CS2_CLIENT ?? "D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive";
const STEAM = process.env.F16_STEAM ?? "C:/Program Files (x86)/Steam/steam.exe";
const PORT = 2121;
const TR = 64;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [, , demo, clipsFile, outDir] = process.argv;
if (!demo || !clipsFile || !outDir) {
  console.error("node record.mjs <файл.dem> <clips.json> <папка для mp4>");
  process.exit(1);
}
const clips = JSON.parse(readFileSync(clipsFile, "utf8"));
mkdirSync(outDir, { recursive: true });

// демку — в папку игры (playdemo берёт путь от game/csgo)
const dir = path.join(GAME, "game", "csgo", "f16clips");
mkdirSync(dir, { recursive: true });
const name = path.basename(demo, ".dem").replace(/[^\w-]/g, "_");
copyFileSync(demo, path.join(dir, `${name}.dem`));

function connect() {
  return new Promise((resolve, reject) => {
    const s = net.connect(PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
}
async function waitConsole(ms = 180_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { return await connect(); } catch { await sleep(2000); }
  }
  throw new Error("CS2 не открыла консоль за 3 минуты");
}

// запуск CS2 через Steam: окно 1920×1080 без рамки, сетевая консоль, сразу демка
spawn(STEAM, ["-applaunch", "730", "-novid", "-windowed", "-noborder", "-w", "1920", "-h", "1080", "-netconport", String(PORT), "+playdemo", `f16clips/${name}`], { detached: true, stdio: "ignore" }).unref();
console.log("запускаю CS2…");
const con = await waitConsole();
const cmd = (c) => con.write(`${c}\n`);
console.log("консоль CS2 подключена, жду загрузку демки…");
await sleep(25_000);

// чистый кадр: только лента убийств, без лишнего интерфейса демо
for (const c of ["demoui 0", "cl_draw_only_deathnotices 1", "volume 0", "demo_timescale 1", "net_graph 0", "cl_showfps 0"]) cmd(c);

for (const clip of clips) {
  const from = Math.max(0, clip.start - 4 * TR);
  const dur = (clip.end - from) / TR + 3;
  cmd(`demo_gototick ${from}`);
  await sleep(4000);
  cmd(`spec_player "${clip.player}"`);
  cmd("spec_mode 4"); // от первого лица
  cmd("demo_pause");
  await sleep(1500);
  const out = path.join(outDir, `${clip.id}.mp4`);
  const rec = spawn("ffmpeg", ["-y", "-f", "gdigrab", "-framerate", "60", "-i", "title=Counter-Strike 2", "-t", String(dur.toFixed(1)), "-vf", "scale=1280:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "ignore" });
  await sleep(300);
  cmd("demo_resume");
  await new Promise((r) => rec.on("exit", r));
  cmd("demo_pause");
  console.log(existsSync(out) ? `✓ ${clip.id}: ${(statSync(out).size / 1e6).toFixed(1)} МБ, ${dur.toFixed(0)} с` : `✗ ${clip.id}: не записался`);
}
cmd("quit");
con.end();
void execFileSync;
