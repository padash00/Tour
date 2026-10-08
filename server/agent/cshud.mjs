// Интерфейс трансляции cs-hud на этом ПК: логотипы команд текущих матчей — с сайта.
// Названия команд cs-hud берёт сам из mp_teamname_1/2 (их ставит MatchZy по конфигу матча с сайта),
// а логотипы ищет в userspace/team-logos/<название>.png — их мы и раскладываем.
// Нет cs-hud на ПК (папки userspace) — ничего не делаем.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const WINDOWS_BAD = /[<>:"/\\|?*\u0000-\u001f]/;

export function createCsHud({ siteUrl, stateDir, instances, log, dir }) {
  const userspace = dir || path.join(os.homedir(), "cs-hud", "cs-hud", "userspace");
  const logosDir = path.join(userspace, "team-logos");
  const stateFile = path.join(stateDir, "cshud-logos.json");
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {}

  async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  async function saveLogo(team) {
    if (!team?.logo || !team.name || WINDOWS_BAD.test(team.name)) return;
    const file = path.join(logosDir, `${team.name}.png`);
    if (saved[team.name] === team.logo && existsSync(file)) return;
    const res = await fetch(`${siteUrl}/api/public/team-logo?src=${encodeURIComponent(team.logo)}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`логотип ${team.name}: HTTP ${res.status}`);
    mkdirSync(logosDir, { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    saved[team.name] = team.logo;
    writeFileSync(stateFile, JSON.stringify(saved));
    log(`cs-hud: логотип «${team.name}»`);
  }

  /** Раз в ~20 с: логотипы команд матчей на запущенных серверах */
  async function sync(running) {
    if (!existsSync(userspace)) return;
    for (const inst of instances) {
      if (!running.has(inst.name)) continue;
      const data = await getJson(`${siteUrl}/api/public/overlay?server=${encodeURIComponent(inst.name)}`).catch(() => null);
      const m = data?.match;
      if (!m) continue;
      for (const team of [m.team1, m.team2]) await saveLogo(team).catch((e) => log(`cs-hud: ${e.message}`));
    }
  }

  return { sync, get enabled() { return existsSync(userspace); } };
}
