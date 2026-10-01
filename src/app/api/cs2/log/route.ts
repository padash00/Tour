import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ingestLog } from "@/lib/swing-ingest";

/**
 * HTTP-лог CS2 (logaddress_add_http). Заголовки задать нельзя, поэтому токен — в query.
 * /api/cs2/log?m=<matchzy_id>&t=<MATCHZY_TOKEN>
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const expected = process.env.MATCHZY_TOKEN ?? "";
  const ok = expected && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const matchzyId = Number(request.nextUrl.searchParams.get("m"));
  if (!Number.isInteger(matchzyId)) return NextResponse.json({ error: "bad match" }, { status: 400 });

  const body = await request.text();
  try {
    const result = await ingestLog(matchzyId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("cs2 log ingest failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
