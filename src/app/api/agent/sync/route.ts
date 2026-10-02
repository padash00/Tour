import { NextResponse, type NextRequest } from "next/server";
import { getAgentBundle } from "@/lib/agent-bundle";
import {
  applyAgentReport,
  autopilotTick,
  checkBearer,
  closeMatchesOfEndedTournaments,
  expireStaleWork,
  takePendingCommands,
  verifyWorkshopLibrary,
  type AgentReport,
} from "@/lib/server-control";
import { applyAgentEvents, checkCs2UpToDate, pruneIngest } from "@/lib/server/ops";
import { refreshStaleProfilesTick } from "@/lib/profile-sync";
import { applyDueVetoTimeouts } from "@/lib/matches";

/** Фоновые задачи на каждой синхронизации: сбой одной не должен отменять остальные */
async function safely(name: string, job: () => Promise<unknown>) {
  try {
    await job();
  } catch (e) {
    console.error(`${name} failed`, e);
  }
}

/** F16 Server Agent раз в несколько секунд присылает состояние хоста и инстансов, в ответ получает команды. */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = (await request.json()) as AgentReport;
  await applyAgentReport(report);
  await safely("agent events", () => applyAgentEvents(report.events));
  await safely("watchdog", expireStaleWork);
  await safely("veto timeouts", applyDueVetoTimeouts);
  await safely("autopilot", autopilotTick);
  await safely("workshop check", verifyWorkshopLibrary);
  await safely("close ended", () => closeMatchesOfEndedTournaments());
  await safely("cs2 version", () => checkCs2UpToDate(report.info?.cs2_patch));
  await safely("dedupe prune", pruneIngest);
  await safely("profile sync", refreshStaleProfilesTick);
  const commands = await takePendingCommands(request.nextUrl.origin);
  // агент сравнит версию и сам скачает новый код/конфиги с /api/agent/bundle
  return NextResponse.json({ commands, bundle_version: getAgentBundle().version });
}
