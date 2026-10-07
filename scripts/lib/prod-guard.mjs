// e2e/smoke scripts read .env.local and write (or read) through the service-role key. By default they
// refuse a hosted Supabase project — the only hosted project is production. Local stacks
// (localhost/127.0.0.1) are always allowed. Running against production on purpose: E2E_ALLOW_PROD=1.
export function assertTestDatabase(url) {
  let host;
  try { host = new URL(url).hostname; } catch { host = null; }
  if (!host) {
    console.error("SUPABASE_URL is missing or invalid.");
    process.exit(1);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (local || process.env.E2E_ALLOW_PROD === "1") return;
  console.error(`Refusing to run against ${host}: test data would be written to the production database.\n` +
    "Point SUPABASE_URL at a local or test project, or set E2E_ALLOW_PROD=1 to run against production on purpose.");
  process.exit(1);
}
