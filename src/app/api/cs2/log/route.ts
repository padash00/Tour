import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { claimIngest, completeIngest, ingestKey, releaseIngest } from "@/lib/server/ops";
import { ingestLog } from "@/lib/swing-ingest";

/**
 * HTTP-лог CS2 (logaddress_add_http). Заголовки задать нельзя, поэтому токен — в query.
 * /api/cs2/log?m=<matchzy_id>&t=<MATCHZY_TOKEN>
 * Пачки могут прийти повторно (буфер агента досылает после обрыва связи) — повтор отбрасывается по хэшу.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const expected = process.env.MATCHZY_TOKEN ?? "";
  const actualBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  const ok = expected && actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const matchzyId = Number(request.nextUrl.searchParams.get("m"));
  if (!Number.isInteger(matchzyId)) return NextResponse.json({ error: "bad match" }, { status: 400 });

  const body = await request.text();
  const key = ingestKey(`log${matchzyId}`, body);
  const claim = await claimIngest(key);
  if (claim.status === "done") return NextResponse.json({ ok: true, duplicate: true });
  if (claim.status === "busy" || !claim.token) return NextResponse.json({ error: "processing" }, { status: 503, headers: { "Retry-After": "5" } });
  try {
    const result = await ingestLog(matchzyId, body, { key, token: claim.token });
    await completeIngest(key, claim.token);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await releaseIngest(key, claim.token).catch(() => {});
    console.error("cs2 log ingest failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
