import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { getPlayerActivity } from "@/lib/activity";

/**
 * Кто смотрит страницу. Публичные страницы отдаются из кэша CDN одинаковыми для всех,
 * а персональные детали (шапка, глобальная активность, кнопки участия) клиент подтягивает отсюда.
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
        activity: await getPlayerActivity(player.id).catch(() => ({ top: null, more: 0 })),
      }
    : { player: null, unread: 0, activity: { top: null, more: 0 } };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
