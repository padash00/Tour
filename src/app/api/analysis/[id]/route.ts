import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { analysisFile } from "@/lib/analysis";

/** Файл разбора демки (gzip-JSON) — пока только админам, как и страница «Разбор» */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/[id]">) {
  const me = await getCurrentPlayer();
  if (!isAdmin(me)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await analysisFile(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  // отдаём байты gzip как есть: страница распаковывает сама
  return new NextResponse(file, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
