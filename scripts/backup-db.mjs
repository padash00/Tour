// Резервная копия базы перед турниром: все таблицы public → JSON-файлы (по таблице на файл).
// Дополняет ежедневные бэкапы Supabase снимком «на сейчас», который лежит у нас на диске.
//
//   node scripts/backup-db.mjs [папка]     по умолчанию D:\f16-backups\<дата_время>
//
// Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (берутся из .env.local). Только чтение.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const envFile = path.join(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Almaty" }).replace(/[: ]/g, "-").slice(0, 16);
const out = process.argv[2] ?? path.join("D:\\f16-backups", stamp);
mkdirSync(out, { recursive: true });

// список таблиц — из OpenAPI-описания PostgREST
const spec = await (await fetch(`${url}/rest/v1/`, { headers })).json();
const tables = Object.keys(spec.definitions ?? {}).sort();
if (!tables.length) {
  console.error("PostgREST не вернул список таблиц");
  process.exit(1);
}

const PAGE = 1000;
let total = 0;
const failed = [];
for (const table of tables) {
  const rows = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
        headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    writeFileSync(path.join(out, `${table}.json`), JSON.stringify(rows));
    total += rows.length;
    console.log(`${table}: ${rows.length}`);
  } catch (e) {
    failed.push(`${table} (${e.message})`);
    console.error(`${table}: ошибка — ${e.message}`);
  }
}
writeFileSync(path.join(out, "_info.json"), JSON.stringify({ at: new Date().toISOString(), url, tables: tables.length, rows: total, failed }, null, 2));
console.log(`\nГотово: ${tables.length - failed.length}/${tables.length} таблиц, ${total} строк → ${out}`);
if (failed.length) process.exit(2);
