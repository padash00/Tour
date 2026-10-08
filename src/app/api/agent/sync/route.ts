import { NextResponse, type NextRequest } from "next/server";
import { getAgentBundle } from "@/lib/agent-bundle";
import { adminPlayers } from "@/lib/server/admins";
import { applyAgentReport, takePendingCommands } from "@/lib/server/agent-sync";
import { applyAgentEvents } from "@/lib/server/ops";
import { checkBearer } from "@/lib/server/state";
import { getSetting, isServerOpenJoin } from "@/lib/settings";
import { runAgentJobs } from "@/lib/server/agent-jobs";
import { agentReportSchema, type SyncMetrics } from "@/lib/server/agent-report";
import { db } from "@/lib/supabase";
import { logSiteError } from "@/lib/site-errors";

export const maxDuration = 60;

/** F16 Server Agent раз в несколько секунд присылает состояние хоста и инстансов, в ответ получает команды. */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = performance.now();
  const metrics: SyncMetrics = { at: new Date().toISOString(), duration_ms: 0, phases: [] };
  // Keep failures visible while allowing independent maintenance jobs to proceed.
  async function safely(name: string, job: () => Promise<unknown>) {
    const start = performance.now();
    let ok = true;
    try { await job(); }
    catch (e) {
      ok = false;
      console.error(`${name} failed`, e);
      await logSiteError({ source: "server", message: `Agent sync: ${name}`, path: "/api/agent/sync", kind: "background_job" }).catch(() => {});
    }
    metrics.phases.push({ name, ms: Math.round(performance.now() - start), ok });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 512_000) return NextResponse.json({ error: "report too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const parsed = agentReportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid agent report" }, { status: 400 });
  const report = parsed.data;
  // Сбой записи отчёта не должен оставить агента без команд: команды выдаются всегда.
  await safely("agent report", () => applyAgentReport(report));
  let processedEvents: string[] = [];
  await safely("agent events", async () => { processedEvents = await applyAgentEvents(report.events); });
  // Старый агент не вызывает /api/agent/jobs. Пока он не самообновится, сохраняем прежнее поведение.
  if ((report.protocol ?? 1) < 3) {
    await runAgentJobs("dispatch", safely, report.info?.cs2_patch);
    await runAgentJobs("maintenance", safely, report.info?.cs2_patch);
  }
  // агент сравнит версию и сам скачает новый код/конфиги с /api/agent/bundle
  const [admins, retention, openJoin] = await Promise.all([
    adminPlayers().then((a) => a.map((x) => x.steam_id)).catch(() => null),
    getSetting("BACKUP_RETENTION_DAYS").catch(() => null),
    isServerOpenJoin().catch(() => true),
  ]);
  // срок хранения бэкапов и демо на серверном ПК (дней), по умолчанию 1
  const days = Number(retention ?? "");
  const backup_days = Number.isFinite(days) && days >= 1 ? Math.min(90, Math.floor(days)) : 1;
  // Claim last: work done above cannot consume the delivery lease.
  const commands = await takePendingCommands(request.nextUrl.origin, (report.protocol ?? 1) >= 2);
  metrics.duration_ms = Math.round(performance.now() - started);
  const { error } = await db().from("app_settings").upsert({ key: "AGENT_SYNC_METRICS", value: JSON.stringify(metrics), updated_at: metrics.at });
  if (error) console.error("agent sync metrics could not be saved", error.code);
  // вход на серверы для всех (по умолчанию открыт)
  const open_join = openJoin;
  return NextResponse.json({ commands, bundle_version: getAgentBundle().version, admins, backup_days, open_join, processed_events: processedEvents });
}
