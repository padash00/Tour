// Назначенные матчи и автоподъём: если CS2 с назначенным матчем упал, агент запускает его, загружает
// матч заново и восстанавливает последний раунд из бэкапа MatchZy (до 2 попыток подряд), админам уходит
// уведомление. Тот же путь — перезапуск сервера админом посреди матча (матч не теряется) и обслуживание
// хоста (обновление CS2/плагинов, перезапуск всех серверов): после него назначенные матчи загружаются заново.
//
// Конфиг матча не умеет начинать серию с середины: после загрузки MatchZy стоит на первой карте при 0:0.
// Раунд идущей карты возвращает бэкап раунда (в нём есть номер карты и счёт серии). Между картами бэкапа
// нужной карты ещё нет — тогда серию ставим на место «пустым» бэкапом (restoreSeries, см. ниже).
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readMatchConfig } from "./hud.mjs";
import { parseGet5 } from "./lib.mjs";

const MAX_RECOVERY_ATTEMPTS = 2;
const MISSING_TICKS = 3; // процесс не виден 3 опроса подряд (~15 с) — не мигание списка процессов
const LIVE_STATES = ["warmup", "knife", "waiting_for_knife_decision", "going_live", "live"];
const STATE_POLL_MS = Number(process.env.F16_STATE_POLL_MS) || 3000; // тесты ставят меньше
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readJsonSafe = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

/** Последний бэкап раунда MatchZy для матча и карты: matchzy_<matchid>_<map>_round<N>.json */
export function latestBackup(dir, matchid, mapNumber) {
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^matchzy_${matchid}_${mapNumber}_round(\\d+)\\.json$`);
  let best = null;
  for (const f of readdirSync(dir)) {
    const m = re.exec(f);
    if (m && (!best || Number(m[1]) > best.round)) best = { file: f, round: Number(m[1]) };
  }
  return best;
}

/** Любой бэкап матча (самый поздний по карте и раунду) — заготовка для бэкапа серии */
export function latestMatchBackup(dir, matchid) {
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^matchzy_${matchid}_(\\d+)_round(\\d+)\\.json$`);
  let best = null;
  for (const f of readdirSync(dir)) {
    const m = re.exec(f);
    if (!m) continue;
    const key = Number(m[1]) * 1000 + Number(m[2]);
    if (!best || key > best.key) best = { file: f, key };
  }
  return best?.file ?? null;
}

/**
 * Бэкап «серия стоит на карте mapNumber при счёте s1:s2» из любого бэкапа этого матча.
 * MatchZy в разминке не восстанавливает раунд сразу, а запоминает из бэкапа матч, номер карты и счёт серии,
 * меняет карту и ждёт старта. Файл после этого удаляем: на старте MatchZy его не находит и начинает карту
 * как обычно (нож, 0:0), но уже с правильным номером карты и счётом серии.
 */
export function seriesBackup(template, { mapNumber, mapName, s1, s2 }) {
  const team = (json, score) => JSON.stringify({ ...JSON.parse(json), seriesScore: score });
  const cfg = JSON.parse(template.match_config);
  cfg.CurrentMapNumber = mapNumber;
  return {
    ...template,
    map_name: mapName,
    mapnumber: String(mapNumber),
    round: "00",
    team1: team(template.team1, s1),
    team2: team(template.team2, s2),
    team1_score: "0",
    team2_score: "0",
    team1_series_score: String(s1),
    team2_series_score: String(s2),
    bomb_stats: "{}",
    match_config: JSON.stringify(cfg),
    // MatchZy не берёт бэкап без целых данных раунда; эти данные не загружаются — файл удаляется до старта
    valve_backup: '"SaveFile"\n{\n}\n',
  };
}

/**
 * ctx: { stateDir, serverDir, rc(inst, command, opts?), a2sInfo(port), log, runStart(name, stop),
 *        loadMatch(inst, payload), inLane(name, fn) }
 */
