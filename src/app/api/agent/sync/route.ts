import { NextResponse, type NextRequest } from "next/server";
import { getAgentBundle } from "@/lib/agent-bundle";
import { applyAgentReport, autopilotTick, checkBearer, takePendingCommands, verifyWorkshopLibrary, closeMatchesOfEndedTournaments, type AgentReport } from "@/lib/server-control";

/** F16 Server Agent раз в несколько секунд присылает состояние хоста и инстансов, в ответ получает команды. */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = (await request.json()) as AgentReport;
  await applyAgentReport(report);
  try {
    await autopilotTick();
    await verifyWorkshopLibrary();
    await closeMatchesOfEndedTournaments();
  } catch (e) {
    console.error("autopilot failed", e);
  }
  const commands = await takePendingCommands(request.nextUrl.origin);
  // агент сравнит версию и сам скачает новый код/конфиги с /api/agent/bundle
  return NextResponse.json({ commands, bundle_version: getAgentBundle().version });
}
