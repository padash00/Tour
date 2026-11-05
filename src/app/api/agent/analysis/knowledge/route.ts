import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_BUCKET } from "@/lib/analysis";
import { checkBearer } from "@/lib/server/state";
import { db } from "@/lib/supabase";

/** Библиотека топов по карте (server/analyzer/learn.mjs): gzip-JSON → закрытое хранилище knowledge/<карта>.json.gz */
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const map = request.nextUrl.searchParams.get("map") ?? "";
  if (!/^[a-z0-9_]{3,40}$/.test(map)) return NextResponse.json({ error: "map" }, { status: 400 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 4_000_000) return NextResponse.json({ error: "size" }, { status: 413 });
  if (body[0] !== 0x1f || body[1] !== 0x8b) return NextResponse.json({ error: "not gzip" }, { status: 400 });
  const { error } = await db().storage.from(ANALYSIS_BUCKET).upload(`knowledge/${map}.json.gz`, body, { contentType: "application/gzip", upsert: true });
  if (error) return NextResponse.json({ error: "storage", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
