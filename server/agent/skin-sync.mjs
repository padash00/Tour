// Скины игроков: связь сайта с базой плагина WeaponPaints (локальная MariaDB f16_skins).
// Раз в несколько секунд агент читает базу плагина, отправляет сайту наборы игроков, которые изменились
// (игрок поменял скин в игре через !skins или правка пришла с сайта), и получает правки, сделанные на сайте, —
// их он записывает в базу плагина. Игрок увидит новый скин при следующем заходе на сервер или по команде !wp.
// Доступ к базе — из конфига плагина (тот же логин и пароль, что у него); клиент — mysql.exe из D:\cs2server\mariadb.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CONFIG_REL = path.join("counterstrikesharp", "configs", "plugins", "WeaponPaints", "WeaponPaints.json");
const NO_STICKERS = "0;0;0;0;0;0;0";
const NO_KEYCHAIN = "0;0;0;0;0";

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isTeam = (v) => v === 2 || v === 3;
const isSteam = (v) => typeof v === "string" && /^\d{17}$/.test(v);
const wearOf = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 1e6) / 1e6 : null);
/** Строка в SQL — только шестнадцатеричным литералом: никакой текст игрока не попадает в запрос как есть */
const text = (s) => `CONVERT(UNHEX('${Buffer.from(String(s), "utf8").toString("hex")}') USING utf8mb4)`;

/**
 * SQL для одной правки с сайта. Возвращает строку запросов или null, если правка непонятна.
 * Вынесено отдельно и без побочных эффектов — проверяется тестом.
 */
export function opSql(steamId, op) {
  if (!isSteam(steamId) || !op || typeof op !== "object" || !isTeam(op.t)) return null;
  const who = `steamid = '${steamId}' AND weapon_team = ${op.t}`;
  const paint = (d, p, w, s, nametag, st) =>
    `INSERT INTO wp_player_skins (steamid, weapon_team, weapon_defindex, weapon_paint_id, weapon_wear, weapon_seed, weapon_nametag, weapon_stattrak, weapon_stattrak_count, weapon_sticker_0, weapon_sticker_1, weapon_sticker_2, weapon_sticker_3, weapon_sticker_4, weapon_keychain) ` +
    `VALUES ('${steamId}', ${op.t}, ${d}, ${p}, ${w}, ${s}, ${nametag}, ${st}, 0, '${NO_STICKERS}', '${NO_STICKERS}', '${NO_STICKERS}', '${NO_STICKERS}', '${NO_STICKERS}', '${NO_KEYCHAIN}') ` +
    `ON DUPLICATE KEY UPDATE weapon_paint_id = VALUES(weapon_paint_id), weapon_wear = VALUES(weapon_wear), weapon_seed = VALUES(weapon_seed), weapon_nametag = VALUES(weapon_nametag), weapon_stattrak = VALUES(weapon_stattrak);`;
  if (op.k === "skin") {
    const w = wearOf(op.w);
    if (!isInt(op.d, 1, 99999) || !isInt(op.p, 1, 99999) || w === null || !isInt(op.s, 0, 1000)) return null;
    const tag = typeof op.n === "string" && op.n.trim() ? text(op.n.trim().slice(0, 20)) : "NULL";
    return paint(op.d, op.p, w, op.s, tag, op.st === 1 ? 1 : 0);
  }
  if (op.k === "reset") {
    return isInt(op.d, 1, 99999) ? `DELETE FROM wp_player_skins WHERE ${who} AND weapon_defindex = ${op.d};` : null;
  }
  if (op.k === "knife") {
    if (typeof op.v !== "string" || !/^weapon_(knife[a-z0-9_]{0,40}|bayonet)$/.test(op.v)) return null;
    if (op.v === "weapon_knife") return `DELETE FROM wp_player_knife WHERE ${who};`;
    return `INSERT INTO wp_player_knife (steamid, weapon_team, knife) VALUES ('${steamId}', ${op.t}, '${op.v}') ON DUPLICATE KEY UPDATE knife = VALUES(knife);`;
  }
  if (op.k === "glove") {
    if (!isInt(op.d, 0, 99999)) return null;
    // раскраска прежней пары перчаток больше не нужна
    const dropOld = `DELETE s FROM wp_player_skins s JOIN wp_player_gloves g ON g.steamid = s.steamid AND g.weapon_team = s.weapon_team AND g.weapon_defindex = s.weapon_defindex WHERE s.steamid = '${steamId}' AND s.weapon_team = ${op.t};`;
    if (op.d === 0) return `${dropOld}\nDELETE FROM wp_player_gloves WHERE ${who};`;
    const w = wearOf(op.w);
    if (!isInt(op.p, 1, 99999) || w === null || !isInt(op.s, 0, 1000)) return null;
    return [
      dropOld,
      `INSERT INTO wp_player_gloves (steamid, weapon_team, weapon_defindex) VALUES ('${steamId}', ${op.t}, ${op.d}) ON DUPLICATE KEY UPDATE weapon_defindex = VALUES(weapon_defindex);`,
      paint(op.d, op.p, w, op.s, "NULL", 0),
    ].join("\n");
  }
  return null;
}

const READ_SQL = [
  "SELECT JSON_OBJECT('k','s','id',steamid,'t',weapon_team,'d',weapon_defindex,'p',weapon_paint_id,'w',weapon_wear,'s',weapon_seed,'n',weapon_nametag,'st',weapon_stattrak) FROM wp_player_skins ORDER BY steamid, weapon_team, weapon_defindex;",
  "SELECT JSON_OBJECT('k','k','id',steamid,'t',weapon_team,'v',knife) FROM wp_player_knife;",
  "SELECT JSON_OBJECT('k','g','id',steamid,'t',weapon_team,'d',weapon_defindex) FROM wp_player_gloves;",
].join("\n");

