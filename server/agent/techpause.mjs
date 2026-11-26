// Банк техпаузы: у каждой команды 2 минуты на карту, сколько бы раз она ни писала .tech.
// Остаток переносится между паузами и через смену сторон (считается по команде, а не по стороне).
//
// MatchZy так не умеет: у него «N пауз по S секунд», и по истечении времени пауза сама не снимается.
// Поэтому число пауз в MatchZy не ограничено (matchzy_max_tech_pauses 0), а время ведёт агент:
//   - событие game_paused (pause_type technical) — MatchZy шлёт его в момент команды .tech;
//   - время идёт только в закупке, как и у MatchZy: пауза посреди раунда начинает действовать со следующего
//     раунда. Начало закупки видно по HTTP-логу CS2 («Starting Freeze period»), конец — «Round_Start»;
//   - matchzy_tech_pause_time ставится равным остатку команды: MatchZy читает его каждую секунду и сам
//     показывает игрокам отсчёт по центру экрана;
//   - остаток вышел — агент снимает паузу (css_forceunpause). Остатка нет — .tech снимается сразу.
// Тактические перерывы, пауза админа и пауза после восстановления раунда в банк не идут.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const TECH_BANK_SECONDS = 120;
/** На каких остатках пишем в чат */
const MARKS = [60, 30, 10];

export const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/**
 * ctx: {
 *   stateDir, rc(inst, command), log,
 *   find(matchid, token) → инстанс с этим матчем (token === undefined — не сверять),
 *   teamName(inst, "team1" | "team2") → название команды,
 *   now() — для проверок
 * }
 */
