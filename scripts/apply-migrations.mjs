// Explicit release step. Building/previewing the website never mutates a database.
// --check only reads migration history and fails if schema changes are pending.
import { readdirSync, readFileSync } from "node:fs";
import { migrationPlan, migrationTransaction } from "./lib/migrations.mjs";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !/^[a-z0-9]+$/.test(ref) || !token) {
  console.error("Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN for the intended database.");
  process.exit(1);
}
const query = async (sql) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Database migration request failed: HTTP ${response.status}`);
  return response.json();
};
const files = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: readFileSync(`supabase/migrations/${name}`, "utf8") }));
const [schema] = await query(`select to_regclass('public._migrations') is not null as history,
  to_regclass('public.players') is not null as players,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='_migrations' and column_name='checksum') as checksums`);
if (!schema.history && schema.players) throw new Error("Existing database has no migration history. Reconcile its schema before applying migrations.");
const applied = schema.history ? await query(`select name, ${schema.checksums ? "checksum" : "null::text as checksum"} from public._migrations`) : [];
const pending = migrationPlan(files, applied);
if (process.argv.includes("--check")) {
  if (pending.length) {
    console.error("Pending migrations:", pending.map((file) => file.name).join(", "));
    process.exit(1);
  }
  console.log("Schema matches repository migration history.");
} else {
  for (const file of pending) {
    await query(migrationTransaction(file));
    console.log("Applied:", file.name);
  }
  console.log(`Migrations complete: ${pending.length}.`);
}
