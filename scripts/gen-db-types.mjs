// Регенерирует src/lib/database.types.ts — TypeScript-типы схемы public из Supabase Management API.
// Только чтение схемы, база не меняется. Запускать после применения миграций (npm run db:migrate):
//   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> npm run db:types
// Токен — personal access token Supabase (https://supabase.com/dashboard/account/tokens).
import { writeFileSync } from "node:fs";

const OUT = "src/lib/database.types.ts";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !/^[a-z0-9]+$/.test(ref) || !token) {
  console.error("Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN for the database whose schema to read.");
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
  console.error(`Type generation request failed: HTTP ${response.status} ${await response.text().catch(() => "")}`);
  process.exit(1);
}
const { types } = await response.json();
if (typeof types !== "string" || !types.includes("export type Database")) {
  console.error("Unexpected response: no `types` string with `export type Database`.");
  process.exit(1);
}
writeFileSync(OUT, types.endsWith("\n") ? types : `${types}\n`);
console.log(`Wrote ${OUT} (${types.length} bytes). Run npm run check to see what the schema change broke.`);
