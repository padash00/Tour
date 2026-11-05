import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer } from "@/lib/auth";
import { canViewCoach, coachFile } from "@/lib/analysis";

/** Разбор игрока (gzip-JSON) — самому игроку и админам */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/coach/[id]/[steamid]">) {
  const me = await getCurrentPlayer();
  const { id, steamid } = await ctx.params;
  if (!UUID.test(id) || !/^\d{17}$/.test(steamid) || !canViewCoach(steamid, me)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await coachFile(id, steamid);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(file, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
}
