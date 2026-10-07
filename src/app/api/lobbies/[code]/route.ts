import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { buildLobbyView } from "@/lib/lobby-view";

/**
 * Состояние лобби — страница лобби опрашивает его каждые 1,5 с (у каждого зрителя своё: права, адрес сервера).
 * ETag по содержимому (без поля now): если ничего не изменилось — 304 без тела.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/lobbies/[code]">) {
  const { code } = await ctx.params;
  const player = await getCurrentPlayer();
  const view = await buildLobbyView(code, player, { admin: isAdmin(player) });
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  const etag = `"${createHash("sha1").update(JSON.stringify({ ...view, now: "" })).digest("base64url")}"`;
  const headers = { "Cache-Control": "private, no-store", ETag: etag };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json(view, { headers });
}
