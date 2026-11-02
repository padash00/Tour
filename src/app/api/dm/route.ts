import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth";
import { blockState, getPeer, isUuid, listConversations, listThread, markThreadRead } from "@/lib/dm";
import { supportPlayerId } from "@/lib/support";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Личные сообщения текущего игрока.
 *  без параметров — список диалогов;
 *  ?with=<id>[&after=<id>] — переписка с игроком (только новее after); открытая переписка отмечается прочитанной.
 */
export async function GET(req: Request) {
  const me = await getCurrentPlayer();
  if (!me) return NextResponse.json({ error: "login" }, { status: 401, headers: noStore });
  const sp = new URL(req.url).searchParams;
  const other = sp.get("with");
  const support = await supportPlayerId();
  if (!other) return NextResponse.json({ me: me.id, support, conversations: await listConversations(me.id) }, { headers: noStore });
  if (!isUuid(other) || other === me.id) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  const after = Number(sp.get("after") ?? 0) || undefined;
  const [peer, messages, blocks] = await Promise.all([getPeer(other), listThread(me.id, other, after), blockState(me.id, other)]);
  if (!peer) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  if (messages.some((m) => m.recipient_id === me.id && !m.read_at)) await markThreadRead(me.id, other);
  return NextResponse.json({ me: me.id, support, peer, messages, ...blocks }, { headers: noStore });
}
