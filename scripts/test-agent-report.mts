import assert from "node:assert/strict";
import { agentReportSchema } from "../src/lib/server/agent-report";
import { registrationError } from "../src/lib/registration-errors";

assert.equal(agentReportSchema.safeParse(null).success, false);
assert.equal(agentReportSchema.safeParse({ instances: [{ name: "CS2-01", running: "false" }] }).success, false);
assert.equal(agentReportSchema.safeParse({ instances: [{ name: "unknown", running: true }] }).success, false);
assert.equal(agentReportSchema.safeParse({ protocol: 2, instances: [{ name: "CS2-01", running: false }] }).success, true);
for (const id of [42, "42", -1, "-1", null]) {
  const parsed = agentReportSchema.parse({ instances: [{ name: "CS2-01", running: true, get5: { matchid: id } }] });
  assert.equal(parsed.instances?.[0].get5?.matchid, id === 42 || id === "42" ? 42 : null);
}
assert.match(registrationError({ code: "23505", message: "private SQL details" }), /Прежний состав сохранён/);
assert.match(registrationError({ message: "tournament_full" }), /места/);
console.log("✓ Agent protocol validates malformed reports and accepts legacy MatchZy IDs");
console.log("✓ Registration errors explain conflicts without leaking SQL details");
