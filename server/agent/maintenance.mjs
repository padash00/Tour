// Обслуживание серверного ПК по командам с сайта: самообновление агента, обновление CS2 и плагинов.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const run = (file, args, { timeoutMs = 30 * 60_000, cwd } = {}) =>
  new Promise((resolve) => {
    // stdio: ignore — дочерние cs2.exe не должны держать наши pipe'ы
    const p = spawn(file, args, { windowsHide: true, stdio: "ignore", cwd });
    const t = setTimeout(() => p.kill(), timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, error: e.message });
    });
    p.on("exit", (code) => {
      clearTimeout(t);
      resolve({ code });
    });
  });

const ps = (script, opts) => run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], opts);

// ───────────────────────── самообновление

export const versionFile = (f16Dir) => path.join(f16Dir, "bundle-version.txt");

export function localBundleVersion(f16Dir) {
  const f = versionFile(f16Dir);
  return existsSync(f) ? readFileSync(f, "utf8").trim() : "none";
}

/** Скачивает код агента, скрипты и конфиги с сайта и раскладывает их по местам */
export async function applyBundle({ siteUrl, token, f16Dir, serverDir }) {
  const res = await fetch(`${siteUrl}/api/agent/bundle`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`bundle → HTTP ${res.status}`);
  const { version, files } = await res.json();
  const csgoCfg = path.join(serverDir, "game", "csgo", "cfg");
  for (const f of files) {
    const targets = [path.join(f16Dir, ...f.path.split("/"))];
    if (f.path.startsWith("cfg/")) targets.push(path.join(csgoCfg, ...f.path.slice(4).split("/")));
    for (const target of targets) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, f.content, "utf8");
    }
  }
  writeFileSync(versionFile(f16Dir), version);
  return { version, count: files.length };
}

// ───────────────────────── версии

export const versionsFile = (f16Dir) => path.join(f16Dir, "versions.json");

export function readVersions(f16Dir) {
  try {
    return JSON.parse(readFileSync(versionsFile(f16Dir), "utf8"));
  } catch {
    return {};
  }
}

function writeVersions(f16Dir, patch) {
  writeFileSync(versionsFile(f16Dir), JSON.stringify({ ...readVersions(f16Dir), ...patch, updated_at: new Date().toISOString() }, null, 2));
}

export function cs2Build(serverDir) {
  const manifest = path.join(serverDir, "steamapps", "appmanifest_730.acf");
  return existsSync(manifest) ? (/"buildid"\s+"(\d+)"/.exec(readFileSync(manifest, "utf8"))?.[1] ?? null) : null;
}

// ───────────────────────── обновление CS2

/** Аккаунт, под которым SteamCMD уже входил (кешированный вход без пароля) */
function cachedSteamAccount(steamcmdDir) {
  const cfg = path.join(steamcmdDir, "config", "config.vdf");
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, "utf8");
  const block = /"Accounts"\s*\{\s*"([^"]+)"/.exec(text);
  return block?.[1] ?? null;
}

async function stopAll(startPs1, instances) {
  for (const i of instances) await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", startPs1, "-Name", i.name, "-Stop"], { timeoutMs: 60_000 });
}

async function startActive(startPs1) {
  await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", startPs1, "-Active"], { timeoutMs: 120_000 });
}

function stagingDir(f16Dir) {
  const own = path.join(f16Dir, "staging");
  if (existsSync(path.join(own, "css"))) return own;
  return "D:\\cs2-staging";
}

async function installPlugins(f16Dir, serverDir) {
  const r = await run(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(f16Dir, "install.ps1"), "-ServerDir", serverDir, "-Staging", stagingDir(f16Dir)],
    { timeoutMs: 10 * 60_000 },
  );
  if (r.code !== 0) throw new Error(`install.ps1 exit ${r.code ?? r.error}`);
}

export async function updateCs2({ f16Dir, serverDir, steamcmdDir, instances, startPs1 }) {
  const account = cachedSteamAccount(steamcmdDir);
  if (!account) throw new Error("SteamCMD ещё ни разу не входил под Steam-аккаунтом — войдите вручную один раз");
  const before = cs2Build(serverDir);
  await stopAll(startPs1, instances);
  const r = await run(path.join(steamcmdDir, "steamcmd.exe"), [
    "+force_install_dir", serverDir,
    "+login", account,
    "+app_update", "730", "validate",
    "+quit",
  ], { timeoutMs: 60 * 60_000 });
  const after = cs2Build(serverDir);
  // обновление CS2 перезаписывает gameinfo.gi — заново ставим Metamod и плагины
  await installPlugins(f16Dir, serverDir);
  await startActive(startPs1);
  writeVersions(f16Dir, { cs2_build: after });
  if (r.code !== 0 && before === after) {
    throw new Error(`SteamCMD exit ${r.code}. Возможно, истёк кешированный вход — войдите в SteamCMD вручную. Серверы перезапущены на сборке ${after}.`);
  }
  return `CS2 build ${before} → ${after}`;
}

// ───────────────────────── обновление плагинов

async function latestGithubAsset(repo, test) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { "User-Agent": "f16-agent", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
  const rel = await res.json();
  const asset = rel.assets.find((a) => test(a.name));
  if (!asset) throw new Error(`${repo}: нет подходящего архива в ${rel.tag_name}`);
  return { version: rel.tag_name, url: asset.browser_download_url };
}

async function latestMetamod() {
  const html = await (await fetch("https://mms.alliedmods.net/mmsdrop/2.0/")).text();
  const files = [...html.matchAll(/mmsource-2\.0\.0-git(\d+)-windows\.zip/g)].map((m) => Number(m[1]));
  if (!files.length) throw new Error("Metamod: не нашёл сборку для Windows");
  const build = Math.max(...files);
  return { version: `2.0.0-git${build}`, url: `https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-git${build}-windows.zip` };
}

async function downloadAndExtract(url, dir) {
  const zip = `${dir}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = await ps(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`, { timeoutMs: 10 * 60_000 });
  if (r.code !== 0 || readdirSync(dir).length === 0) throw new Error(`не распаковался ${zip}`);
  rmSync(zip, { force: true });
}

export async function updatePlugins({ f16Dir, serverDir, instances, startPs1 }) {
  const [mms, css, matchzy] = await Promise.all([
    latestMetamod(),
    latestGithubAsset("roflmuffin/CounterStrikeSharp", (n) => /^counterstrikesharp-with-runtime-windows-.*\.zip$/.test(n)),
    latestGithubAsset("shobhit-pathak/MatchZy", (n) => /^MatchZy-[\d.]+\.zip$/.test(n)),
  ]);
  const staging = path.join(f16Dir, "staging");
  mkdirSync(staging, { recursive: true });
  await downloadAndExtract(mms.url, path.join(staging, "mms"));
  await downloadAndExtract(css.url, path.join(staging, "css"));
  await downloadAndExtract(matchzy.url, path.join(staging, "matchzy"));
  await stopAll(startPs1, instances);
  await installPlugins(f16Dir, serverDir);
  await startActive(startPs1);
  writeVersions(f16Dir, { metamod: mms.version, counterstrikesharp: css.version, matchzy: matchzy.version });
  return `Metamod ${mms.version} · CounterStrikeSharp ${css.version} · MatchZy ${matchzy.version}`;
}

export async function restartAll({ instances, startPs1 }) {
  await stopAll(startPs1, instances);
  await startActive(startPs1);
  return "активные инстансы перезапущены";
}
