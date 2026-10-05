import { readdirSync } from "node:fs";

// Production deploys fail closed if their RPCs/schema have not been installed.
// Local and preview builds are pure compilation and need no database access.
if (process.env.VERCEL_ENV === "production") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Production database configuration is missing");
  const response = await fetch(`${url}/rest/v1/_migrations?select=name`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cannot verify production schema: HTTP ${response.status}`);
  const applied = new Set((await response.json()).map((row) => row.name));
  const missing = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql") && !applied.has(name));
  if (missing.length) throw new Error(`Apply migrations before deploying: ${missing.join(", ")}`);
  console.log("Production migration gate passed.");
}
