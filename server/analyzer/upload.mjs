// Разобрать демки и загрузить разборы на сайт (страница «Разбор»).
//   node upload.mjs <файл.dem | архив.rar/.zip | папка> [--kind pro|match] [--match <uuid> --map-number N] [--dry]
// Архивы HLTV распаковываются во временную папку. Токен и адрес сайта — из агента (D:/cs2server/f16/agent.json).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createExtractorFromFile } from "node-unrar-js";
import { analyze } from "./analyze.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const WITH_VALUE = ["--kind", "--match", "--map-number"];
const inputs = args.filter((a, i) => !a.startsWith("--") && !WITH_VALUE.includes(args[i - 1]));
const kind = flag("--kind") === "match" ? "match" : "pro";
const dry = args.includes("--dry");
const cfgPath = process.env.F16_AGENT_JSON ?? "D:/cs2server/f16/agent.json";
const cfg = JSON.parse(readFileSync(cfgPath, "utf8").replace(/^\uFEFF/, ""));

/** Все .dem из файла, архива или папки (архивы — во временную папку) */
async function demosOf(p, tmp) {
  const st = statSync(p);
  if (st.isDirectory()) return (await Promise.all(readdirSync(p).map((f) => demosOf(path.join(p, f), tmp)))).flat();
  const ext = path.extname(p).toLowerCase();
  if (ext === ".dem") return [{ file: p, source: path.basename(p) }];
  if (ext === ".rar") {
    // архивы HLTV по 0.5–1 ГБ: распаковываем прямо на диск, не в память
    const dir = mkdtempSync(path.join(tmp, "rar-"));
    const ex = await createExtractorFromFile({ filepath: p, targetPath: dir });
    const names = [...ex.extract({ files: (h) => h.name.toLowerCase().endsWith(".dem") }).files].map((f) => f.fileHeader.name);
    return names.sort().map((n) => ({ file: path.join(dir, n), source: `${path.basename(p)}/${path.basename(n)}` }));
  }
  if (ext === ".zip") {
    const dir = mkdtempSync(path.join(tmp, "zip-"));
    execFileSync("tar", ["-xf", p, "-C", dir]); // tar в Windows 10+ распаковывает zip
    return readdirSync(dir, { recursive: true })
      .filter((f) => String(f).toLowerCase().endsWith(".dem"))
      .map((f) => ({ file: path.join(dir, String(f)), source: `${path.basename(p)}/${path.basename(String(f))}` }));
  }
  if (ext === ".gz") {
    const dst = path.join(tmp, path.basename(p, ".gz"));
    writeFileSync(dst, zlib.gunzipSync(readFileSync(p)));
    return [{ file: dst, source: path.basename(p) }];
  }
  return [];
}

async function upload(res, source) {
  const gz = zlib.gzipSync(JSON.stringify(res), { level: 9 });
  const meta = {
    kind,
    match_id: flag("--match"),
    map_number: flag("--map-number") ? Number(flag("--map-number")) : null,
    map: res.map,
    title: `${res.teams.A} vs ${res.teams.B} · ${res.map.replace(/^de_/, "")}`,
    team_a: res.teams.A,
    team_b: res.teams.B,
    score_a: res.score.A,
    score_b: res.score.B,
    rounds: res.rounds.length,
    players: res.players,
    source,
    size_bytes: gz.length,
  };
  if (dry) return { id: "(dry)", gz: gz.length };
  const site = (cfg.siteUrl ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
  const r = await fetch(`${site}/api/agent/analysis`, { method: "POST", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" }, body: JSON.stringify(meta) });
  if (!r.ok) throw new Error(`сайт: HTTP ${r.status} ${await r.text()}`);
  const { id } = await r.json();
  if (gz.length > 4_000_000) throw new Error(`разбор ${(gz.length / 1e6).toFixed(1)} МБ — больше предела 4 МБ`);
  const put = await fetch(`${site}/api/agent/analysis?id=${id}`, { method: "PUT", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/gzip" }, body: gz });
  if (!put.ok) throw new Error(`хранилище: HTTP ${put.status} ${await put.text()}`);
  return { id, gz: gz.length };
}

if (!inputs.length) {
  console.error("node upload.mjs <файл.dem | архив | папка> [--kind pro|match] [--match <uuid> --map-number N] [--dry]");
  process.exit(1);
}
const tmp = mkdtempSync(path.join(tmpdir(), "f16-analyze-"));
let ok = 0, fail = 0;
try {
  for (const input of inputs) {
    if (!existsSync(input)) { console.error(`нет файла: ${input}`); fail++; continue; }
    for (const d of await demosOf(input, tmp)) {
      const t0 = Date.now();
      try {
        const res = analyze(d.file);
        const up = await upload(res, d.source);
        console.log(`✓ ${d.source}: ${res.teams.A} ${res.score.A}:${res.score.B} ${res.teams.B}, ${res.map}, раундов ${res.rounds.length}, ${(up.gz / 1e6).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(0)} с → ${up.id}`);
        ok++;
      } catch (e) {
        console.error(`✗ ${d.source}: ${e.message}`);
        fail++;
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`готово: ${ok} разобрано, ${fail} с ошибкой`);
