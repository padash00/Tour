import { NextResponse, type NextRequest } from "next/server";
import { ackCommand, checkBearer } from "@/lib/server-control";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { id?: unknown; ok?: unknown; result?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  // ответ консоли может быть длинным — в базу хватит первых 20 КБ
  const result = typeof body.result === "string" ? body.result.slice(0, 20_000) : "";
  await ackCommand(id, !!body.ok, result);
  return NextResponse.json({ ok: true });
}
