import "server-only";
import { db } from "./supabase";

/**
 * Имя человека для официальных документов (дипломы, номинации).
 * Пока профиля с ФИО нет — никнейм. Когда появится профиль официального турнира с настоящим
 * именем, здесь нужно взять ФИО (и оставить никнейм запасным вариантом).
 */
export async function displayFullNames(playerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await db().from("players").select("id, nickname").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.nickname]));
}

/** Имя одного игрока для документов; null — игрок не найден */
export async function displayFullName(playerId: string): Promise<string | null> {
  return (await displayFullNames([playerId])).get(playerId) ?? null;
}
