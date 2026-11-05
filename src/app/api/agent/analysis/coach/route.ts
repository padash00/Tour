import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_BUCKET } from "@/lib/analysis";
import { checkBearer } from "@/lib/server/state";
import { db } from "@/lib/supabase";

/** Разбор игрока (server/analyzer/coach.mjs): gzip-JSON → закрытое хранилище coach/<разбор>-<steamid>.json.gz */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const analysis = request.nextUrl.searchParams.get("analysis") ?? "";
  const steamid = request.nextUrl.searchParams.get("steamid") ?? "";
  if (!UUID.test(analysis) || !/^\d{17}$/.test(steamid)) return NextResponse.json({ error: "params" }, { status: 400 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 4_000_000 || body[0] !== 0x1f || body[1] !== 0x8b) return NextResponse.json({ error: "body" }, { status: 400 });
  const { error } = await db().storage.from(ANALYSIS_BUCKET).upload(`coach/${analysis}-${steamid}.json.gz`, body, { contentType: "application/gzip", upsert: true });
  if (error) return NextResponse.json({ error: "storage", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
