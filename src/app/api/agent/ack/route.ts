import { NextResponse, type NextRequest } from "next/server";
import { ackCommand, checkBearer } from "@/lib/server-control";

export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, ok, result } = (await request.json()) as { id: string; ok: boolean; result?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ackCommand(id, !!ok, result ?? "");
  return NextResponse.json({ ok: true });
}
