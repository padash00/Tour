// Проверка казахского словаря: какие тексты обёрнуты в t(...)/tr(...), но не переведены, и какие переводы больше не нужны.
// Запуск: node scripts/i18n-check.mjs [--missing] [--unused]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "i18n") walk(p); }
    else if (/\.(tsx?|mjs)$/.test(e.name)) files.push(p);
  }
})(path.join(root, "src"));

// строка в двойных, одинарных или обратных кавычках (без ${...})
const STR = "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\$]|\\\\.)*`)";
const res = [
  // переводчик называется t, а где t уже занято (турнир и т. п.) — tx
  new RegExp(String.raw`\btx?(?:\.rich)?\(\s*` + STR, "g"),
  new RegExp(String.raw`\btr\(\s*` + STR, "g"),
  new RegExp(String.raw`\btx?\.plural\([^,]+,\s*` + STR, "g"),
];
const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const re of res) for (const m of src.matchAll(re)) {
    const raw = m[1];
    let s;
    try { s = raw[0] === "`" ? raw.slice(1, -1) : JSON.parse(raw[0] === "'" ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw); } catch { continue; }
    if (!/[А-Яа-яЁё]/.test(s)) continue;
    if (!used.has(s)) used.set(s, path.relative(root, f));
  }
}

const dict = {};
const dir = path.join(root, "src", "i18n", "kk");
for (const f of fs.readdirSync(dir)) {
  if (f === "index.ts") continue;
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of src.matchAll(new RegExp(STR + String.raw`\s*:\s*` + STR, "g"))) {
    try { dict[JSON.parse(m[1])] = f; } catch { /* ключ в одинарных кавычках — пропуск */ }
  }
}

const missing = [...used].filter(([s]) => !(s in dict));
const unused = Object.keys(dict).filter((s) => !used.has(s));
const all = !process.argv.includes("--missing") && !process.argv.includes("--unused");
console.log(`обёрнуто текстов: ${used.size}, в словаре: ${Object.keys(dict).length}, без перевода: ${missing.length}, лишних: ${unused.length}`);
if (all || process.argv.includes("--missing")) for (const [s, f] of missing) console.log(`  нет перевода  ${f}: ${JSON.stringify(s)}`);
if (process.argv.includes("--unused")) for (const s of unused) console.log(`  не используется (${dict[s]}): ${JSON.stringify(s)}`);
process.exitCode = missing.length ? 1 : 0;
