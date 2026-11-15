// Собирает public/skins/catalog.json — компактный каталог скинов для раздела «Скины» на сайте.
// Источник — данные плагина WeaponPaints на серверном ПК (addons/counterstrikesharp/plugins/WeaponPaints/data).
// Запускать после обновления плагина: node scripts/gen-skin-catalog.mjs "D:\cs2server\game\csgo\addons\counterstrikesharp\plugins\WeaponPaints\data"
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/gen-skin-catalog.mjs <WeaponPaints data dir>");
  process.exit(1);
}
const read = (name) => JSON.parse(readFileSync(path.join(dir, name), "utf8").replace(/^\uFEFF/, ""));
const GROUPS = {
  pistol: [1, 2, 3, 4, 30, 32, 36, 61, 63, 64],
  smg: [17, 19, 23, 24, 26, 33, 34],
  rifle: [7, 8, 10, 13, 16, 60, 39],
  sniper: [9, 11, 38, 40],
  heavy: [14, 25, 27, 28, 29, 35],
};
const groupOf = (d, name) => (name.includes("knife") || name.includes("bayonet") ? "knife" : Object.entries(GROUPS).find(([, ids]) => ids.includes(d))?.[0] ?? "other");
const split = (s) => {
  const i = s.indexOf("|");
  return i < 0 ? [s.trim(), ""] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
};
const stem = (url) => (url.match(/\/([^/]+?)(?:-\d+)?\.png$/)?.[1] ?? "");

const weapons = new Map();
for (const s of read("skins_ru.json")) {
  const d = Number(s.weapon_defindex);
  const [name, paint] = split(String(s.paint_name).replace(/^★\s*/, ""));
  if (!weapons.has(d)) weapons.set(d, { d, w: s.weapon_name, name, g: groupOf(d, s.weapon_name), paints: [] });
  if (Number(s.paint) > 0) weapons.get(d).paints.push([Number(s.paint), paint]);
}
const gloves = new Map();
for (const s of read("gloves_ru.json")) {
  const d = Number(s.weapon_defindex);
  if (!d) continue;
  const [name, paint] = split(String(s.paint_name).replace(/^★\s*/, ""));
  if (!gloves.has(d)) gloves.set(d, { d, name, paints: [] });
  gloves.get(d).paints.push([Number(s.paint), paint, stem(s.image)]);
}
const order = ["rifle", "sniper", "pistol", "smg", "heavy", "knife", "other"];
const out = {
  img: "https://raw.githubusercontent.com/Nereziel/cs2-WeaponPaints/main/website/img/skins/",
  weapons: [...weapons.values()].sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g) || a.name.localeCompare(b.name, "ru")),
  gloves: [...gloves.values()],
};
for (const w of out.weapons) w.paints.sort((a, b) => a[1].localeCompare(b[1], "ru"));
writeFileSync("public/skins/catalog.json", JSON.stringify(out));
const count = (g) => out.weapons.filter((w) => w.g === g).length;
console.log(`weapons ${out.weapons.length} (${order.map((g) => `${g} ${count(g)}`).join(", ")}), paints ${out.weapons.reduce((a, w) => a + w.paints.length, 0)}, gloves ${out.gloves.length}/${out.gloves.reduce((a, w) => a + w.paints.length, 0)}`);
