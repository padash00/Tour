// Удержание настроек режима на инстансе весь матч (Workshop-карты любят сами менять mp_maxrounds и т.п.)
// и голос на смене сторон: включается на going_live нужной карты, выключается на map_result.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUTO_HALFTIME_VOICE = "sv_auto_full_alltalk_during_warmup_half_end";
export const DEFAULT_VOICE = `${AUTO_HALFTIME_VOICE} 0;sv_voiceenable 1;sv_alltalk 0;sv_deadtalk 1;sv_full_alltalk 0;sv_talk_enemy_living 0;sv_talk_enemy_dead 0`;
const ACTIVE = ["warmup", "knife", "waiting_for_knife_decision", "going_live", "live"];

/**
 * ctx: { stateDir, instances, rc(inst, command) → Promise<string>, log }
 * Правила: { [instance]: { matchid, cvars, halftimeVoiceMaps?, halftimeVoiceActiveMap?, eventToken } }
 */
export function createEnforce({ stateDir, instances, rc, log }) {
  const file = path.join(stateDir, "enforce.json");
  let rules = {};
  try {
    rules = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const save = () => writeFileSync(file, JSON.stringify(rules));

  function set(inst, rule, token) {
    if (rule) rules[inst.name] = { ...rule, eventToken: token };
    else delete rules[inst.name];
    save();
  }

  async function clear(inst) {
    const rule = rules[inst.name];
    if (!rule) return;
    delete rules[inst.name];
    save();
    if (rule.cvars && (Object.hasOwn(rule.cvars, "sv_alltalk") || Object.hasOwn(rule.cvars, AUTO_HALFTIME_VOICE))) {
      await rc(inst, DEFAULT_VOICE).catch(() => {});
    }
  }

  /** Событие MatchZy через буфер агента: голос на смене сторон включается только на картах из правила */
  async function onMatchzyEvent(ev, token) {
    if (!ev || !["going_live", "map_result", "series_end"].includes(ev.event)) return;
    for (const inst of instances) {
      const rule = rules[inst.name];
      if (!rule?.halftimeVoiceMaps?.length || Number(rule.matchid) !== Number(ev.matchid) || !rule.eventToken || token !== rule.eventToken) continue;
      const mapNumber = Number(ev.map_number);
      if (ev.event === "map_result" && rule.halftimeVoiceActiveMap !== mapNumber) continue;
      const enabled = ev.event === "going_live" && rule.halftimeVoiceMaps.includes(mapNumber);
      rule.halftimeVoiceActiveMap = enabled ? mapNumber : null;
      save();
      await rc(inst, `${AUTO_HALFTIME_VOICE} ${enabled ? 1 : 0}`);
      log(`голос на смене сторон ${inst.name}: ${enabled ? "включён" : "выключен"} (карта ${Number.isFinite(mapNumber) ? mapNumber + 1 : "—"})`);
    }
  }

  async function apply(inst, get5) {
    const rule = rules[inst.name];
    if (!rule) return;
    const active = get5 && get5.matchid === rule.matchid && ACTIVE.includes(get5.gamestate);
    if (!active) {
      // снимаем правило только по явному ответу «матча нет / другой матч». Пустой ответ (get5 = null) бывает,
      // пока сервер меняет карту между картами серии — правило нужно сохранить для следующей карты.
      if (get5 && (get5.gamestate === "none" || get5.matchid !== rule.matchid)) await clear(inst);
      return;
    }
    const names = Object.keys(rule.cvars);
    const out = await rc(inst, names.join(";")).catch(() => null);
    if (out == null) return; // RCON не ответил — не гадаем, исправим на следующем тике
    const expected = (name) => name === AUTO_HALFTIME_VOICE && rule.halftimeVoiceMaps?.length
      ? rule.halftimeVoiceActiveMap === get5.map_number && ["going_live", "live"].includes(get5.gamestate) ? 1 : 0
      : rule.cvars[name];
    const fix = names.filter((n) => {
      const m = new RegExp(`${n} = (true|false|[-+]?\\d+(?:\\.\\d+)?)`, "i").exec(out);
      if (!m) return false;
      const value = m[1].toLowerCase();
      const current = value === "true" ? 1 : value === "false" ? 0 : Number(value);
      return current !== Number(expected(n));
    });
    if (fix.length) {
      await rc(inst, fix.map((n) => `${n} ${expected(n)}`).join(";")).catch(() => {});
      log(`enforce ${inst.name}: ${fix.map((n) => `${n}=${expected(n)}`).join(" ")}`);
    }
  }

  return { set, clear, apply, onMatchzyEvent, has: (name) => !!rules[name] };
}
