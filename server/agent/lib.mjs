// Сетевые помощники агента: Source RCON (TCP) и A2S_INFO (UDP), разбор ответов сервера.
import dgram from "node:dgram";
import net from "node:net";

// ───────────────────────── Source RCON

export const SERVERDATA_AUTH = 3;
export const SERVERDATA_EXECCOMMAND = 2;
export const SERVERDATA_AUTH_RESPONSE = 2;
export const SERVERDATA_RESPONSE_VALUE = 0;
/** Тело ответа сервера на пустой SERVERDATA_RESPONSE_VALUE (маркер конца) */
export const END_MARKER_REPLY = "\u0000\u0001\u0000\u0000";

export function encodePacket(id, type, body) {
  const b = Buffer.from(body + "\0\0", "utf8");
  const h = Buffer.alloc(12);
  h.writeInt32LE(8 + b.length, 0);
  h.writeInt32LE(id, 4);
  h.writeInt32LE(type, 8);
  return Buffer.concat([h, b]);
}

/** Целые пакеты из буфера; неполный хвост остаётся до следующего куска данных */
export function takePackets(buf) {
  const packets = [];
  let off = 0;
  while (buf.length - off >= 4) {
    const len = buf.readInt32LE(off);
    // id + type + два нуля = минимум 10 байт; больше 1 МБ — мусор в потоке, а не ответ сервера
    if (len < 10 || len > 1 << 20) throw new Error(`rcon: битый пакет (длина ${len})`);
    if (buf.length - off < len + 4) break;
    packets.push({
      id: buf.readInt32LE(off + 4),
      type: buf.readInt32LE(off + 8),
      body: buf.subarray(off + 12, off + 4 + len - 2).toString("utf8"),
    });
    off += 4 + len;
  }
  return { packets, rest: buf.subarray(off) };
}

/**
 * Один обмен RCON без сокета: авторизация → команда → маркер конца ответа.
 * Длинный ответ приходит несколькими пакетами, и по паузе конец не угадать. Поэтому сразу за командой
 * шлём пустой SERVERDATA_RESPONSE_VALUE: сервер обрабатывает пакеты по порядку и на маркер отвечает
 * пакетом с телом 00 01 00 00 — только после всего ответа на команду.
 * Проверено на CS2 (10/2026): id в ответах ненадёжен — CS2 ставит id последнего прочитанного пакета,
 * поэтому и вывод команды, и ответ на маркер приходят с id маркера. Конец узнаём по телу, а не по id.
 * SRCDS перед 00 01 00 00 присылает ещё пустой пакет — пустое тело ничего не добавляет.
 * Пустой пакет, который SRCDS шлёт перед ответом на авторизацию, пропускаем (CS2 его не шлёт).
 * feed(packet) → { send?: Buffer } | { done: string } | { error: Error } | null
 */
export function rconSession(password, command, ids = { auth: 1, cmd: 2, end: 3 }) {
  let authed = false;
  let out = "";
  let received = false;
  return {
    hello: () => encodePacket(ids.auth, SERVERDATA_AUTH, password),
    get output() {
      return out;
    },
    get received() {
      return received;
    },
    feed(p) {
      if (!authed) {
        if (p.type !== SERVERDATA_AUTH_RESPONSE) return null; // пустой пакет перед ответом на авторизацию
        if (p.id === -1) return { error: new Error("rcon auth failed") };
        if (p.id !== ids.auth) return null;
        authed = true;
        return {
          send: Buffer.concat([
            encodePacket(ids.cmd, SERVERDATA_EXECCOMMAND, command),
            encodePacket(ids.end, SERVERDATA_RESPONSE_VALUE, ""),
          ]),
        };
      }
      if (p.type !== SERVERDATA_RESPONSE_VALUE) return null;
      if (p.body === END_MARKER_REPLY) return { done: out };
      out += p.body;
      received = true;
      return null;
    },
  };
}

/**
 * Выполняет команду через Source RCON. Возвращает текст ответа; нет ответа за timeoutMs — ошибка
 * (раньше молча возвращалась пустая строка, и «нет ответа» путалось с «пустым ответом»).
 * Если сервер не вернул эхо маркера, а ответ на команду уже пришёл, через idleMs тишины берём то, что есть.
 */
