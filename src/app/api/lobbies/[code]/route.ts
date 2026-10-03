import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { buildLobbyView } from "@/lib/lobby-view";

/** Состояние лобби — страница лобби опрашивает его каждые 1,5 с (у каждого зрителя своё: права, адрес сервера) */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/lobbies/[code]">) {
  const { code } = await ctx.params;
  const player = await getCurrentPlayer();
  const view = await buildLobbyView(code, player, { admin: isAdmin(player) });
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
