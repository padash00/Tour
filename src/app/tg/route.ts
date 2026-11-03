import { NextResponse } from "next/server";
import { SITE_URL, telegramGroup } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Короткая ссылка на общий чат игроков в Telegram: tournament.f16-arena.kz/tg. Ссылку создаёт бот в пульте → Telegram */
export async function GET() {
  const group = await telegramGroup().catch(() => null);
  return NextResponse.redirect(group?.invite || SITE_URL, 307);
}
