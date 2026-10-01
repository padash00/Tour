// Применяет миграции из supabase/migrations через Supabase Management API
// и сохраняет ключи проекта в .env.local (файл в .gitignore).
// Запуск: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const REF = "dgpxlpjnjthyotjcccfl";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
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

const [{ exists }] = await query(
  "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='players') as exists",
);

if (exists) {
  console.log("Таблицы уже есть — миграцию пропускаю");
} else {
  for (const file of readdirSync("supabase/migrations").sort()) {
    await query(readFileSync(`supabase/migrations/${file}`, "utf8"));
    console.log("✓ применена", file);
  }
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
console.log("✓ ключи сохранены в .env.local");
