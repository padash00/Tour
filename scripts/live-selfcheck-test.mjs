// Живая проверка «Проверки перед турниром» на серверном ПК (без сайта):
// запускает selfCheck из агента на активных инстансах, печатает отчёт и проверяет,
// что выключенные до проверки серверы снова выключены.
// Запуск на серверном ПК: node scripts/live-selfcheck-test.mjs [CS2-01,CS2-02,...]
import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cs2Patch, rebootPending, selfCheck } from "../server/agent/checks.mjs";
import { a2sInfo, rcon } from "../server/agent/lib.mjs";
import { cs2Build, readVersions } from "../server/agent/maintenance.mjs";

const SERVER_DIR = process.env.F16_SERVER_DIR ?? "D:\\cs2server";
const F16_DIR = path.join(SERVER_DIR, "f16");
const secrets = JSON.parse(readFileSync(path.join(SERVER_DIR, "f16-secrets.json"), "utf8").replace(/^\uFEFF/, ""));
const INSTANCES = readFileSync(path.join(F16_DIR, "instances.csv"), "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => {
    const [name, port, role] = l.split(",");
    return { name, port: Number(port), role };
  });
const only = process.argv[2]?.split(",");

const procs = () =>
  new Promise((resolve) =>
    execFile(
      "powershell",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='cs2.exe'\" | Select-Object CommandLine | ConvertTo-Json -Compress"],
      { windowsHide: true },
      (err, out) => {
        if (err || !out.trim()) return resolve([]);
        const v = JSON.parse(out);
        resolve(Array.isArray(v) ? v : [v]);
      },
    ),
  );
const running = async () => {
  const p = await procs();
  return new Set(INSTANCES.filter((i) => p.some((x) => new RegExp(`-port ${i.port}(\\s|$)`).test(x.CommandLine ?? ""))).map((i) => i.name));
};
const runStart = (name, stop) =>
  new Promise((resolve) => {
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(F16_DIR, "start.ps1"), "-Name", name];
    if (stop) args.push("-Stop");
    spawn("powershell", args, { windowsHide: true, stdio: "ignore" }).on("exit", (code) => resolve({ ok: code === 0 }));
  });

const before = await running();
console.log("до проверки запущены:", [...before].join(", ") || "ничего");
console.log("CS2 patch:", cs2Patch(SERVER_DIR), "· перезагрузка Windows:", await rebootPending());

const t0 = Date.now();
const report = JSON.parse(
  await selfCheck(
    {
      instances: INSTANCES,
      serverDir: SERVER_DIR,
      rcon,
      a2sInfo,
      rconPassword: secrets.rcon,
      listRunning: running,
      runStart,
      hostSnapshot: async () => ({ disk_free_gb: null, cs2_build: cs2Build(SERVER_DIR), versions: readVersions(F16_DIR) }),
      relayStats: () => null,
      siteRtt: () => null,
    },
    { instances: only ?? INSTANCES.filter((i) => i.role === "active").map((i) => i.name), workshop_ids: ["3070549948", "999999999"] },
  ),
);
console.log(`\nпроверка заняла ${Math.round((Date.now() - t0) / 1000)} с`);
for (const i of report.instances) {
  console.log(
    `  ${i.rcon && i.map_ok && i.matchzy ? "✓" : "✕"} ${i.name}: rcon=${i.rcon} map=${i.map} matchzy=${i.matchzy} css=${i.css} metamod=${i.metamod} ${i.seconds}с${i.skipped ? ` (${i.skipped})` : ""}${i.error ? ` ошибка: ${i.error}` : ""}`,
  );
}
console.log("  workshop:", report.host.workshop.map((w) => `${w.id}=${w.cached ? "в кэше" : "нет"}`).join(", "));
console.log("  host:", JSON.stringify({ patch: report.host.cs2_patch, build: report.host.cs2_build, reboot: report.host.reboot_pending, versions: report.host.versions }));

await new Promise((r) => setTimeout(r, 4000));
const after = await running();
const restored = [...after].every((n) => before.has(n)) && [...before].every((n) => after.has(n));
console.log(`\n${restored ? "✓" : "✕"} серверы возвращены в прежнее состояние (сейчас запущены: ${[...after].join(", ") || "ничего"})`);
process.exit(restored && report.instances.every((i) => i.rcon && i.map_ok && i.matchzy) ? 0 : 1);
