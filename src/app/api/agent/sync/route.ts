import { NextResponse, type NextRequest } from "next/server";
import { applyAgentReport, checkBearer, takePendingCommands, type AgentReport } from "@/lib/server-control";

/** F16 Server Agent раз в несколько секунд присылает состояние хоста и инстансов, в ответ получает команды. */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = (await request.json()) as AgentReport;
  await applyAgentReport(report);
  const commands = await takePendingCommands(request.nextUrl.origin);
  return NextResponse.json({ commands });
}
