import { NextResponse, type NextRequest } from "next/server";
import { checkBearer } from "@/lib/server-control";
import { siteOrigin } from "@/lib/origin";
import { isTsUid, unlinkVoice, voiceSync, voiceToken } from "@/lib/voice";

/*
 * Бот сервера TeamSpeak (F16 Bot) ↔ сайт. Токен — тот же, что у агента серверного ПК (AGENT_TOKEN).
 *   {action: "sync", clients: [{uid, nick}]} → {links, rooms}: кто привязан и какие комнаты команд нужны;
 *   {action: "token", uid}                   → {url}: ссылка привязки для игрока в канале «Привязка»;
 *   {action: "unlink", uid}                  → снять привязку (команда !отвязать).
 */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { action?: unknown; clients?: unknown; uid?: unknown; nick?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad body" }, { status: 400 });

  if (body.action === "sync") {
    const list = Array.isArray(body.clients) ? body.clients.slice(0, 600) : [];
    const clients = list
      .filter((c): c is { uid: string; nick?: unknown } => !!c && typeof c === "object" && isTsUid((c as { uid?: unknown }).uid))
      .map((c) => ({ uid: c.uid, nick: typeof c.nick === "string" ? c.nick : "" }));
    try {
      return NextResponse.json(await voiceSync(clients));
    } catch {
      // база не ответила (или таблицы привязок ещё нет) — бот в этот раз ничего не меняет
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
  }
  if (body.action === "token") {
    if (!isTsUid(body.uid)) return NextResponse.json({ error: "uid required" }, { status: 400 });
    const token = voiceToken(body.uid);
    if (!token) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    // короткий адрес /v/… — ссылка должна поместиться во всплывающее предупреждение TeamSpeak (100 знаков)
    return NextResponse.json({ url: `${await siteOrigin()}/v/${token}` });
  }
  if (body.action === "unlink") {
    if (!isTsUid(body.uid)) return NextResponse.json({ error: "uid required" }, { status: 400 });
    await unlinkVoice({ uid: body.uid });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
