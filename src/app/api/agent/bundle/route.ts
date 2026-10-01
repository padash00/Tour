import { NextResponse, type NextRequest } from "next/server";
import { getAgentBundle } from "@/lib/agent-bundle";
import { checkBearer } from "@/lib/server-control";

/** Код агента, скрипты и конфиги CS2 для серверного ПК */
export async function GET(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(getAgentBundle());
}
