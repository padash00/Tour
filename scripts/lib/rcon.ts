// RCON до игрового сервера на этом ПК (тот же протокол, что server/rcon.mjs): пароль из D:/cs2server/f16-secrets.json,
// порт инстанса — из D:/cs2server/f16/instances.csv. Нужен прогону с ботами (demo play --servers --bots).
import { readFileSync } from "node:fs";
import net from "node:net";

const SECRETS = "D:/cs2server/f16-secrets.json";
const INSTANCES = "D:/cs2server/f16/instances.csv";

const password = () => JSON.parse(readFileSync(SECRETS, "utf8").replace(/^\uFEFF/, "")).rcon as string;

/** Порт инстанса по имени (CS2-01 → 27015) */
export function instancePort(name: string): number {
  const row = readFileSync(INSTANCES, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.split(","))
    .find((c) => c[0] === name);
  if (!row) throw new Error(`Инстанса ${name} нет в ${INSTANCES}`);
  return Number(row[1]);
}

const packet = (id: number, type: number, body: string) => {
  const b = Buffer.from(body + "\0\0", "utf8");
  const h = Buffer.alloc(12);
  h.writeInt32LE(8 + b.length, 0);
  h.writeInt32LE(id, 4);
  h.writeInt32LE(type, 8);
  return Buffer.concat([h, b]);
};

const FIRST_MS = 2000; // ответа нет вовсе — команда без вывода
const QUIET_MS = 400;

/** Выполняет команду и возвращает ответ сервера (весь вывод до паузы в 400 мс). */
export function rcon(port: number, command: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0);
    let out = "";
    let authed = false;
    let quiet: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      sock.destroy();
      if (authed) resolve(out);
      else reject(new Error(`RCON ${port}: нет ответа`));
    }, timeoutMs);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      clearTimeout(quiet);
      sock.end();
      fn();
    };
    sock.on("error", (e) => done(() => reject(e)));
    sock.on("connect", () => sock.write(packet(1, 3, password())));
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
        const len = buf.readInt32LE(0);
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.subarray(12, 4 + len - 2).toString();
        buf = buf.subarray(4 + len);
        if (type === 2 && !authed) {
          if (id === -1) return done(() => reject(new Error(`RCON ${port}: неверный пароль`)));
          authed = true;
          sock.write(packet(10, 2, command));
          quiet = setTimeout(() => done(() => resolve(out)), FIRST_MS);
        } else if (type === 0 && id === 10) {
          // ответ плагина (MatchZy) приходит отдельными пакетами и позже эха — ждём паузу после последнего
          out += body;
          clearTimeout(quiet);
          quiet = setTimeout(() => done(() => resolve(out)), QUIET_MS);
        }
      }
    });
  });
}
