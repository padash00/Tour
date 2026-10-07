// Самообновление агента: код, скрипты и конфиги с сайта (/api/agent/bundle).
//
// Порядок безопасный:
//   1. всё скачивается во временную папку bundle-staging/;
//   2. каждый .mjs проверяется `node --check`, относительные import'ы должны указывать на файлы бандла;
//      не прошёл — версия запоминается как отклонённая (bundle-rejected.txt) и не ставится, агент работает дальше;
//   3. папка agent/ меняется целиком (rename), прежняя версия и заменённые файлы остаются в prev/;
//   4. агент выходит с кодом UPDATE_EXIT_CODE, служба (service.mjs) запускает новый код.
// Если новый агент раз за разом падает в первую минуту после запуска, service.mjs возвращает prev/
// (см. rollbackBundle) и помечает версию отклонённой.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const UPDATE_EXIT_CODE = 75;
const STAGE = "bundle-staging";
const PREV = "prev";
const REJECTED = "bundle-rejected.txt";

export const versionFile = (f16Dir) => path.join(f16Dir, "bundle-version.txt");

export function localBundleVersion(f16Dir) {
  const f = versionFile(f16Dir);
  return existsSync(f) ? readFileSync(f, "utf8").trim() : "none";
}

/** Версия, которую агент не ставит: не прошла проверку или была откачена службой */
export function rejectedBundleVersion(f16Dir) {
  try {
    return JSON.parse(readFileSync(path.join(f16Dir, REJECTED), "utf8"));
  } catch {
    return null;
  }
}

export function rejectBundleVersion(f16Dir, version, reason) {
  writeFileSync(path.join(f16Dir, REJECTED), JSON.stringify({ version, reason: String(reason).slice(0, 500), at: new Date().toISOString() }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Путь из бандла → безопасные части пути (без .., без абсолютных путей) */
export function bundlePathParts(p) {
  const parts = String(p).split("/");
  if (!parts.length || parts.some((x) => !x || x === "." || x === ".." || /[:\\]/.test(x))) throw new Error(`недопустимый путь в бандле: ${p}`);
  return parts;
}

/** node --check: синтаксис модуля без его запуска */
export function nodeCheck(file) {
  return new Promise((resolve) => {
    execFile(process.execPath, ["--check", file], { windowsHide: true, timeout: 30_000 }, (err, _out, stderr) =>
      resolve(err ? { ok: false, error: String(stderr || err.message).trim().split(/\r?\n/).slice(0, 6).join(" ") } : { ok: true }),
    );
  });
}

/** Относительные import'ы модуля, которых нет среди файлов бандла */
export function missingImports(source, fromPath, have) {
  const dir = path.posix.dirname(fromPath);
  const missing = [];
  for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(dir, m[1]));
    if (!have.has(target)) missing.push(m[1]);
  }
  return missing;
}

/** Проверка бандла в staging: синтаксис каждого .mjs и наличие модулей, которые он импортирует */
export async function verifyStaged(stage, files, check = nodeCheck) {
  const have = new Set(files.map((f) => f.path));
  const problems = [];
  for (const f of files.filter((x) => x.path.endsWith(".mjs"))) {
    const r = await check(path.join(stage, ...bundlePathParts(f.path)));
    if (!r.ok) problems.push(`${f.path}: ${r.error}`);
    const missing = missingImports(f.content, f.path, have);
    if (missing.length) problems.push(`${f.path}: нет модулей ${missing.join(", ")}`);
  }
  return problems;
}

/** rename с повторами: антивирус может ненадолго держать файл */
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (i >= 5) throw e;
      await sleep(500);
    }
  }
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (statSync(a).isDirectory()) copyTree(a, b);
    else copyFileSync(a, b);
  }
}

/** Папка целиком: rename (атомарно), не вышло — копированием */
async function moveDir(from, to) {
  try {
    await renameRetry(from, to);
  } catch {
    copyTree(from, to);
    rmSync(from, { recursive: true, force: true });
  }
}

