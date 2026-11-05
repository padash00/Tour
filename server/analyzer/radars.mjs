// Радары карт для страницы «Разбор»: картинка и координаты берутся прямо из файлов игры (pak01_dir.vpk).
//   node radars.mjs [папка игры csgo] [выход]
// Картинка в .vtex_c — BGRA8888, сжатая LZ4 → PNG. Координаты — resource/overviews/<карта>.txt (pos_x, pos_y, scale).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { openVpk } from "./vpk.mjs";

const MAPS = ["de_mirage", "de_inferno", "de_dust2", "de_nuke", "de_ancient", "de_anubis", "de_train", "de_overpass", "de_vertigo"];
const LOWER = { de_nuke: "de_nuke_lower", de_train: "de_train_lower", de_vertigo: "de_vertigo_lower" };

function lz4Block(src, outSize) {
  const out = Buffer.alloc(outSize);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    src.copy(out, o, i, i + lit);
    i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let len = token & 15;
    if (len === 15) { let b; do { b = src[i++]; len += b; } while (b === 255); }
    len += 4;
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** .vtex_c (BGRA8888, LZ4) → { width, height, rgba } */
function decodeVtex(b) {
  const headerSize = b.readUInt32LE(0) <= b.length ? null : null;
  void headerSize;
  const blockOffset = 8 + b.readUInt32LE(8);
  const blockCount = b.readUInt32LE(12);
  let data = -1;
  for (let k = 0, o = blockOffset; k < blockCount; k++, o += 12) if (b.toString("ascii", o, o + 4) === "DATA") data = o + 4 + b.readUInt32LE(o + 4);
  if (data < 0) throw new Error("нет блока DATA");
  const width = b.readUInt16LE(data + 20), height = b.readUInt16LE(data + 22), format = b[data + 26], mips = b[data + 27];
  if (format !== 28) throw new Error(`формат ${format} не поддержан (нужен BGRA8888)`);
  // extra data: тип 4 — размеры сжатых мипов
  const extraOff = data + 32 + b.readUInt32LE(data + 32), extraCount = b.readUInt32LE(data + 36);
  let sizes = null;
  for (let k = 0; k < extraCount; k++) {
    const p = extraOff + k * 12;
    if (b.readUInt32LE(p) !== 4) continue;
    const e = p + 4 + b.readUInt32LE(p + 4);
    const off = e + 4 + b.readUInt32LE(e + 4), count = b.readUInt32LE(e + 8);
    sizes = Array.from({ length: count }, (_, i) => b.readUInt32LE(off + i * 4));
  }
  const fileSize = b.readUInt32LE(0); // данные текстуры идут после заголовка ресурса
  // мипы лежат от самого маленького к самому большому; нам нужен самый большой — последний
  let pos = fileSize;
  if (sizes) for (let m = 0; m < sizes.length - 1; m++) pos += sizes[m];
  const full = width * height * 4;
  const raw = sizes ? lz4Block(b.subarray(pos, pos + sizes[sizes.length - 1]), full) : b.subarray(b.length - full);
  void mips;
  const rgba = Buffer.alloc(full);
  for (let i = 0; i < full; i += 4) { rgba[i] = raw[i + 2]; rgba[i + 1] = raw[i + 1]; rgba[i + 2] = raw[i]; rgba[i + 3] = raw[i + 3]; }
  return { width, height, rgba };
}

function overviewNum(txt, k) {
  const m = new RegExp(`"${k}"[ \\t]+"([^"]+)"`).exec(txt);
  return m ? Number(m[1]) : null;
}

function overview(txt) {
  const g = (k) => { const m = new RegExp(`"${k}"\\s+"([^"]+)"`).exec(txt); return m ? Number(m[1]) : null; };
  return { pos_x: g("pos_x"), pos_y: g("pos_y"), scale: g("scale"), lower_z: g("verticalsections") };
}

const csgo = process.argv[2] ?? "D:/cs2server/game/csgo";
const outDir = process.argv[3] ?? path.resolve("radars");
mkdirSync(outDir, { recursive: true });
const vpk = openVpk(path.join(csgo, "pak01_dir.vpk"));
const meta = {};
for (const m of MAPS) {
  const txt = vpk.read(`resource/overviews/${m}.txt`);
  const img = vpk.read(`panorama/images/overheadmaps/${m}_radar_psd.vtex_c`);
  if (!txt || !img) { console.log(`${m}: нет в игре`); continue; }
  const ov = overview(txt.toString());
  // нижний уровень (Nuke, Train, Vertigo): граница по высоте из overview
  const zm = /"AltitudeMax"\s+"(-?[\d.]+)"[\s\S]*?"AltitudeMin"\s+"(-?[\d.]+)"/i.exec(txt.toString());
  const lowerTxt = txt.toString().match(/"lower"[\s\S]*?"AltitudeMax"\s+"(-?[\d.]+)"/i);
  const { width, height, rgba } = decodeVtex(img);
  writeFileSync(path.join(outDir, `${m}.png`), png(width, height, rgba));
  const g = (k) => overviewNum(txt.toString(), k);
  // точки закладки (доля от картинки) — по ним страница подписывает плент буквой A/B
  const entry = { pos_x: ov.pos_x, pos_y: ov.pos_y, scale: ov.scale, size: width, bombA: [g("bombA_x"), g("bombA_y")], bombB: [g("bombB_x"), g("bombB_y")] };
  if (LOWER[m]) {
    const li = vpk.read(`panorama/images/overheadmaps/${LOWER[m]}_radar_psd.vtex_c`);
    if (li) {
      const l = decodeVtex(li);
      writeFileSync(path.join(outDir, `${LOWER[m]}.png`), png(l.width, l.height, l.rgba));
      entry.lower = { image: `${LOWER[m]}.png`, below_z: lowerTxt ? Number(lowerTxt[1]) : null };
    }
  }
  void zm;
  meta[m] = entry;
  console.log(`${m}: ${width}×${height}, pos ${ov.pos_x},${ov.pos_y} scale ${ov.scale}${entry.lower ? `, нижний уровень до z ${entry.lower.below_z}` : ""}`);
}
writeFileSync(path.join(outDir, "maps.json"), JSON.stringify(meta, null, 2));
