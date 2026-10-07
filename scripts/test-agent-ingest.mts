// Подпись адреса HTTP-лога CS2: токен в адрес не попадает, подпись годится только для своего матча.
import assert from "node:assert/strict";
import { logSignature, signedLogQuery, verifyLogSignature } from "../src/lib/server/ingest-signature";
import { agentReportSchema } from "../src/lib/server/agent-report";

const token = "matchzy-secret-token";
const sig = logSignature(42, token);
assert.match(sig, /^[0-9a-f]{64}$/);
assert.equal(verifyLogSignature("42", sig, token), true);
assert.equal(verifyLogSignature(43, sig, token), false, "signature of another match");
assert.equal(verifyLogSignature(42, sig, "other-token"), false, "signature made with another token");
assert.equal(verifyLogSignature(42, sig.slice(0, 63), token), false, "truncated signature");
assert.equal(verifyLogSignature(42, `${sig.slice(0, 63)}x`, token), false, "non-hex signature");
assert.equal(verifyLogSignature(42, sig, ""), false, "no token configured");
assert.equal(verifyLogSignature(42, sig.toUpperCase(), token), true);
const query = signedLogQuery(42, token);
assert.equal(query, `m=42&sig=${sig}`);
assert.ok(!query.includes(token), "the raw token never appears in the URL");
console.log("✓ CS2 log URL carries a per-match HMAC signature instead of the token");

// события агента с id — сайт возвращает обработанные id, агент удаляет только их
const report = agentReportSchema.parse({
  protocol: 3,
  events: [{ type: "recovered", instance: "CS2-01", matchzy_id: 7, at: "2026-10-07T10:00:00.000Z", id: "5b0c6f0e-1111-2222-3333-444444444444" }],
});
assert.equal(report.events?.[0].id, "5b0c6f0e-1111-2222-3333-444444444444");
assert.equal(agentReportSchema.safeParse({ instances: [{ name: "CS2-01", running: true, get5: { gamestate: "maintenance", matchid: null } }] }).success, true);
console.log("✓ Agent events keep their id; a prefetching instance reports the maintenance state");
