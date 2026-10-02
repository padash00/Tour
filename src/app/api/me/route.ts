import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { getPlayerActiveMatch } from "@/lib/matches";

/**
 * Кто смотрит страницу. Публичные страницы отдаются из кэша CDN одинаковыми для всех,
 * а персональные детали (шапка, кнопки участия) клиент подтягивает отсюда после загрузки.
 */
export async function GET() {
  const player = await getCurrentPlayer();
  const body = player
    ? {
        player: {
          id: player.id,
          nickname: player.nickname,
          avatar_url: player.avatar_url,
          steam_id: player.steam_id,
          isAdmin: isAdmin(player),
        },
        unread: await getUnreadCount(player.id),
        match: await getPlayerActiveMatch(player.id).catch(() => null),
      }
    : { player: null, unread: 0, match: null };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
