// Скины F16 (WeaponPaints + MenuManager + PlayerSettings + AnyBaseLib) — тумблер в Настройках пульта.
// Эталон плагинов с брендингом F16 и паролем к локальной MariaDB лежит в D:\cs2server\f16\skins (собран при установке).
// Агент держит нужное состояние: при включении кладёт плагины в CS2 и снимает FollowCS2ServerGuidelines,
// при выключении убирает плагины и возвращает защиту. Обновление плагинов/CS2 перезаписывает core.json —
// расхождение заметится здесь и будет исправлено. Применяется только когда на серверах нет матчей:
// замена плагинов требует перезапуска CS2.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Что ставится из эталона и убирается при выключении (общие библиотеки в shared/ безвредны и остаются) */
const PLUGIN_DIRS = ["plugins/WeaponPaints", "plugins/MenuManagerCore", "plugins/PlayerSettings", "plugins/PMM_WeaponPaints"];
/** Вид скина с сайта → флаг в WeaponPaints.json (Additional) */
const PART_FLAGS = { skin: "SkinEnabled", knife: "KnifeEnabled", glove: "GloveEnabled", agent: "AgentEnabled", music: "MusicEnabled", pins: "PinsEnabled" };
const CONFIG_REL = path.join("counterstrikesharp", "configs", "plugins", "WeaponPaints", "WeaponPaints.json");

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

  const readCfg = (file) => {
    try {
      return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      return null;
    }
  };
  /** Флаги видов в конфиге не совпадают с сайтом — переписать (эталон и рабочую копию). true — что-то изменилось */
  function syncParts(parts) {
    if (!parts) return false;
    let changed = false;
    for (const file of [path.join(stage, CONFIG_REL), path.join(serverDir, "game", "csgo", "addons", CONFIG_REL)]) {
      const cfg = readCfg(file);
      if (!cfg?.Additional) continue;
      let diff = false;
      for (const [part, flag] of Object.entries(PART_FLAGS)) {
        if (typeof parts[part] === "boolean" && cfg.Additional[flag] !== parts[part]) {
          cfg.Additional[flag] = parts[part];
          diff = true;
        }
      }
      if (diff) {
        writeFileSync(file, JSON.stringify(cfg, null, 2));
        changed = true;
      }
    }
    return changed;
  }
  const partsDiffer = (parts) => {
    const cfg = parts && readCfg(path.join(serverDir, "game", "csgo", "addons", CONFIG_REL));
    return !!cfg?.Additional && Object.entries(PART_FLAGS).some(([part, flag]) => typeof parts[part] === "boolean" && cfg.Additional[flag] !== parts[part]);
  };

  // ── режим меню: «text» — обычное меню MenuManager (чат/центр экрана), «panorama» — окна F16 с мышью
  // (MenuManager 1.3 с панорамой + PMM_WeaponPaints + MultiAddonManager раздаёт игрокам аддон с вёрсткой окон)
  const csgo = path.join(serverDir, "game", "csgo");
  const panoStage = path.join(f16Dir, "skins-panorama");
  const mamVdf = path.join(csgo, "addons", "metamod", "multiaddonmanager.vdf");
  const mamCfg = path.join(csgo, "cfg", "multiaddonmanager", "multiaddonmanager.cfg");
  const currentMode = () => (existsSync(path.join(css, "plugins", "PMM_WeaponPaints", "PMM_WeaponPaints.dll")) && existsSync(mamVdf) ? "panorama" : "text");
  const currentAddon = () => {
    try {
      return readFileSync(mamCfg, "utf8").match(/^\s*mm_client_extra_addons\s+"([^"]*)"/m)?.[1] ?? "";
    } catch {
      return "";
    }
  };
  function setAddon(id) {
    const text = readFileSync(mamCfg, "utf8");
    writeFileSync(mamCfg, text.replace(/^(\s*mm_client_extra_addons\s+)"[^"]*"/m, `$1"${id}"`));
  }
  function toPanorama(addonId) {
    // обычный MenuManager убираем целиком: смесь файлов двух версий в одной папке ломает загрузку
    for (const d of ["plugins/MenuManagerCore", "shared/MenuManagerApi", "plugins/PlayerSettings", "shared/PlayerSettingsApi"]) rmSync(path.join(css, d), { recursive: true, force: true });
    cpSync(panoStage, csgo, { recursive: true, force: true });
    // одна копия API меню — общая в shared/: своя копия в WeaponPaints ломает окна
    rmSync(path.join(css, "plugins", "WeaponPaints", "MenuManagerApi.dll"), { force: true });
    setAddon(addonId);
  }
  function toText() {
    for (const d of ["plugins/PMM_WeaponPaints", "plugins/MenuManagerCore", "shared/MenuManagerApi", "plugins/PlayerSettings", "shared/PlayerSettingsApi"]) rmSync(path.join(css, d), { recursive: true, force: true });
    rmSync(mamVdf, { force: true });
    // конфиг оконного меню («DefaultMenu: PanoramaMenu») роняет обычный MenuManager — он создаст свой заново
    rmSync(path.join(css, "configs", "plugins", "MenuManagerCore"), { recursive: true, force: true });
    rmSync(path.join(css, "shared", "CS2MenuManager"), { recursive: true, force: true });
    // обычный MenuManager и его API — из эталона скинов
    cpSync(stage, path.join(csgo, "addons"), { recursive: true, force: true });
  }

  /**
   * enabled — желаемое состояние с сайта; null — сайт ещё не ответил, ничего не трогаем. parts — разрешённые виды.
   * menu — «text» | «panorama»; addonId — номер аддона окон в Workshop (без него окна не включаются).
   */
  async function ensure(enabled, parts = null, menu = "text", addonId = "") {
    if (enabled == null) return;
    const now = installed() && guidelinesOff();
    // скины выключены — меняем только эталон, перезапуск не нужен
    if (!enabled && !now) {
      syncParts(parts);
      waitingLogged = false;
      return;
    }
    const wantMode = enabled && menu === "panorama" && /^\d+$/.test(addonId ?? "") && existsSync(panoStage) ? "panorama" : "text";
    const needParts = enabled && now && partsDiffer(parts);
    const needMode = enabled && now && (wantMode !== currentMode() || (wantMode === "panorama" && currentAddon() !== addonId));
    if (enabled === now && !needParts && !needMode) {
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
      syncParts(parts);
      cpSync(stage, path.join(serverDir, "game", "csgo", "addons"), { recursive: true, force: true });
      if (wantMode === "panorama") toPanorama(addonId);
      else if (currentMode() === "panorama") toText();
      setGuidelines(false);
    } else {
      if (currentMode() === "panorama") toText();
      for (const d of PLUGIN_DIRS) rmSync(path.join(css, d), { recursive: true, force: true });
      setGuidelines(true);
    }
    for (const i of running) await restart(i, "start");
    waitingLogged = false;
    const on = parts ? Object.entries(PART_FLAGS).filter(([p]) => parts[p] !== false).map(([p]) => p).join(", ") : "всё";
    const mode = wantMode === "panorama" ? `окна F16, аддон ${addonId}` : "обычное меню";
    log(`скины: ${enabled ? `включены (${on}; ${mode})` : "выключены"} (перезапущено серверов: ${running.length})`);
  }

  return { ensure, installed: () => installed() && guidelinesOff() };
}