export function createTechPause({ stateDir, rc, log, find, teamName = () => null, now = Date.now, bankSeconds = TECH_BANK_SECONDS }) {
  const file = path.join(stateDir, "techpause.json");
  /** { [instance]: { key: "matchid:map", left: { team1, team2 }, phase: "freeze" | "live" | null, active: { team, since, said } | null } } */
  let state = {};
  try {
    state = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const save = () => {
    try {
      writeFileSync(file, JSON.stringify(state));
    } catch {}
  };
  const say = (inst, text) => rc(inst, `css_asay ${text}`).catch(() => {});
  const nameOf = (inst, team) => teamName(inst, team) || (team === "team1" ? "Команда 1" : "Команда 2");

  function stateFor(inst, matchid, mapNumber) {
    const key = `${Number(matchid)}:${Number(mapNumber) || 0}`;
    let st = state[inst.name];
    if (!st || st.key !== key) st = state[inst.name] = { key, left: { team1: bankSeconds, team2: bankSeconds }, phase: st?.key?.startsWith(`${Number(matchid)}:`) ? st.phase : null, active: null };
    return st;
  }

  const spent = (st) => (st.active?.since ? Math.max(0, Math.floor((now() - st.active.since) / 1000)) : 0);

  /** Пауза закончилась: списываем время, которое она шла в закупке */
  async function settle(inst, st, announce) {
    const a = st.active;
    if (!a) return;
    st.left[a.team] = Math.max(0, st.left[a.team] - spent(st));
    st.active = null;
    save();
    log(`техпауза ${inst.name}: снята, у ${a.team} осталось ${clock(st.left[a.team])}`);
    if (announce) await say(inst, `Техпауза снята. У «${nameOf(inst, a.team)}» осталось ${clock(st.left[a.team])} на эту карту`);
  }

  async function onMatchzyEvent(ev, token) {
    if (!ev || !["going_live", "game_paused", "game_unpaused", "map_result", "series_end"].includes(ev.event)) return;
    const inst = find(ev.matchid, token);
    if (!inst) return;
    if (ev.event === "map_result" || ev.event === "series_end") {
      delete state[inst.name];
      return save();
    }
    const st = stateFor(inst, ev.matchid, ev.map_number);
    if (ev.event === "going_live") {
      // карта стартует с закупки; число пауз не ограничиваем — ограничивает банк
      st.phase = "freeze";
      save();
      await rc(inst, `matchzy_enable_tech_pause true;matchzy_max_tech_pauses 0;matchzy_tech_pause_time ${bankSeconds}`).catch(() => {});
      return;
    }
    if (ev.event === "game_unpaused") return settle(inst, st, true);
    // game_paused
    if (st.active) await settle(inst, st, false); // прошлую паузу сняли без события
    if (ev.pause_type !== "technical" || !["team1", "team2"].includes(ev.team)) return;
    const team = ev.team;
    const left = st.left[team];
    if (left <= 0) {
      await rc(inst, "css_forceunpause").catch(() => {});
      await say(inst, `У «${nameOf(inst, team)}» время техпаузы на этой карте израсходовано — пауза снята`);
      log(`техпауза ${inst.name}: ${team} — банк пуст, пауза снята`);
      return;
    }
    const frozen = st.phase !== "live"; // фаза неизвестна (лога нет) — считаем с момента команды
    st.active = { team, since: frozen ? now() : null, said: MARKS.filter((m) => m >= left) };
    save();
    await rc(inst, `matchzy_tech_pause_time ${left}`).catch(() => {});
    await say(inst, `Техпауза «${nameOf(inst, team)}»: в запасе ${clock(left)} на эту карту${frozen ? ", отсчёт идёт" : " — отсчёт пойдёт с начала следующего раунда"}. Снять раньше: .unpause`);
    log(`техпауза ${inst.name}: ${team}, в запасе ${clock(left)}${frozen ? "" : " (ждёт конца раунда)"}`);
  }

  /** HTTP-лог CS2 этого матча: по нему видно, идёт ли закупка */
  async function onCs2Log(matchid, body) {
    const inst = find(matchid);
    const st = inst && state[inst.name];
    if (!st || !st.key.startsWith(`${Number(matchid)}:`)) return;
    let phase = null;
    for (const line of String(body).split("\n")) {
      if (line.includes("Starting Freeze period")) phase = "freeze";
      else if (line.includes('World triggered "Round_Start"')) phase = "live";
    }
    if (!phase || phase === st.phase) return;
    st.phase = phase;
    if (phase === "freeze" && st.active && !st.active.since) {
      st.active.since = now();
      await say(inst, `Техпауза «${nameOf(inst, st.active.team)}»: отсчёт пошёл, в запасе ${clock(st.left[st.active.team])}`);
    } else if (phase === "live" && st.active?.since) {
      await settle(inst, st, true); // раунд пошёл — паузу сняли, а событие не дошло
    }
    save();
  }

  /** Раз в секунду: отметки в чат и снятие паузы, когда остаток вышел */
  async function tick(instances) {
    for (const inst of instances) {
      const st = state[inst.name];
      const a = st?.active;
      if (!a?.since) continue;
      const rem = st.left[a.team] - spent(st);
      if (rem <= 0) {
        st.left[a.team] = 0;
        st.active = null;
        save();
        await rc(inst, "css_forceunpause").catch(() => {});
        await say(inst, `Техпауза «${nameOf(inst, a.team)}»: время вышло, игра продолжается. Техпауз на этой карте у команды больше нет`);
        log(`техпауза ${inst.name}: у ${a.team} время вышло, пауза снята`);
        continue;
      }
      const mark = MARKS.find((m) => rem <= m && !a.said.includes(m));
      if (mark) {
        a.said.push(...MARKS.filter((m) => m >= mark && !a.said.includes(m))); // пропущенные отметки не догоняем
        save();
        await say(inst, `Техпауза «${nameOf(inst, a.team)}»: осталось ${clock(rem)}`);
      }
    }
  }

  return { onMatchzyEvent, onCs2Log, tick, forget: (name) => { delete state[name]; save(); }, get state() { return state; } };
}