export function rcon(port, password, command, { host = "127.0.0.1", timeoutMs = 4000, idleMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    const session = rconSession(password, command);
    let buf = Buffer.alloc(0);
    let idle = null;
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(idle);
      sock.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("rcon timeout")), timeoutMs);
    sock.on("error", (e) => finish(e));
    sock.on("close", () => (session.received ? finish(null, session.output) : finish(new Error("rcon: соединение закрыто без ответа"))));
    sock.on("connect", () => sock.write(session.hello()));
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      let parsed;
      try {
        parsed = takePackets(buf);
      } catch (e) {
        return finish(e);
      }
      buf = parsed.rest;
      for (const p of parsed.packets) {
        const r = session.feed(p);
        if (!r) continue;
        if (r.error) return finish(r.error);
        if (r.done != null) return finish(null, r.done);
        if (r.send) sock.write(r.send);
      }
      if (session.received) {
        clearTimeout(idle);
        idle = setTimeout(() => finish(null, session.output), idleMs);
      }
    });
  });
}

// ───────────────────────── A2S_INFO

/** A2S_INFO: карта и число игроков (включая SourceTV-бота) */
export function a2sInfo(port, { host = "127.0.0.1", timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    const q = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from("Source Engine Query\0")]);
    const done = (v) => {
      clearTimeout(t);
      try {
        s.close();
      } catch {}
      resolve(v);
    };
    const t = setTimeout(() => done(null), timeoutMs);
    s.on("error", () => done(null));
    s.on("message", (m) => {
      if (m[4] === 0x41) return s.send(Buffer.concat([q, m.subarray(5, 9)]), port, host);
      let o = 6;
      const str = () => {
        const e = m.indexOf(0, o);
        const v = m.subarray(o, e).toString();
        o = e + 1;
        return v;
      };
      const name = str();
      const map = str();
      str();
      str();
      o += 2;
      done({ name, map, players: m[o], max: m[o + 1] });
    });
    s.send(q, port, host);
  });
}

// ───────────────────────── разбор ответов

/** JSON из get5_status (перед ним бывает служебный текст); не JSON → null */
export function parseGet5(out) {
  if (out == null) return null;
  const i = out.indexOf("{");
  if (i < 0) return null;
  try {
    return JSON.parse(out.slice(i));
  } catch {
    return null;
  }
}

const STEAM64_BASE = 76561197960265728n;

/**
 * SteamID64 игроков на сервере из ответа status_json / status. Понимает SteamID64, [U:1:N] и STEAM_X:Y:Z.
 * SteamID самого сервера и GOTV в CS2 — другого типа ([A:1:…], 9007…), под эти форматы не попадают.
 */
export function steamIdsFromStatus(text) {
  const ids = new Set();
  if (!text) return ids;
  for (const m of text.matchAll(/(?<!\d)(7656119\d{10})(?!\d)/g)) ids.add(m[1]);
  for (const m of text.matchAll(/\[U:1:(\d+)\]/g)) ids.add(String(STEAM64_BASE + BigInt(m[1])));
  for (const m of text.matchAll(/STEAM_[0-5]:([01]):(\d+)/g)) ids.add(String(STEAM64_BASE + BigInt(m[2]) * 2n + BigInt(m[1])));
  return ids;
}

/**
 * Игроки из status_json CS2 ({ server: { clients: [{ steamid64, steamid, bot, name }] } }).
 * null — ответ не status_json (старый сервер, ошибка): тогда разбираем текст status.
 */
export function steamIdsFromStatusJson(text) {
  if (!text) return null;
  const i = text.indexOf("{");
  if (i < 0) return null;
  let json;
  try {
    json = JSON.parse(text.slice(i));
  } catch {
    return null;
  }
  const clients = json?.server?.clients ?? json?.clients;
  if (!Array.isArray(clients)) return null;
  const ids = new Set();
  for (const c of clients) {
    if (c?.bot) continue;
    for (const id of steamIdsFromStatus(`${c?.steamid64 ?? ""} ${c?.steamid ?? ""}`)) ids.add(id);
  }
  return ids;
}

/** Сколько игроков состава (SteamID из конфига матча) сейчас на сервере */
export function countRosterOnline(rosterIds, onlineIds) {
  let n = 0;
  for (const id of rosterIds) if (onlineIds.has(String(id))) n++;
  return n;
}
