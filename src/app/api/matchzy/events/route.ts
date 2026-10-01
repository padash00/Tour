import { NextResponse, type NextRequest } from "next/server";
import { checkBearer, handleMatchzyEvent } from "@/lib/server-control";

/** MatchZy присылает сюда события матча (matchzy_remote_log_url) */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "MATCHZY_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let event: { event?: unknown } | null;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!event || typeof event.event !== "string") return NextResponse.json({ error: "bad event" }, { status: 400 });
  try {
    await handleMatchzyEvent(event as Parameters<typeof handleMatchzyEvent>[0]);
  } catch (e) {
    console.error("matchzy event failed", event.event, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
