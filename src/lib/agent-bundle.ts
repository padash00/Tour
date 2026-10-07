import "server-only";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Всё, что живёт на серверном ПК, лежит в репозитории в server/ и раздаётся агенту отсюда.
 * Агент сравнивает версию и сам обновляет себя, скрипты и конфиги CS2 — без ручного копирования.
 *
 * Пути в бандле — относительно server/:
 *   agent/*.mjs, start.ps1, service.ps1, launch-agent.ps1, watchdog.ps1, firewall.ps1, hide-tasks.ps1, install.ps1, instances.csv → D:\cs2server\f16\
 *   cfg/**                                            → D:\cs2server\f16\cfg\ и game\csgo\cfg\
 */
const ROOT = path.join(process.cwd(), "server");
const INCLUDE = [/^agent\/[\w-]+\.mjs$/, /^start\.ps1$/, /^install\.ps1$/, /^service\.ps1$/, /^launch-agent\.ps1$/, /^watchdog\.ps1$/, /^firewall\.ps1$/, /^hide-tasks\.ps1$/, /^instances\.csv$/, /^cfg\/.+\.(cfg|json)$/];

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const rel = base ? `${base}/${name}` : name;
    return statSync(path.join(dir, name)).isDirectory() ? walk(path.join(dir, name), rel) : [rel];
  });
}

let cached: { version: string; files: { path: string; content: string }[] } | null = null;

export function getAgentBundle() {
  if (cached) return cached;
  const files = walk(ROOT)
    .filter((p) => INCLUDE.some((re) => re.test(p)))
    .sort()
    .map((p) => ({ path: p, content: readFileSync(path.join(ROOT, p), "utf8") }));
  const hash = createHash("sha256");
  for (const f of files) hash.update(f.path).update("\0").update(f.content).update("\0");
  cached = { version: hash.digest("hex").slice(0, 12), files };
  return cached;
}
