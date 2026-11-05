import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer } from "@/lib/auth";
import { analysisCard, analysisFile, canViewAnalysis } from "@/lib/analysis";

/** Файл разбора демки (gzip-JSON): повторы матчей клуба и про — всем, ручные демки — участникам и админам */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/[id]">) {
  const me = await getCurrentPlayer();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const card = await analysisCard(id);
  if (!card || !canViewAnalysis(card, me)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await analysisFile(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  // отдаём байты gzip как есть: страница распаковывает сама
  return new NextResponse(file, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
