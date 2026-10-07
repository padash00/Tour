// Isolated in-memory PostgreSQL (PGlite) with repository migrations applied through the
// production migration runner. Never reads .env or contacts a real database.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { migrationTransaction } from "./migrations.mjs";

const migrationNames = () => readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort();

/** Applies pending migrations; `before` stops at that file (to seed data an older schema allowed). */
export async function applyMigrations(sql, { before } = {}) {
  for (const name of migrationNames()) {
    if (before && name >= before) break;
    try { await sql.exec(migrationTransaction({ name, sql: readFileSync(`supabase/migrations/${name}`, "utf8") })); }
    catch (e) { throw new Error(`Migration ${name}: ${e.message}`, { cause: e }); }
  }
}

export async function migratedDatabase(options = {}) {
  const sql = new PGlite({ extensions: { citext } });
  await sql.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await applyMigrations(sql, options);
  return sql;
}