/** Строки ответа базы → наборы по игрокам: Map(steam_id → { skins, knife, gloves }) */
export function groupRows(lines) {
  const players = new Map();
  const of = (id) => {
    if (!players.has(id)) players.set(id, { skins: [], knife: {}, gloves: {} });
    return players.get(id);
  };
  for (const line of lines) {
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (!r || !isSteam(String(r.id)) || !isTeam(Number(r.t))) continue;
    const p = of(String(r.id));
    const t = Number(r.t);
    if (r.k === "s") {
      if (Number(r.p) > 0) p.skins.push({ t, d: Number(r.d), p: Number(r.p), w: wearOf(Number(r.w)) ?? 0, s: Number(r.s) || 0, n: r.n || null, st: Number(r.st) ? 1 : 0 });
    } else if (r.k === "k") {
      if (r.v && r.v !== "weapon_knife") p.knife[t] = String(r.v);
    } else if (r.k === "g") {
      if (Number(r.d) > 0) p.gloves[t] = Number(r.d);
    }
  }
  return players;
}

/** ctx: { serverDir, f16Dir, api(path, body), log } */
export function createSkinSync({ serverDir, f16Dir, api, log }) {
  const client = ["mysql.exe", "mariadb.exe"].map((n) => path.join(serverDir, "mariadb", "bin", n)).find((f) => existsSync(f));
  const configs = [path.join(serverDir, "game", "csgo", "addons", CONFIG_REL), path.join(f16Dir, "skins", "addons", CONFIG_REL)];
  /** steam_id → отпечаток набора, который сайт уже получил */
  const sent = new Map();
  /** подтверждения, которые сайт ещё не получил */
  let acks = [];
  /** id правок, уже записанных в базу (сайт может прислать их повторно, пока не дошло подтверждение) */
  const done = new Set();
  let problem = "";

  function connection() {
    for (const file of configs) {
      try {
        const c = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
        if (c.DatabaseName && c.DatabaseUser) return c;
      } catch {
        /* следующий */
      }
    }
    return null;
  }

  function query(sql) {
    const c = connection();
    if (!client || !c) return Promise.reject(new Error(!client ? "нет mysql.exe в mariadb\\bin" : "нет конфига WeaponPaints с доступом к базе"));
    return new Promise((resolve, reject) => {
      const child = execFile(
        client,
        [`-h${c.DatabaseHost || "127.0.0.1"}`, `-P${Number(c.DatabasePort) || 3306}`, `-u${c.DatabaseUser}`, "--batch", "--raw", "-N", "--default-character-set=utf8mb4", String(c.DatabaseName)],
        { env: { ...process.env, MYSQL_PWD: String(c.DatabasePassword ?? "") }, maxBuffer: 64 * 1024 * 1024, timeout: 20_000, windowsHide: true },
        (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).split("\n").find((l) => l.startsWith("ERROR")) ?? err.message.slice(0, 200))) : resolve(stdout)),
      );
      child.stdin.end(sql);
    });
  }

  /** Наборы, которые изменились с прошлой отправки (исчезнувший игрок — пустой набор) */
  async function changed() {
    const players = groupRows((await query(READ_SQL)).split(/\r?\n/).filter(Boolean));
    const out = [];
    const marks = [];
    for (const [id, data] of players) {
      const hash = createHash("sha1").update(JSON.stringify(data)).digest("hex");
      if (sent.get(id) !== hash) {
        out.push({ steam_id: id, data });
        marks.push([id, hash]);
      }
    }
    for (const id of sent.keys()) {
      if (!players.has(id)) {
        out.push({ steam_id: id, data: { skins: [], knife: {}, gloves: {} } });
        marks.push([id, null]);
      }
    }
    return { out, marks };
  }

  /** Один обмен с сайтом. true — пришли правки (стоит сразу повторить, чтобы сайт увидел результат) */
  async function tick() {
    let state = { out: [], marks: [] };
    try {
      state = await changed();
      if (problem) log("скины игроков: база плагина снова доступна");
      problem = "";
    } catch (e) {
      // база плагина недоступна — правки не подтверждаем, они дождутся
      if (problem !== e.message) log(`скины игроков: ${e.message}`);
      problem = e.message;
      return false;
    }
    const sending = acks;
    // за раз — не больше 400 наборов: первый обмен после запуска отправляет всех игроков
    const batch = state.out.slice(0, 400);
    const res = await api("/api/agent/skins", { state: batch, acks: sending }, 30_000);
    acks = acks.filter((a) => !sending.includes(a));
    for (const a of sending) done.delete(a.id);
    const batchIds = new Set(batch.map((b) => b.steam_id));
    for (const [id, hash] of state.marks) {
      if (!batchIds.has(id)) continue;
      if (hash) sent.set(id, hash);
      else sent.delete(id);
    }
    let applied = 0;
    for (const item of Array.isArray(res.ops) ? res.ops : []) {
      if (!Number.isInteger(item?.id) || done.has(item.id)) continue;
      const sql = opSql(item.steam_id, item.op);
      if (!sql) {
        acks.push({ id: item.id, error: "непонятная правка" });
        done.add(item.id);
        continue;
      }
      try {
        await query(sql);
        acks.push({ id: item.id });
        done.add(item.id);
        applied++;
      } catch (e) {
        log(`скины игроков: правка ${item.id} не записана: ${e.message}`);
        break; // порядок правок важен — остальные в следующий раз
      }
    }
    if (applied) log(`скины игроков: с сайта записано правок: ${applied}`);
    return applied > 0 || acks.length > 0 || state.out.length > batch.length;
  }

  return { tick, available: () => !!client && !!connection() };
}
