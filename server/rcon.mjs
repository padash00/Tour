// RCON-клиент для проверки инстансов: node server/rcon.mjs 27015 "css_plugins list"
import net from "node:net";
import { readFileSync } from "node:fs";
const pass = JSON.parse(readFileSync("D:/cs2server/f16-secrets.json", "utf8").replace(/^\uFEFF/, "")).rcon;
const [port, ...cmds] = process.argv.slice(2);
const pkt = (id, type, body) => { const b = Buffer.from(body + "\0\0", "utf8"); const h = Buffer.alloc(12); h.writeInt32LE(8 + b.length, 0); h.writeInt32LE(id, 4); h.writeInt32LE(type, 8); return Buffer.concat([h, b]); };
const sock = net.connect(Number(port), "127.0.0.1");
let buf = Buffer.alloc(0), step = 0, out = "";
sock.on("connect", () => sock.write(pkt(1, 3, pass)));
sock.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
    const len = buf.readInt32LE(0), id = buf.readInt32LE(4), type = buf.readInt32LE(8);
    const body = buf.subarray(12, 4 + len - 2).toString(); buf = buf.subarray(4 + len);
    if (type === 2 && step === 0) { if (id === -1) { console.log("auth failed"); process.exit(1); } step = 1; cmds.forEach((c, i) => sock.write(pkt(10 + i, 2, c))); }
    else if (type === 0) out += body;
  }
});
setTimeout(() => { console.log(out); sock.end(); process.exit(0); }, 2500);
