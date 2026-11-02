import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { listChat } from "@/lib/chat";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Общий чат: сообщения (после ?after=id — только новые) и что может текущий посетитель */
export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || undefined;
  const [messages, player] = await Promise.all([listChat(after), getCurrentPlayer()]);
  let muted = false;
  if (player) {
    const { data } = await db().from("players").select("chat_muted").eq("id", player.id).maybeSingle();
    muted = !!data?.chat_muted;
  }
  return NextResponse.json(
    {
      messages,
      me: player ? { id: player.id, admin: isAdmin(player), banned: player.is_banned, muted } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
