// Печатает SQL для применения одной миграции вручную — тем же способом, что и npm run db:migrate
// (одна транзакция, запись в public._migrations с контрольной суммой, повторный запуск безопасен).
// Нужен, когда база стоит на своём сервере и Management API Supabase до неё не достаёт:
//   node scripts/migration-sql.mjs 20261125000000_lobby_round_log.sql | ssh cloud-001 "docker exec -i tour-db psql -U postgres -v ON_ERROR_STOP=1"
import { readFileSync } from "node:fs";
import { migrationTransaction } from "./lib/migrations.mjs";

const name = process.argv[2];
if (!name || !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) {
  console.error("Usage: node scripts/migration-sql.mjs <file name from supabase/migrations>");
  process.exit(1);
}
process.stdout.write(migrationTransaction({ name, sql: readFileSync(`supabase/migrations/${name}`, "utf8") }) + "\n");
