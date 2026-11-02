import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth";
import { ackRules, pendingRulesAck } from "@/lib/rules-ack";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Регламент, который игроку нужно прочитать (команда подала заявку, а он ещё не подтвердил) */
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ pending: null }, { headers: noStore });
  const pending = await pendingRulesAck(player.id).catch(() => null);
  return NextResponse.json({ pending }, { headers: noStore });
}

/** «Прочитал регламент» */
export async function POST(req: Request) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  const { tournamentId } = (await req.json().catch(() => ({}))) as { tournamentId?: string };
  const pending = await pendingRulesAck(player.id);
  // подтверждать можно только то, что игроку действительно показано
  if (!tournamentId || pending?.id !== tournamentId) return NextResponse.json({ ok: true }, { headers: noStore });
  await ackRules(player.id, tournamentId);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
