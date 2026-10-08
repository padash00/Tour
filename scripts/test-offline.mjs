import { spawnSync } from "node:child_process";

// Tests listed here must never load .env.local or contact a live database.
const env = { ...process.env, SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "offline-test", SESSION_SECRET: "offline-only-session-secret" };
const cases = [
  "test-bracket-sizes.mts", "test-stage-formats.mts", "test-awards.mts", "test-lobby-settings.mts",
  "test-agent-relay.mjs", "test-agent-relay-park.mjs", "test-agent-units.mjs", "test-reliability.mjs", "test-agent-report.mts", "test-agent-ingest.mts", "test-deployment-gate.mjs",
  "test-pure-logic.mts", "test-integrity.mts", "test-tournament-structure.mts", "test-official-logic.mts", "test-official-db.mts", "test-demo-tournament.mts", "test-overlay.mts",
];
for (const name of cases) {
  const args = name.endsWith(".mts") ? ["--conditions=react-server", "--import=tsx", `scripts/${name}`] : [`scripts/${name}`];
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
