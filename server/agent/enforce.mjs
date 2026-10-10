// Удержание настроек режима на инстансе весь матч (Workshop-карты любят сами менять mp_maxrounds и т.п.)
// и голос на смене сторон: включается на going_live нужной карты, выключается на map_result.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUTO_HALFTIME_VOICE = "sv_auto_full_alltalk_during_warmup_half_end";
export const DEFAULT_VOICE = `${AUTO_HALFTIME_VOICE} 0;sv_voiceenable 1;sv_alltalk 0;sv_deadtalk 1;sv_full_alltalk 0;sv_talk_enemy_living 0;sv_talk_enemy_dead 0`;
const ACTIVE = ["warmup", "knife", "waiting_for_knife_decision", "going_live", "live"];
/** Во время игры настройки сверяем реже: каждый RCON-запрос выполняется в основном потоке сервера */
const LIVE_CHECK_MS = 60_000;
/** Сколько ждать после готовности всех людей, прежде чем стартовать игру с ботами самим */
const READY_START_MS = 10_000;

/**
 * ctx: { stateDir, instances, rc(inst, command) → Promise<string>, log }
 * Правила: { [instance]: { matchid, cvars, halftimeVoiceMaps?, halftimeVoiceActiveMap?, eventToken } }
 */
export function createEnforce({ stateDir, instances, rc, log }) {
  const file = path.join(stateDir, "enforce.json");
  let rules = {};
  const lastCheck = new Map(); // инстанс → { at, state }
  const readySince = new Map(); // инстанс → когда обе команды стали готовы (игра с ботами)
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
    // игра с ботами: MatchZy ждёт «.r» от всех на сервере, а боты его не пишут — разминка бесконечна.
    // Когда обе команды готовы (люди нажали .r), а разминка держится дольше READY_START_MS — запускаем сами.
    if (Number(rule.cvars?.bot_quota) > 0 && get5.gamestate === "warmup" && get5.team1?.ready && get5.team2?.ready) {
      const since = readySince.get(inst.name) ?? Date.now();
      readySince.set(inst.name, since);
      if (Date.now() - since >= READY_START_MS) {
        readySince.delete(inst.name);
        await rc(inst, "css_start").catch(() => {});
        log(`матч ${inst.name}: все люди готовы, боты не жмут .r — старт (css_start)`);
        return;
      }
    } else {
      readySince.delete(inst.name);
    }
    // смена состояния (разминка → нож → игра, новая карта) — проверяем сразу; в самой игре — раз в минуту
    const state = `${get5.gamestate}:${get5.map_number}`;
    const prev = lastCheck.get(inst.name);
    if (get5.gamestate === "live" && prev?.state === state && Date.now() - prev.at < LIVE_CHECK_MS) return;
    lastCheck.set(inst.name, { at: Date.now(), state });
    const names = Object.keys(rule.cvars);
    const out = await rc(inst, names.join(";")).catch(() => null);
    if (out == null) return; // RCON не ответил — не гадаем, исправим на следующем тике
    const expected = (name) => name === AUTO_HALFTIME_VOICE && rule.halftimeVoiceMaps?.length
      ? rule.halftimeVoiceActiveMap === get5.map_number && ["going_live", "live"].includes(get5.gamestate) ? 1 : 0
      : rule.cvars[name];
    const fix = names.filter((n) => {
      const want = expected(n);
      // строковые cvars (bot_quota_mode): MatchZy при загрузке матча возвращает «competitive» — боты занимают все слоты
      if (typeof want === "string") {
        const m = new RegExp(`${n} = (\\S+)`, "i").exec(out);
        return !!m && m[1].toLowerCase() !== want.toLowerCase();
      }
      const m = new RegExp(`${n} = (true|false|[-+]?\\d+(?:\\.\\d+)?)`, "i").exec(out);
      if (!m) return false;
      const value = m[1].toLowerCase();
      const current = value === "true" ? 1 : value === "false" ? 0 : Number(value);
      return current !== Number(want);
    });
    if (fix.length) {
      await rc(inst, fix.map((n) => `${n} ${expected(n)}`).join(";")).catch(() => {});
      log(`enforce ${inst.name}: ${fix.map((n) => `${n}=${expected(n)}`).join(" ")}`);
    }
  }

  return { set, clear, apply, onMatchzyEvent, has: (name) => !!rules[name] };
}
