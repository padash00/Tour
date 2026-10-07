// Окно по центру экрана (плагин F16Hud): табло разминки — карта, счёт серии, кого ждём.
// Плагин лежит на сайте (/agent/F16Hud.dll). Раз в 10 минут сверяем его с установленным и при отличии
// кладём новый и загружаем на запущенных серверах — без ручного копирования.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const mapTitle = (m) => String(m ?? "").split("@")[0].replace(/^(de|cs|aim|awp)_/, "").replace(/^./, (c) => c.toUpperCase());
export const hudClean = (t) => String(t ?? "").replace(/[";|\u0000-\u001f\u007f]/g, "").slice(0, 60);

/** Конфиг матча, который агент закэшировал при загрузке (match-configs/<match_id>.json) */
export function readMatchConfig(stateDir, matchId) {
  try {
    return JSON.parse(readFileSync(path.join(stateDir, "match-configs", `${String(matchId).replace(/[^\w-]/g, "")}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** ctx: { serverDir, stateDir, siteUrl, instances, rc(inst, command), log } */
export function createHud({ serverDir, stateDir, siteUrl, instances, rc, log }) {
  const hudDir = path.join(serverDir, "game", "csgo", "addons", "counterstrikesharp", "plugins", "F16Hud");
  let checkedAt = 0;
  const shown = {}; // { [instance]: true } — окно сейчас показано

  /** Обновление плагина: только когда матчей нет — замена DLL на сервере с матчем может уронить CS2 */
  async function ensurePlugin(hasAssignments) {
    if (Date.now() - checkedAt < 10 * 60_000) return;
    if (hasAssignments) return;
    checkedAt = Date.now();
    const res = await fetch(`${siteUrl}/agent/F16Hud.dll`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const target = path.join(hudDir, "F16Hud.dll");
    const sha = (b) => createHash("sha256").update(b).digest("hex");
    if (existsSync(target) && sha(readFileSync(target)) === sha(buf)) return;
    mkdirSync(hudDir, { recursive: true });
    writeFileSync(target, buf);
    log(`F16Hud: установлен плагин (${buf.length} байт)`);
    // уже загруженный плагин CounterStrikeSharp перезагрузит сам (hot reload); повторный load его роняет
    for (const inst of instances) {
      const list = await rc(inst, "css_plugins list").catch(() => null);
      if (list != null && !/F16 HUD/.test(list)) await rc(inst, "css_plugins load F16Hud").catch(() => {});
    }
  }

  async function clear(inst) {
    if (!shown[inst.name]) return;
    delete shown[inst.name];
    await rc(inst, "f16_hud_clear").catch(() => {});
  }

  /** Разминка матча: карта, счёт серии, кого ждём — по центру экрана, обновляется на каждом тике */
  async function warmup(inst, a, get5, extra) {
    const active = a && get5 && get5.matchid === a.matchid && get5.gamestate === "warmup";
    if (!active) return clear(inst);
    const cfg = readMatchConfig(stateDir, a.match_id);
    const mapNo = get5.map_number ?? 0;
    const total = cfg?.num_maps ?? 1;
    const map = cfg?.maplist?.[mapNo] ? mapTitle(cfg.maplist[mapNo]) : "";
    const t1 = hudClean(get5.team1?.name ?? cfg?.team1?.name ?? "Команда 1");
    const t2 = hudClean(get5.team2?.name ?? cfg?.team2?.name ?? "Команда 2");
    const s1 = get5.team1?.series_score ?? 0;
    const s2 = get5.team2?.series_score ?? 0;
    const lines = [
      // окно в CS2 узкое — короткие строки, иначе переносятся
      `F16 · КАРТА ${mapNo + 1}${total > 1 ? `/${total}` : ""}${map ? ` · ${hudClean(map).toUpperCase()}` : ""}`,
      total > 1 ? `${t1} ${s1} : ${s2} ${t2}` : `${t1} vs ${t2}`,
      extra,
    ].filter(Boolean);
    shown[inst.name] = true;
    // состав матча для табло: плагин сам считает, кто не готов и кто не зашёл
    const team = (t) => `${hudClean(t?.name ?? "").replace(/[#,=]/g, "")}#${Object.entries(t?.players ?? {}).map(([id, n]) => `${id}=${hudClean(n).replace(/[#,=]/g, "")}`).join(",")}`;
    if (cfg?.team1 && cfg?.team2) await rc(inst, `f16_roster ${a.matchid}-${mapNo}#${team(cfg.team1)}#${team(cfg.team2)}`).catch(() => {});
    // «не готовы» нужно только на первой карте — дальше старт автоматический
    await rc(inst, `f16_hud_ready ${mapNo < 1 ? 1 : 0}`).catch(() => {});
    await rc(inst, `f16_hud 8 ${lines.join("|")}`).catch(() => {});
  }

  return { ensurePlugin, warmup, clear, forget: (name) => delete shown[name] };
}
