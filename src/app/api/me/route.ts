import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { getPlayerActivity } from "@/lib/activity";
import { isProfileComplete } from "@/lib/profile";
import { getProfile } from "@/lib/profiles";

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
        // только флаг для напоминания об анкете — сами данные анкеты сюда не попадают
        profileIncomplete: await getProfile(player.id).then((p) => !isProfileComplete(p), () => false),
      }
    : { player: null, unread: 0, activity: { top: null, more: 0 }, profileIncomplete: false };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
