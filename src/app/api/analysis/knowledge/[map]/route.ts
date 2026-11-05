import { NextResponse, type NextRequest } from "next/server";
import { knowledgeFile } from "@/lib/analysis";

/** Библиотека топов по карте (gzip-JSON) — открыта всем */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/knowledge/[map]">) {
  const { map } = await ctx.params;
  if (!/^[a-z0-9_]{3,40}$/.test(map)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await knowledgeFile(map);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(file, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=300" } });
}
