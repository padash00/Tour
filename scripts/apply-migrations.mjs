// Применяет новые миграции из supabase/migrations через Supabase Management API
// и сохраняет ключи проекта в .env.local (файл в .gitignore).
// Запуск: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs
//         node scripts/apply-migrations.mjs --ci   (в сборке Vercel: только миграции; без токена — пропуск)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const REF = process.env.SUPABASE_PROJECT_REF ?? "dgpxlpjnjthyotjcccfl";
const CI = process.argv.includes("--ci");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  if (CI) {
    console.log("migrations: SUPABASE_ACCESS_TOKEN не задан — пропускаю");
    process.exit(0);
  }
  console.error("Нет SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const api = (path, init) => fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { headers, ...init });

const query = async (sql) => {
  const r = await api("/database/query", { method: "POST", body: JSON.stringify({ query: sql }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  return JSON.parse(text);
};
const esc = (s) => s.replace(/'/g, "''");

const [{ has_migrations, has_players }] = await query(`
  select exists(select 1 from information_schema.tables where table_schema='public' and table_name='_migrations') as has_migrations,
         exists(select 1 from information_schema.tables where table_schema='public' and table_name='players') as has_players`);

const applied = new Set(
  has_migrations ? (await query("select name from _migrations")).map((r) => r.name) : [],
);
// первая миграция применялась до появления учёта
if (!has_migrations && has_players) applied.add("20261001000000_core.sql");

const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  if (applied.has(file)) continue;
  await query(readFileSync(`supabase/migrations/${file}`, "utf8"));
  console.log("✓ применена", file);
}
// записываем всё, что применено
await query("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
await query(
  `insert into _migrations(name) values ${files.map((f) => `('${esc(f)}')`).join(",")} on conflict do nothing`,
);

if (CI) {
  console.log("migrations: ok");
  process.exit(0);
}

const tables = await query("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log("Таблицы:", tables.map((t) => t.table_name).join(", "));

const keys = await (await api("/api-keys?reveal=true")).json();
const secret =
  keys.find((k) => k.type === "secret" && k.api_key)?.api_key ??
  keys.find((k) => k.name === "service_role")?.api_key;
if (!secret) {
  console.error("Не нашёл service_role / secret ключ");
  process.exit(1);
}

const lines = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean) : [];
const set = (k, v) => {
  const i = lines.findIndex((l) => l.startsWith(`${k}=`));
  if (i >= 0) lines[i] = `${k}=${v}`;
  else lines.push(`${k}=${v}`);
};
set("SUPABASE_URL", `https://${REF}.supabase.co`);
set("SUPABASE_SERVICE_ROLE_KEY", secret);
writeFileSync(".env.local", lines.join("\n") + "\n");
console.log("✓ ключи в .env.local актуальны");
