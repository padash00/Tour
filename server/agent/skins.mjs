// Скины F16 (WeaponPaints + MenuManager + PlayerSettings + AnyBaseLib) — тумблер в Настройках пульта.
// Эталон плагинов с брендингом F16 и паролем к локальной MariaDB лежит в D:\cs2server\f16\skins (собран при установке).
// Агент держит нужное состояние: при включении кладёт плагины в CS2 и снимает FollowCS2ServerGuidelines,
// при выключении убирает плагины и возвращает защиту. Обновление плагинов/CS2 перезаписывает core.json —
// расхождение заметится здесь и будет исправлено. Применяется только когда на серверах нет матчей:
// замена плагинов требует перезапуска CS2.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Что ставится из эталона и убирается при выключении (общие библиотеки в shared/ безвредны и остаются) */
const PLUGIN_DIRS = ["plugins/WeaponPaints", "plugins/MenuManagerCore", "plugins/PlayerSettings"];

/** ctx: { f16Dir, serverDir, instances, isRunning(inst), restart(inst), hasMatches(), log } */
export function createSkins({ f16Dir, serverDir, instances, isRunning, restart, hasMatches, log }) {
  const stage = path.join(f16Dir, "skins", "addons");
  const css = path.join(serverDir, "game", "csgo", "addons", "counterstrikesharp");
  const core = path.join(css, "configs", "core.json");
  let waitingLogged = false;

  const installed = () => existsSync(path.join(css, "plugins", "WeaponPaints", "WeaponPaints.dll"));
  const guidelinesOff = () => {
    try {
      return /"FollowCS2ServerGuidelines"\s*:\s*false/.test(readFileSync(core, "utf8"));
    } catch {
      return false;
    }
  };
  const setGuidelines = (follow) => {
    const text = readFileSync(core, "utf8");
    writeFileSync(core, text.replace(/"FollowCS2ServerGuidelines"\s*:\s*(true|false)/, `"FollowCS2ServerGuidelines": ${follow}`));
  };

  /** enabled — желаемое состояние с сайта; null — сайт ещё не ответил, ничего не трогаем */
  async function ensure(enabled) {
    if (enabled == null) return;
    const now = installed() && guidelinesOff();
    if (enabled === now) {
      waitingLogged = false;
      return;
    }
    if (enabled && !existsSync(path.join(stage, "counterstrikesharp", "plugins", "WeaponPaints"))) {
      if (!waitingLogged) log("скины: нет эталона D:\\cs2server\\f16\\skins — включить нельзя");
      waitingLogged = true;
      return;
    }
    if (hasMatches()) {
      if (!waitingLogged) log(`скины: ${enabled ? "включу" : "выключу"}, когда на серверах не будет матчей`);
      waitingLogged = true;
      return;
    }
    const running = instances.filter((i) => isRunning(i));
    for (const i of running) await restart(i, "stop");
    if (enabled) {
      cpSync(stage, path.join(serverDir, "game", "csgo", "addons"), { recursive: true, force: true });
      setGuidelines(false);
    } else {
      for (const d of PLUGIN_DIRS) rmSync(path.join(css, d), { recursive: true, force: true });
      setGuidelines(true);
    }
    for (const i of running) await restart(i, "start");
    waitingLogged = false;
    log(`скины: ${enabled ? "включены" : "выключены"} (перезапущено серверов: ${running.length})`);
  }

  return { ensure, installed: () => installed() && guidelinesOff() };
}
