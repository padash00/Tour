import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data";
import { getPlayerActivity } from "@/lib/activity";
import { isProfileComplete, missingContact } from "@/lib/profile";
import { getProfile } from "@/lib/profiles";
import { touchPresence } from "@/lib/presence";
import { dmUnreadCount } from "@/lib/dm";

/**
 * Кто смотрит страницу. Публичные страницы отдаются из кэша CDN одинаковыми для всех,
 * а персональные детали (шапка, глобальная активность, кнопки участия) клиент подтягивает отсюда.
 */
export async function GET(req: Request) {
  const player = await getCurrentPlayer();
  // «кто на сайте» для пульта: игрок или гость (случайный id вкладки) и страница, где он сейчас
  touchPresence({ playerId: player?.id ?? null, visitor: req.headers.get("x-visitor"), path: new URL(req.url).searchParams.get("p") });
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
        // до применения миграции личных сообщений таблицы нет — считаем 0
        dmUnread: await dmUnreadCount(player.id).catch(() => 0),
        activity: await getPlayerActivity(player.id).catch(() => ({ top: null, more: 0 })),
        // только флаг для напоминания об анкете — сами данные анкеты сюда не попадают
        ...(await getProfile(player.id).then(
          (p) => ({ profileIncomplete: !isProfileComplete(p), contactMissing: isProfileComplete(p) && missingContact(p) }),
          () => ({ profileIncomplete: false, contactMissing: false }),
        )),
      }
    : { player: null, unread: 0, dmUnread: 0, activity: { top: null, more: 0 }, profileIncomplete: false, contactMissing: false };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
