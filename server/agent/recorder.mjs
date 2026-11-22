// Запись демо карт — её ведёт агент, а не MatchZy.
// MatchZy шлёт движку tv_record с полным путём (D:/cs2server/game/csgo/MatchZy/…), а CS2 на полный путь
// отвечает «invalid path» и ничего не пишет (проверено 22.11.2026: папка демо пустая с конца октября).
// С путём от game/csgo запись идёт. Поэтому, как только карта матча началась (нож или игра), агент сам даёт
// tv_record MatchZy/<имя>, а когда карта закончилась — tv_stoprecord. Имя файла — в том же виде, что ждёт
// раздача демо (demos.mjs → FILE_RE): {время}_{matchid}_map{номер с нуля}_{карта}.dem
//
// Повторный tv_record во время записи закрывает файл и начинает новый — поэтому помним, что уже пишем.
// После перезапуска агента посреди карты запись начнётся заново: у карты будет две части, сайт это умеет.

const PLAY = ["knife", "waiting_for_knife_decision", "going_live", "live"];
const RETRY_MS = 60_000;

const pad = (n) => String(n).padStart(2, "0");

/** Имя файла демо без папки: 2026-11-22_18-27-53_1000057_map0_de_mirage.dem */
export function demoFileName(matchid, mapNumber, mapName, now = new Date()) {
  const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const map = String(mapName ?? "").split("/").pop().replace(/[^\w-]+/g, "_").slice(0, 40) || "map";
  return `${time}_${Number(matchid)}_map${Number(mapNumber) || 0}_${map}.dem`;
}

/** ctx: { rc(inst, command), log, dir — папка демо от game/csgo, со слэшем на конце } */
export function createRecorder({ rc, log, dir = "MatchZy/" }) {
  const state = {}; // { [instance]: { key, file, failedAt } }

  async function stop(inst) {
    const st = state[inst.name];
    delete state[inst.name];
    if (!st?.file) return;
    const out = await rc(inst, "tv_stoprecord").catch(() => "");
    if (/Completed/i.test(String(out ?? ""))) log(`демо ${inst.name}: запись закончена — ${st.file}`);
  }

  /** a — назначенный на сервер матч, get5 — ответ get5_status (null — сервер не ответил), info — A2S */
  async function tick(inst, a, get5, info) {
    if (!get5) return; // сервер молчит (смена карты) — ничего не решаем
    const playing = !!a && get5.matchid === a.matchid && PLAY.includes(get5.gamestate);
    if (!playing) {
      if (state[inst.name]) await stop(inst);
      return;
    }
    const key = `${get5.matchid}:${get5.map_number ?? 0}`;
    const st = state[inst.name];
    if (st?.key === key && (st.file || Date.now() - st.failedAt < RETRY_MS)) return;
    if (st && st.key !== key) await stop(inst);
    const file = demoFileName(get5.matchid, get5.map_number, info?.map);
    const out = String((await rc(inst, `tv_record ${dir}${file}`)) ?? "");
    if (/invalid|error|not active|unable/i.test(out)) {
      state[inst.name] = { key, file: null, failedAt: Date.now() };
      log(`демо ${inst.name}: запись не началась — ${out.trim().slice(0, 160)}`);
      return;
    }
    state[inst.name] = { key, file, failedAt: 0 };
    log(`демо ${inst.name}: запись — ${file}`);
  }

  return { tick, forget: (name) => delete state[name] };
}
