import { NextResponse, type NextRequest } from "next/server";
import { verifyLogSignature } from "@/lib/server/ingest-signature";
import { claimIngest, completeIngest, ingestKey, releaseIngest } from "@/lib/server/ops";
import { ingestLog } from "@/lib/swing-ingest";

/**
 * HTTP-лог CS2 (logaddress_add_http). Заголовки задать нельзя, поэтому подпись — в query:
 * /api/cs2/log?m=<matchzy_id>&sig=<HMAC(MATCHZY_TOKEN, matchzy_id)> — сам токен в адресе не светится.
 * Пачки могут прийти повторно (буфер агента досылает после обрыва связи) — повтор отбрасывается по хэшу.
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.MATCHZY_TOKEN ?? "";
  const m = params.get("m") ?? "";
  const matchzyId = Number(m);
  if (!/^\d+$/.test(m) || !Number.isSafeInteger(matchzyId)) return NextResponse.json({ error: "bad match" }, { status: 400 });
  const sig = params.get("sig");
  const ok = !!expected && !!sig && verifyLogSignature(m, sig, expected);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
