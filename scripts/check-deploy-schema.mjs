import { readdirSync, readFileSync } from "node:fs";
import { checksum } from "./lib/migrations.mjs";

// Production deploys fail closed if their RPCs/schema have not been installed,
// or if an applied migration file was edited afterwards (same checksum as the migration runner).
// Local and preview builds are pure compilation and need no database access.
if (process.env.VERCEL_ENV === "production") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Production database configuration is missing");
  const response = await fetch(`${url}/rest/v1/_migrations?select=name,checksum`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cannot verify production schema: HTTP ${response.status}`);
  const applied = new Map((await response.json()).map((row) => [row.name, row.checksum ?? null]));
  const files = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  const missing = files.filter((name) => !applied.has(name));
  if (missing.length) throw new Error(`Apply migrations before deploying: ${missing.join(", ")}`);
  // migrations applied before checksums were recorded have none — nothing to compare
  const changed = files.filter((name) => {
    const recorded = applied.get(name);
    return recorded && recorded !== checksum(readFileSync(`supabase/migrations/${name}`, "utf8"));
  });
  if (changed.length) throw new Error(`Applied migrations were edited (checksum mismatch): ${changed.join(", ")}`);
  console.log("Production migration gate passed.");
}
