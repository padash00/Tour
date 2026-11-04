import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { markJoinClick, shouldAskToJoin } from "@/lib/tg-chat-join";
import { telegramLinkRequired } from "@/lib/tg-link-gate";

export const dynamic = "force-dynamic";

/** Показывать ли окно «Вступите в Telegram-чат» вошедшему игроку */
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ show: false });
  // участник турнира без подтверждённого Telegram — сначала просим подтвердить (окно про чат подождёт)
  const link = await telegramLinkRequired(s.playerId).catch(() => null);
  const show = link ? false : await shouldAskToJoin(s.playerId).catch(() => false);
  return NextResponse.json({ show, link }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Игрок нажал «Вступить в чат» */
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  await markJoinClick(s.playerId).catch(() => {});
  return NextResponse.json({ ok: true });
}
