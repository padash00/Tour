// Сетевые помощники агента: Source RCON (TCP) и A2S_INFO (UDP).
import dgram from "node:dgram";
import net from "node:net";

/** Выполняет команду через Source RCON. Возвращает текст ответа. */
export function rcon(port, password, command, { host = "127.0.0.1", timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    const packet = (id, type, body) => {
      const b = Buffer.from(body + "\0\0", "utf8");
      const h = Buffer.alloc(12);
      h.writeInt32LE(8 + b.length, 0);
      h.writeInt32LE(id, 4);
      h.writeInt32LE(type, 8);
      return Buffer.concat([h, b]);
    };
    let buf = Buffer.alloc(0);
    let authed = false;
    let out = "";
    let settle;
    const finish = (err) => {
      clearTimeout(timer);
      clearTimeout(settle);
      sock.destroy();
      if (err) reject(err);
      else resolve(out);
    };
    const timer = setTimeout(() => (authed ? finish() : finish(new Error("rcon timeout"))), timeoutMs);
    sock.on("error", finish);
    sock.on("connect", () => sock.write(packet(1, 3, password)));
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
        const len = buf.readInt32LE(0);
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, 4 + len - 2).toString("utf8");
        buf = buf.subarray(4 + len);
        if (type === 2 && !authed) {
          if (id === -1) return finish(new Error("rcon auth failed"));
          authed = true;
          sock.write(packet(2, 2, command));
        } else if (type === 0) {
          out += body;
          // ответ может прийти несколькими пакетами — ждём короткую паузу
          clearTimeout(settle);
          settle = setTimeout(() => finish(), 300);
        }
      }
    });
  });
}

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
