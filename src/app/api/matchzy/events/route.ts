import { NextResponse, type NextRequest } from "next/server";
import { checkBearer, handleMatchzyEvent } from "@/lib/server-control";
import { claimIngest, ingestKey, releaseIngest } from "@/lib/server/ops";

/**
 * MatchZy присылает сюда события матча (matchzy_remote_log_url) — напрямую или через буфер агента,
 * который досылает их после обрыва связи. Повтор уже обработанного события отбрасывается по хэшу тела.
 */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "MATCHZY_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  let event: { event?: unknown } | null;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!event || typeof event.event !== "string") return NextResponse.json({ error: "bad event" }, { status: 400 });

  const key = ingestKey("mz", raw);
  if (!(await claimIngest(key))) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await handleMatchzyEvent(event as Parameters<typeof handleMatchzyEvent>[0]);
  } catch (e) {
    await releaseIngest(key).catch(() => {});
    console.error("matchzy event failed", event.event, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
