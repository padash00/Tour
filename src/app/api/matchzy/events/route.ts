import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { checkBearer, handleMatchzyEvent } from "@/lib/server-control";
import { claimIngest, completeIngest, ingestKey, releaseIngest } from "@/lib/server/ops";

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
  const claim = await claimIngest(key);
  if (claim.status === "done") return NextResponse.json({ ok: true, duplicate: true });
  if (claim.status === "busy" || !claim.token) return NextResponse.json({ error: "processing" }, { status: 503, headers: { "Retry-After": "5" } });
  try {
    await handleMatchzyEvent(event as Parameters<typeof handleMatchzyEvent>[0]);
    await completeIngest(key, claim.token);
  } catch (e) {
    await releaseIngest(key, claim.token).catch(() => {});
    console.error("matchzy event failed", event.event, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  // публичные страницы (турнир, сетка, матчи, статистика) кэшируются CDN — после ключевых событий обновляем их сразу
  if (["going_live", "map_result", "series_end"].includes(event.event)) revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
