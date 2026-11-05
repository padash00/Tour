import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_BUCKET } from "@/lib/analysis";
import { checkBearer } from "@/lib/server/state";
import { db } from "@/lib/supabase";

/** Выжимка карты для разведки соперника (server/analyzer/situations.mjs → scout): gzip-JSON → scout/<разбор>.json.gz */
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 4_000_000) return NextResponse.json({ error: "size" }, { status: 413 });
  if (body[0] !== 0x1f || body[1] !== 0x8b) return NextResponse.json({ error: "not gzip" }, { status: 400 });
  const { error } = await db().storage.from(ANALYSIS_BUCKET).upload(`scout/${id}.json.gz`, body, { contentType: "application/gzip", upsert: true });
  if (error) return NextResponse.json({ error: "storage", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
