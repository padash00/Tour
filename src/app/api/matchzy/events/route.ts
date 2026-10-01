import { NextResponse, type NextRequest } from "next/server";
import { checkBearer, handleMatchzyEvent } from "@/lib/server-control";

/** MatchZy присылает сюда события матча (matchzy_remote_log_url) */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "MATCHZY_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const event = await request.json();
  if (!event?.event) return NextResponse.json({ error: "bad event" }, { status: 400 });
  try {
    await handleMatchzyEvent(event);
  } catch (e) {
    console.error("matchzy event failed", event.event, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
