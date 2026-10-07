import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { handleMatchzyEvent, matchzyIdAccepted, type MatchzyEvent } from "@/lib/server/matchzy-events";
import { claimIngest, completeIngest, ingestKey, releaseIngest } from "@/lib/server/ops";
import { checkBearer } from "@/lib/server/state";

/**
 * MatchZy присылает сюда события матча (matchzy_remote_log_url) — напрямую или через буфер агента,
 * который досылает их после обрыва связи. Повтор уже обработанного события отбрасывается по хэшу тела.
 * Принимаются только события матчей и игр лобби, которые сейчас идут (или только что закончились).
 * 200 — основная запись (счёт, статус) сохранена; сбои статистики, сетки и сообщений в чат идут в журнал
 * ошибок и не заставляют буфер досылать событие снова.
 */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "MATCHZY_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  let event: { event?: unknown; matchid?: unknown } | null;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!event || typeof event.event !== "string") return NextResponse.json({ error: "bad event" }, { status: 400 });
  // 409: буфер агента отложит событие в outbox/failed — его можно вернуть, если матч всё-таки нужен
  if (!(await matchzyIdAccepted(event.matchid))) return NextResponse.json({ error: "match not active" }, { status: 409 });

  const key = ingestKey("mz", raw);
  const claim = await claimIngest(key);
  if (claim.status === "done") return NextResponse.json({ ok: true, duplicate: true });
  if (claim.status === "busy" || !claim.token) return NextResponse.json({ error: "processing" }, { status: 503, headers: { "Retry-After": "5" } });
  try {
    await handleMatchzyEvent(event as MatchzyEvent);
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
