import { NextResponse, type NextRequest } from "next/server";
import { buildMatchzyConfig, checkBearer } from "@/lib/server-control";

/** MatchZy забирает отсюда конфиг матча по команде matchzy_loadmatch_url */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/matchzy/config/[id]">) {
  if (!checkBearer(request, "MATCHZY_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const config = await buildMatchzyConfig(id, request.nextUrl.origin);
  if (!config) return NextResponse.json({ error: "match not ready" }, { status: 404 });
  return NextResponse.json(config);
}
