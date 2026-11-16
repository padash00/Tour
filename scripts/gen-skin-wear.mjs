// Собирает public/skins/wear/<defindex>.json — картинки скина по износу (чистый / поношенный / закалённый в боях)
// для окна выбора в разделе «Скины»: картинка меняется вместе с ползунком float.
// Источник — открытый каталог ByMykel/CSGO-API (skins_not_grouped.json, ~32 МБ, в репозиторий не кладём):
//   curl -L -o ng.json https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json
//   node scripts/gen-skin-wear.mjs ng.json
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/gen-skin-wear.mjs <skins_not_grouped.json>");
  process.exit(1);
}
const BASE = "https://community.akamai.steamstatic.com/economy/image/";
// пять названий износа → три разные картинки: FN и MW совпадают, FT и WW совпадают
const SLOT = { "Factory New": 0, "Minimal Wear": 0, "Field-Tested": 1, "Well-Worn": 1, "Battle-Scarred": 2 };

const byWeapon = new Map();
for (const s of JSON.parse(readFileSync(src, "utf8"))) {
  const d = Number(s.weapon?.weapon_id);
  const p = Number(s.paint_index);
  const slot = SLOT[s.wear?.name];
  if (!d || !p || slot === undefined || typeof s.image !== "string" || !s.image.startsWith(BASE)) continue;
  if (!byWeapon.has(d)) byWeapon.set(d, new Map());
  const paints = byWeapon.get(d);
  if (!paints.has(p)) paints.set(p, [null, null, null]);
  paints.get(p)[slot] ??= s.image.slice(BASE.length);
}

rmSync("public/skins/wear", { recursive: true, force: true });
mkdirSync("public/skins/wear", { recursive: true });
let files = 0, paintsTotal = 0, bytes = 0;
for (const [d, paints] of byWeapon) {
  const out = {};
  for (const [p, v] of paints) {
    // скин выпадает не во всех износах — недостающую картинку берём у ближайшего
    const fill = [v[0] ?? v[1] ?? v[2], v[1] ?? v[0] ?? v[2], v[2] ?? v[1] ?? v[0]];
    if (!fill[0]) continue;
    out[p] = fill[0] === fill[1] && fill[1] === fill[2] ? [fill[0]] : fill;
    paintsTotal++;
  }
  const json = JSON.stringify({ base: BASE, paints: out });
  writeFileSync(`public/skins/wear/${d}.json`, json);
  files++;
  bytes += json.length;
}
console.log(`weapons ${files}, paints ${paintsTotal}, ${(bytes / 1024).toFixed(0)} KB`);
