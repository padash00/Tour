// Автоматика разбора: следит за демками сервера клуба (MatchZy пишет .dem каждой карты) и после каждой карты
// разбирает её, загружает на сайт (повтор карты) и делает разбор каждого игрока против топов.
//   node watch.mjs           — проход раз в 2 минуты, работает постоянно
//   node watch.mjs --once    — один проход и выход
// Игрок получает уведомление на сайте и в Telegram с итогом карты (только для карт за последние 6 часов).
// Запускается на серверном ПК отдельно от агента; на серверы и матчи не влияет (только читает готовые файлы).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, "cache");
const INDEX = path.join(CACHE, "index.json");
const DEMOS = process.env.F16_DEMOS_DIR ?? "D:/cs2server/game/csgo/MatchZy";
// {TIME}_{MATCH_ID}_map{MAPNUMBER}_{MAP}_{TEAM1}_vs_{TEAM2}.dem — как в server/agent/demos.mjs
const FILE_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(\d+)_map(\d+)_.+\.dem$/;
const SETTLED_MS = 120_000; // файл не менялся 2 минуты — карта дописана
const EVERY_MS = 120_000;
const log = (s) => console.log(`[${new Date().toLocaleTimeString("ru-RU")}] ${s}`);
const node = (args) => execFileSync(process.execPath, args, { cwd: HERE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60_000 });

function done() {
  if (!existsSync(INDEX)) return new Set();
  return new Set(Object.values(JSON.parse(readFileSync(INDEX, "utf8"))).map((x) => x.source));
}

function pass() {
  if (!existsSync(DEMOS)) return;
  const seen = done();
  const fresh = readdirSync(DEMOS)
    .filter((f) => FILE_RE.test(f) && !seen.has(f))
    .filter((f) => Date.now() - statSync(path.join(DEMOS, f)).mtimeMs > SETTLED_MS)
    .sort();
  for (const f of fresh) {
    const [, matchzy, mapIdx] = FILE_RE.exec(f);
    try {
      // 1) повтор карты на сайт (сайт сам находит матч турнира или игру лобби по номеру MatchZy)
      const out = node(["upload.mjs", path.join(DEMOS, f), "--kind", "match", "--matchzy", matchzy, "--map-number", String(Number(mapIdx) + 1)]);
      const id = /→ ([0-9a-f-]{36})/.exec(out)?.[1];
      if (!id) { log(`✗ ${f}: ${out.trim().split("\n").pop()}`); continue; }
      log(`✓ повтор: ${f} → ${id}`);
      // 2) библиотека топов для этой карты есть локально? (её пишет learn.mjs)
      const a = JSON.parse(zlib.gunzipSync(readFileSync(path.join(CACHE, `${id}.json.gz`))).toString());
      if (!existsSync(path.join(CACHE, `knowledge-${a.map}.json`))) node(["learn.mjs", "--dry"]);
      if (!existsSync(path.join(CACHE, `knowledge-${a.map}.json`))) { log(`  нет про-демок на ${a.map} — разбор игроков пропущен`); continue; }
      // 3) разбор каждого игрока против топов
      for (const p of a.players.filter((x) => x.steamid)) {
        try {
          // уведомление игроку (сайт + Telegram) — только о свежих картах; старые демки при первом запуске — молча
          const fresh = Date.now() - statSync(path.join(DEMOS, f)).mtimeMs < 6 * 3600_000;
          const r = node(["coach.mjs", id, p.steamid, "--upload", ...(fresh ? [] : ["--no-notify"])]);
          log(`  ${r.includes("✓") ? "✓" : "✗"} разбор игрока ${p.name}`);
        } catch (e) {
          log(`  ✗ разбор игрока ${p.name}: ${String(e.stderr ?? e.message).split("\n").find(Boolean)}`);
        }
      }
    } catch (e) {
      log(`✗ ${f}: ${String(e.stderr ?? e.message).split("\n").find(Boolean)}`);
    }
  }
}

pass();
if (!process.argv.includes("--once")) {
  log(`слежу за ${DEMOS}, проход раз в ${EVERY_MS / 60000} мин`);
  setInterval(pass, EVERY_MS);
}