/** Скачивает бандл, проверяет и ставит. Возвращает { version, count } или { rejected } */
export async function applyBundle({ siteUrl, token, f16Dir, serverDir, check = nodeCheck, fetchImpl = fetch }) {
  const res = await fetchImpl(`${siteUrl}/api/agent/bundle`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`bundle → HTTP ${res.status}`);
  const { version, files } = await res.json();
  if (!version || !Array.isArray(files) || !files.some((f) => f.path === "agent/agent.mjs")) throw new Error("bundle: нет agent/agent.mjs");
  return installBundle({ f16Dir, serverDir, version, files, check });
}

export async function installBundle({ f16Dir, serverDir, version, files, check = nodeCheck }) {
  // 1. staging
  const stage = path.join(f16Dir, STAGE);
  rmSync(stage, { recursive: true, force: true });
  for (const f of files) {
    const target = path.join(stage, ...bundlePathParts(f.path));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, f.content, "utf8");
  }

  // 2. проверка
  const problems = await verifyStaged(stage, files, check);
  if (problems.length) {
    rmSync(stage, { recursive: true, force: true });
    rejectBundleVersion(f16Dir, version, problems.join(" · "));
    return { rejected: problems };
  }

  // 3. замена: прежняя версия → prev/
  const prev = path.join(f16Dir, PREV);
  rmSync(prev, { recursive: true, force: true });
  mkdirSync(prev, { recursive: true });
  const oldVersion = localBundleVersion(f16Dir);
  const replaced = [];
  const agentDir = path.join(f16Dir, "agent");
  if (existsSync(agentDir)) await moveDir(agentDir, path.join(prev, "agent"));
  await moveDir(path.join(stage, "agent"), agentDir);

  const csgoCfg = path.join(serverDir, "game", "csgo", "cfg");
  for (const f of files.filter((x) => !x.path.startsWith("agent/"))) {
    const parts = bundlePathParts(f.path);
    const targets = [{ file: path.join(f16Dir, ...parts), backup: path.join(prev, "f16", ...parts) }];
    if (f.path.startsWith("cfg/")) targets.push({ file: path.join(csgoCfg, ...parts.slice(1)), backup: path.join(prev, "csgo-cfg", ...parts.slice(1)) });
    for (const { file, backup } of targets) {
      if (existsSync(file)) {
        mkdirSync(path.dirname(backup), { recursive: true });
        copyFileSync(file, backup);
        replaced.push(path.relative(prev, backup).split(path.sep).join("/"));
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, f.content, "utf8");
    }
  }
  writeFileSync(path.join(prev, "manifest.json"), JSON.stringify({ from: oldVersion, to: version, replaced, applied_at: new Date().toISOString() }, null, 1));
  writeFileSync(versionFile(f16Dir), version);
  rmSync(stage, { recursive: true, force: true });
  return { version, count: files.length };
}

/**
 * Откат на prev/: новая версия падает при запуске. Вызывает service.mjs (он не зависит от остального кода агента,
 * но импортирует этот модуль — поэтому здесь только node:*-зависимости).
 */
export async function rollbackBundle({ f16Dir, serverDir, reason }) {
  const prev = path.join(f16Dir, PREV);
  const manifestFile = path.join(prev, "manifest.json");
  if (!existsSync(manifestFile) || !existsSync(path.join(prev, "agent", "agent.mjs"))) return null;
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (localBundleVersion(f16Dir) !== manifest.to) return null; // уже стоит другая версия — откатывать нечего
  const bad = path.join(f16Dir, "rejected-agent");
  rmSync(bad, { recursive: true, force: true });
  await moveDir(path.join(f16Dir, "agent"), bad);
  await moveDir(path.join(prev, "agent"), path.join(f16Dir, "agent"));
  const csgoCfg = path.join(serverDir, "game", "csgo", "cfg");
  for (const rel of manifest.replaced ?? []) {
    const [root, ...parts] = rel.split("/");
    const target = root === "f16" ? path.join(f16Dir, ...parts) : root === "csgo-cfg" ? path.join(csgoCfg, ...parts) : null;
    if (target) copyFileSync(path.join(prev, ...rel.split("/")), target);
  }
  writeFileSync(versionFile(f16Dir), manifest.from ?? "none");
  rejectBundleVersion(f16Dir, manifest.to, reason ?? "откат: новый агент падал при запуске");
  rmSync(prev, { recursive: true, force: true });
  return { from: manifest.to, to: manifest.from };
}
