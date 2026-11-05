// Мини-чтение VPK v2 (архивы Source 2): список файлов и извлечение. Только чтение файлов игры.
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";

export function openVpk(dirFile) {
  const buf = readFileSync(dirFile);
  if (buf.readUInt32LE(0) !== 0x55aa1234) throw new Error("не VPK");
  const version = buf.readUInt32LE(4);
  const treeSize = buf.readUInt32LE(8);
  const headerSize = version === 2 ? 28 : 12;
  let o = headerSize;
  const str = () => {
    const end = buf.indexOf(0, o);
    const s = buf.toString("utf8", o, end);
    o = end + 1;
    return s;
  };
  const files = new Map();
  for (;;) {
    const ext = str();
    if (!ext) break;
    for (;;) {
      const dir = str();
      if (!dir) break;
      for (;;) {
        const name = str();
        if (!name) break;
        const preload = buf.readUInt16LE(o + 4);
        const archive = buf.readUInt16LE(o + 6);
        const offset = buf.readUInt32LE(o + 8);
        const length = buf.readUInt32LE(o + 12);
        o += 18;
        const pre = buf.subarray(o, o + preload);
        o += preload;
        const full = `${dir === " " ? "" : dir + "/"}${name}.${ext}`;
        files.set(full, { archive, offset, length, pre });
      }
    }
  }
  const dataStart = headerSize + treeSize;
  const base = dirFile.replace(/_dir\.vpk$/, "");
  return {
    files,
    read(name) {
      const e = files.get(name);
      if (!e) return null;
      if (!e.length) return Buffer.from(e.pre);
      const archFile = e.archive === 0x7fff ? dirFile : `${base}_${String(e.archive).padStart(3, "0")}.vpk`;
      const off = e.archive === 0x7fff ? dataStart + e.offset : e.offset;
      const fd = openSync(archFile, "r");
      const out = Buffer.alloc(e.length);
      readSync(fd, out, 0, e.length, off);
      closeSync(fd);
      return Buffer.concat([e.pre, out]);
    },
  };
}

if (process.argv[1]?.endsWith("vpk.mjs")) {
  const v = openVpk(process.argv[2] ?? "D:/cs2server/game/csgo/pak01_dir.vpk");
  const re = new RegExp(process.argv[3] ?? "overview", "i");
  for (const f of v.files.keys()) if (re.test(f)) console.log(f, v.files.get(f).length);
  void path;
}
