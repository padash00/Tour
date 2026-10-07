// Автостарт карт серии.
// Перед первой картой игроки пишут .r сами. На следующих картах серии ждать .r не нужно: как только
// весь состав зашёл на новую карту, через 15 с сервер стартует сам (css_start — дальше нож, если он
// включён, или сразу игра). Если кто-то вышел за эти 15 с — отсчёт начинается заново.
//
// «Весь состав зашёл» считаем по SteamID состава из конфига матча среди игроков сервера (status_json,
// иначе status). Число игроков из A2S для этого не годится: в нём GOTV и зрители-админы.
import { readMatchConfig, mapTitle } from "./hud.mjs";
import { countRosterOnline, steamIdsFromStatus, steamIdsFromStatusJson } from "./lib.mjs";

const AUTOSTART_DELAY_MS = 15_000;

/** SteamID состава матча (обе команды) из конфига MatchZy */
export function rosterIds(cfg) {
  return [cfg?.team1, cfg?.team2].flatMap((t) => Object.keys(t?.players ?? {})).filter((id) => /^\d{17}$/.test(id));
}

/**
 * Сколько игроков состава на сервере.
 * statusJson / status — ответы консоли (null — не ответила). status_json CS2 перечисляет клиентов со SteamID —
 * ему верим, даже если игроков нет. Иначе ищем SteamID в тексте status. Не нашли ни одного (неизвестный
 * формат) — запасной путь как раньше: A2S минус GOTV.
 */
export function onlineRosterCount({ cfg, statusJson, status, a2sPlayers }) {
  const roster = rosterIds(cfg);
  const fromJson = steamIdsFromStatusJson(statusJson);
  if (fromJson && roster.length) return { count: countRosterOnline(roster, fromJson), source: "status_json" };
  const fromText = steamIdsFromStatus(status);
  if (fromText.size && roster.length) return { count: countRosterOnline(roster, fromText), source: "status" };
  return { count: Math.max(0, (a2sPlayers ?? 0) - 1), source: "a2s" };
}

/** ctx: { stateDir, rc(inst, command), log, hud } */
export function createAutostart({ stateDir, rc, log, hud }) {
  const state = {}; // { [instance]: { key, since, announced, done } }

  async function countOnline(inst, cfg, info) {
    const statusJson = await rc(inst, "status_json").catch(() => null);
    const status = steamIdsFromStatusJson(statusJson) ? null : await rc(inst, "status").catch(() => null);
    return onlineRosterCount({ cfg, statusJson, status, a2sPlayers: info?.players });
  }

  async function tick(inst, a, info, get5) {
    const mapNo = get5?.map_number ?? 0;
    if (!a || !get5 || get5.matchid !== a.matchid || get5.gamestate !== "warmup") {
      delete state[inst.name];
      await hud.warmup(inst, a, get5, null);
      return;
    }
    // игра лобби с ботами: ботов в составе нет — ждать «все зашли» нельзя, игроки пишут .r сами
    if (a.payload?.lobby && a.payload?.autostart_off) {
      delete state[inst.name];
      await hud.warmup(inst, a, get5, "Напишите .r в чат, когда готовы");
      return;
    }
    const cfg = readMatchConfig(stateDir, a.match_id);
    // в лобби команды бывают неполными — ждём столько людей, сколько в составе
    const need = Number(a.payload?.autostart_need) || (cfg?.players_per_team ?? 5) * 2;
    // лобби: готовность уже подтвердили на сайте — первая карта тоже стартует сама, когда все зашли
    if (mapNo < 1 && !a.payload?.autostart_first) {
      // первая карта — игроки сами пишут .r
      const { count } = await countOnline(inst, cfg, info);
      delete state[inst.name];
      await hud.warmup(inst, a, get5, count < need ? "Напишите .r в чат, когда готовы" : "Все на месте · напишите .r");
      return;
    }
    const key = `${a.matchid}:${mapNo}`;
    let st = state[inst.name];
    if (!st || st.key !== key) st = state[inst.name] = { key, since: null, announced: false, done: false };
    if (st.done) return;
    const { count, source } = await countOnline(inst, cfg, info);
    if (!st.announced) {
      st.announced = true;
      const total = cfg?.num_maps ? ` из ${cfg.num_maps}` : "";
      const name = cfg?.maplist?.[mapNo] ? ` — ${mapTitle(cfg.maplist[mapNo])}` : "";
      await rc(inst, `css_asay Карта ${mapNo + 1}${total}${name}. Писать .r не нужно: старт сам, когда все зайдут`).catch(() => {});
    }
    if (count < need) {
      st.since = null;
      await hud.warmup(inst, a, get5, `Ждём игроков ${count}/${need} · старт сам`);
      return;
    }
    st.since ??= Date.now();
    const left = Math.ceil((AUTOSTART_DELAY_MS - (Date.now() - st.since)) / 1000);
    if (left > 0) {
      await hud.warmup(inst, a, get5, `Все на месте · старт через ${left} с`);
      return;
    }
    st.done = true;
    await hud.clear(inst);
    await rc(inst, "css_asay Все на месте — старт!").catch(() => {});
    const out = await rc(inst, "css_start").catch((e) => String(e.message));
    log(`автостарт ${inst.name}: матч ${a.matchid}, карта ${mapNo + 1} (${count}/${need} по ${source}) ${String(out ?? "").trim().slice(0, 80)}`);
  }

  return { tick, forget: (name) => delete state[name] };
}
