"use server";

import { getCurrentPlayer } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { linkVoice, readVoiceToken, unlinkVoice } from "@/lib/voice";

/** Подтверждение привязки: подключение TeamSpeak из ссылки бота — к профилю вошедшего игрока */
export async function confirmVoiceLink(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getT();
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: t("Сначала войдите через Steam") };
  if (player.is_banned) return { ok: false, error: t("Профиль заблокирован") };
  const link = readVoiceToken(token);
  if (!link) return { ok: false, error: t("Ссылка устарела. Зайдите в канал «Привязка» ещё раз — бот пришлёт новую.") };
  if (!(await linkVoice(player.id, link.uid, link.nick))) return { ok: false, error: t("Не удалось сохранить привязку. Попробуйте через минуту.") };
  return { ok: true };
}

/** Игрок сам снимает привязку TeamSpeak со своего профиля */
export async function removeVoiceLink(): Promise<void> {
  const player = await getCurrentPlayer();
  if (player) await unlinkVoice({ playerId: player.id });
}