export function createRecovery(ctx) {
  const { stateDir, serverDir, rc, log } = ctx;
  const assignFile = path.join(stateDir, "assignments.json");
  // { [instance]: { payload, matchid, match_id, loaded_at, seen, live, map_number, missing, attempts, gamestate, state_at } }
  const assignments = readJsonSafe(assignFile, {});
  const save = () => writeFileSync(assignFile, JSON.stringify(assignments, null, 1));
  const recovering = new Set();
  const queued = new Set(); // подъём уже стоит в очереди инстанса

  // события для сайта (уведомления админам): удаляются, только когда сайт подтвердил их id
  const eventsFile = path.join(stateDir, "events-pending.json");
  let pendingEvents = readJsonSafe(eventsFile, []).map((e) => (e.id ? e : { ...e, id: randomUUID() }));
  const saveEvents = () => writeFileSync(eventsFile, JSON.stringify(pendingEvents));
  function pushEvent(e) {
    pendingEvents.push({ ...e, id: randomUUID(), at: new Date().toISOString() });
    pendingEvents = pendingEvents.slice(-50);
    saveEvents();
  }
  function ackEvents(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const done = new Set(ids);
    const before = pendingEvents.length;
    pendingEvents = pendingEvents.filter((e) => !done.has(e.id));
    if (pendingEvents.length !== before) saveEvents();
  }

  function assign(inst, payload) {
    assignments[inst.name] = {
      payload,
      matchid: Number(payload.matchzy_id),
      match_id: payload.match_id,
      loaded_at: Date.now(),
      seen: false,
      live: false,
      map_number: null,
      missing: 0,
      attempts: 0,
      gamestate: null,
      state_at: null,
    };
    save();
  }

  function forget(inst) {
    if (!assignments[inst.name]) return;
    delete assignments[inst.name];
    save();
  }

  /** Сервер точно не отвечает: ни A2S, ни RCON. Список процессов мог ошибиться — перед подъёмом проверяем */
  async function confirmDead(inst) {
    const [info, status] = await Promise.all([
      ctx.a2sInfo(inst.port).catch(() => null),
      rc(inst, "get5_status", { timeoutMs: 3000 }).catch(() => null),
    ]);
    return !info && status == null;
  }

  /**
   * Отслеживает матч на инстансе: увидели загруженным, идёт live, закончился сам — или процесс пропал.
   * running: true / false / null (список процессов не получен — «неизвестно», падением не считаем).
   */
  function track(inst, running, get5) {
    const a = assignments[inst.name];
    if (!a || recovering.has(inst.name) || queued.has(inst.name) || running == null) return;
    let changed = false;
    if (!running) {
      a.missing = (a.missing ?? 0) + 1;
      save();
      if (a.missing >= MISSING_TICKS && !queued.has(inst.name)) {
        queued.add(inst.name);
        ctx.inLane(inst.name, async () => {
          if (!assignments[inst.name] || recovering.has(inst.name)) return;
          if (!(await confirmDead(inst))) {
            log(`${inst.name}: процесс не виден, но сервер отвечает — не поднимаю`);
            a.missing = 0;
            save();
            return;
          }
          await recoverNow(inst, { reason: "crash" });
        }).catch((e) => log(`автоподъём ${inst.name}: ${e?.message ?? e}`)).finally(() => queued.delete(inst.name));
      }
      return;
    }
    if (a.missing) {
      a.missing = 0;
      changed = true;
    }
    if (get5) {
      const gs = get5.matchid === a.matchid ? get5.gamestate : "none";
      if (a.gamestate !== gs) {
        a.gamestate = gs;
        a.state_at = Date.now();
        changed = true;
      }
    }
    if (get5 && get5.matchid === a.matchid) {
      if (!a.seen) {
        a.seen = true;
        changed = true;
      }
      // где стоит серия: номер карты и счёт — по ним матч возвращается на место после перезапуска между картами
      if (get5.gamestate && get5.gamestate !== "none") {
        const pos = { map: get5.map_number ?? 0, s1: get5.team1?.series_score ?? 0, s2: get5.team2?.series_score ?? 0 };
        if (!a.pos || a.pos.map !== pos.map || a.pos.s1 !== pos.s1 || a.pos.s2 !== pos.s2) {
          a.pos = pos;
          changed = true;
        }
      }
      if (["going_live", "live"].includes(get5.gamestate)) {
        if (!a.live || a.map_number !== get5.map_number) {
          a.live = true;
          a.map_number = get5.map_number ?? a.map_number ?? 0;
          changed = true;
        }
      }
    } else if (get5 && a.seen && (get5.gamestate === "none" || get5.matchid !== a.matchid)) {
      // серия закончилась сама (или матч сняли мимо агента) — следить больше не за чем
      delete assignments[inst.name];
      changed = true;
    }
    if (changed) save();
  }

  async function waitRcon(inst, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const out = await rc(inst, "get5_status").catch(() => null);
      if (out != null) return parseGet5(out) ?? { gamestate: "unknown" };
      await sleep(3000);
    }
    return null;
  }

  /** Ждём состояние матча на сервере; false — не дождались */
  async function waitState(inst, matchid, test, timeoutMs) {
    const started = Date.now();
    for (;;) {
      const s = parseGet5(await rc(inst, "get5_status").catch(() => null));
      if (s && s.matchid === matchid && test(s)) return true;
      if (Date.now() - started >= timeoutMs) return false;
      await sleep(STATE_POLL_MS);
    }
  }

  /** Поставить загруженный заново матч на карту target со счётом серии из a.pos (см. seriesBackup) */
  async function restoreSeries(inst, a, target) {
    if (!a.pos || a.pos.map !== target) return { ok: false, note: "агент не знает счёт серии" };
    const mapName = readMatchConfig(stateDir, a.match_id)?.maplist?.[target];
    if (!mapName || /^\d+$/.test(mapName)) return { ok: false, note: "карта из Workshop — MatchZy не сменит её по имени" };
    const backupDir = path.join(serverDir, "game", "csgo", "MatchZyDataBackup");
    const from = latestMatchBackup(backupDir, a.matchid);
    if (!from) return { ok: false, note: "нет ни одного бэкапа этого матча" };
    const file = `f16_series_${a.matchid}_${target}.json`;
    const full = path.join(backupDir, file);
    try {
      const template = JSON.parse(readFileSync(path.join(backupDir, from), "utf8"));
      writeFileSync(full, JSON.stringify(seriesBackup(template, { mapNumber: target, mapName, s1: a.pos.s1, s2: a.pos.s2 })));
      const out = String(await rc(inst, `matchzy_loadbackup ${file}`).catch((e) => e.message));
      const ok = await waitState(inst, a.matchid, (s) => s.map_number === target && s.gamestate === "pending_restore", 90_000);
      return ok ? { ok: true } : { ok: false, note: out.trim().slice(0, 140) || "MatchZy не принял бэкап серии" };
    } finally {
      // файл нужен только до этого момента: на старте карты MatchZy не должен его найти
      rmSync(full, { force: true });
    }
  }

  /**
   * Поднять сервер с назначенным матчем: запуск, загрузка матча заново, восстановление раунда.
   * reason: "crash" — процесс упал; "restart" — админ перезапускает сервер посреди матча (сначала остановка);
   * "maintenance" — серверы перезапустило обслуживание хоста (они уже запущены).
   * Вызывать внутри очереди инстанса (ctx.inLane), чтобы команды сайта не шли параллельно.
   */
  async function recoverNow(inst, { reason = "crash" } = {}) {
    const a = assignments[inst.name];
    if (!a || recovering.has(inst.name)) return { ok: false, result: "нет назначенного матча" };
    recovering.add(inst.name);
    a.attempts = (a.attempts ?? 0) + 1;
    save();
    const why = reason === "restart" ? "перезапуск по команде" : reason === "maintenance" ? "после обслуживания" : `попытка ${a.attempts}/${MAX_RECOVERY_ATTEMPTS}`;
    log(`автоподъём ${inst.name}: ${why} (матч ${a.matchid}${a.live ? `, карта ${a.map_number}` : ""})`);
    try {
      if (reason === "restart") {
        await ctx.runStart(inst.name, true);
        await sleep(3000);
      }
      await ctx.runStart(inst.name, false);
      const g5 = await waitRcon(inst, 150_000);
      if (!g5) throw new Error("сервер не ответил по RCON за 2,5 минуты после запуска");
      const r = await ctx.loadMatch(inst, a.payload);
      if (!r.ok) throw new Error(`матч не загрузился: ${r.result}`);
      let detail = "Матч загружен заново, игроки могут переподключаться по тому же адресу.";
      const target = a.pos?.map ?? (a.live ? (a.map_number ?? 0) : 0);
      const midMap = a.live && (a.map_number ?? 0) === target;
      if (midMap || target > 0) {
        // ждём, пока MatchZy поставит матч в разминку, затем восстанавливаем раунд или место в серии
        for (let k = 0; k < 40; k++) {
          const s = await waitRcon(inst, 5000);
          if (s && s.matchid === a.matchid && s.gamestate && s.gamestate !== "none") break;
          await sleep(3000);
        }
      }
      let roundRestored = false;
      if (midMap) {
        const backupDir = path.join(serverDir, "game", "csgo", "MatchZyDataBackup");
        const b = latestBackup(backupDir, a.matchid, target);
        if (b) {
          // MatchZy принимает имя файла из MatchZyDataBackup (listbackups показывает полный путь) — пробуем оба, без кавычек
          let out = "";
          for (const arg of [b.file, path.join(backupDir, b.file)]) {
            out = String(await rc(inst, `matchzy_loadbackup ${arg}`).catch((e) => e.message));
            if (/does not exist|error|invalid|usage|not found|failed/i.test(out)) continue;
            // ответ команды бывает переведён — верим состоянию: MatchZy принял бэкап и ждёт игроков (или уже играет)
            if (await waitState(inst, a.matchid, (s) => s.map_number === target && ["pending_restore", "live", "going_live"].includes(s.gamestate), 15_000)) {
              roundRestored = true;
              break;
            }
          }
          detail = roundRestored
            ? `Матч загружен заново, восстановлен раунд ${b.round} карты ${target + 1} — MatchZy поставит паузу, снимите её, когда все подключатся.`
            : `Матч загружен заново, но раунд восстановить не удалось (${out.trim().slice(0, 140) || "MatchZy не принял бэкап"}). Восстановите вручную в пульте матча: matchzy_loadbackup ${b.file}`;
        } else {
          detail = "Матч загружен заново, но бэкап раунда не найден (на Workshop-картах CS2 запрещает бэкапы) — карта начнётся с разминки.";
        }
      }
      if (!roundRestored && target > 0) {
        // между картами (или раунд вернуть не вышло): серия должна стоять на своей карте, а не начинаться с первой
        const r = await restoreSeries(inst, a, target).catch((e) => ({ ok: false, note: String(e?.message ?? e) }));
        const where = `карта ${target + 1}, счёт серии ${a.pos?.s1 ?? "?"}:${a.pos?.s2 ?? "?"}`;
        detail = r.ok
          ? `Матч загружен заново, серия продолжается: ${where}.${midMap ? " Раунд восстановить не удалось — карта начнётся заново." : ""}`
          : `Матч загружен заново, но серию не удалось поставить на место (${where}): ${r.note}. Сейчас на сервере первая карта при 0:0 — перенесите матч или доиграйте с правкой счёта.`;
        if (r.ok) a.live = false;
      }
      // успешный подъём — счётчик попыток с нуля: следующее падение снова получит две попытки
      a.missing = 0;
      a.attempts = 0;
      save();
      if (reason === "restart") detail = `Сервер перезапущен админом. ${detail}`;
      if (reason === "maintenance") detail = `Серверы перезапущены обслуживанием. ${detail}`;
      pushEvent({ type: "recovered", instance: inst.name, matchzy_id: a.matchid, detail });
      log(`автоподъём ${inst.name}: ok — ${detail}`);
      return { ok: true, result: detail };
    } catch (e) {
      const msg = String(e?.message ?? e);
      log(`автоподъём ${inst.name}: не удалось — ${msg}`);
      if (a.attempts >= MAX_RECOVERY_ATTEMPTS || reason === "restart") {
        pushEvent({ type: "recovery_failed", instance: inst.name, matchzy_id: a.matchid, detail: `${msg}. Перенесите матч на другой сервер.` });
        forget(inst);
      }
      return { ok: false, result: msg };
    } finally {
      recovering.delete(inst.name);
    }
  }

  /** Есть матч, который сейчас нельзя прерывать обновлением агента (разминка или игра) */
  const liveAssignments = () =>
    Object.entries(assignments).filter(([name, a]) => recovering.has(name) || LIVE_STATES.includes(a.gamestate ?? "")).map(([name]) => name);

  /** Матч, который агент сейчас возвращает на сервер (подъём идёт или стоит в очереди); null — такого нет */
  const holding = (name) => (assignments[name] && (recovering.has(name) || queued.has(name)) ? assignments[name].matchid : null);

  return {
    assignments,
    recovering,
    holding,
    assign,
    forget,
    track,
    recoverNow,
    liveAssignments,
    pushEvent,
    ackEvents,
    get pendingEvents() {
      return pendingEvents.slice();
    },
  };
}
