import { NextResponse, type NextRequest } from "next/server";
import { checkBearer } from "@/lib/server-control";
import { runAgentJobs, type AgentJobLane } from "@/lib/server/agent-jobs";
import { db } from "@/lib/supabase";
import { logSiteError } from "@/lib/site-errors";
import type { SyncMetrics } from "@/lib/server/agent-report";

export const maxDuration = 60;

const LEASE_MS = 75_000; // longer than the function's maximum runtime
const RELEASED = "1970-01-01T00:00:00.000Z";

/** DB compare-and-set prevents two agent processes from running the same lane concurrently. */
async function claimLane(lane: AgentJobLane) {
  const key = `AGENT_${lane.toUpperCase()}_LEASE`;
  await db().from("app_settings").upsert({ key, value: RELEASED }, { onConflict: "key", ignoreDuplicates: true }).throwOnError();
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const { data } = await db().from("app_settings")
    .update({ value: until, updated_at: new Date().toISOString() })
    .eq("key", key).lt("value", new Date().toISOString()).select("key").throwOnError();
  return data?.length ? { key, until } : null;
}

export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let lane: AgentJobLane;
  try {
    const body = await request.json();
    if (body?.lane !== "dispatch" && body?.lane !== "maintenance") throw new Error("invalid lane");
    lane = body.lane;
  } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const lease = await claimLane(lane);
  if (!lease) return NextResponse.json({ skipped: true });
  const started = performance.now();
  const metrics: SyncMetrics = { at: new Date().toISOString(), duration_ms: 0, phases: [] };
  try {
    let patch: unknown = null;
    if (lane === "maintenance") {
      const { data } = await db().from("server_host").select("info").eq("id", "main").maybeSingle();
      patch = (data?.info as { cs2_patch?: unknown } | null)?.cs2_patch;
    }
    await runAgentJobs(lane, async (name, job) => {
      const start = performance.now();
      let ok = true;
      try { await job(); }
      catch (error) {
        ok = false;
        console.error(`Agent ${lane}: ${name} failed`, error);
        await logSiteError({ source: "server", message: `Agent ${lane}: ${name}`, path: "/api/agent/jobs", kind: "background_job" }).catch(() => {});
      }
      metrics.phases.push({ name, ms: Math.round(performance.now() - start), ok });
    }, patch);
    metrics.duration_ms = Math.round(performance.now() - started);
    const { error } = await db().from("app_settings").upsert({
      key: `AGENT_${lane.toUpperCase()}_METRICS`, value: JSON.stringify(metrics), updated_at: metrics.at,
    });
    if (error) console.error(`Agent ${lane} metrics could not be saved`, error.code);
    return NextResponse.json({ ok: true });
  } finally {
    // Conditional release cannot free a newer lease if this request finished late.
    await db().from("app_settings").update({ value: RELEASED }).eq("key", lease.key).eq("value", lease.until);
  }
}
