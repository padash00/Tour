import "server-only";
import { db } from "./supabase";

/*
 * Имена людей. Публично (итоги турнира, номинации на сайте) — только никнейм: анкета видна лишь владельцу и админам.
 * В документах для организаторов (дипломы, заявки) — ФИО из анкеты, никнейм — если анкеты нет.
 */

/** Никнеймы — для публичных страниц */
export async function displayFullNames(playerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await db().from("players").select("id, nickname").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.nickname]));
}

/** Имя одного игрока для публичных страниц; null — игрок не найден */
export async function displayFullName(playerId: string): Promise<string | null> {
  return (await displayFullNames([playerId])).get(playerId) ?? null;
}

/** «Фамилия Имя Отчество» из анкеты (только для админских документов); без анкеты — никнейм */
export async function documentNames(playerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [nicknames, { data: profiles }] = await Promise.all([
    displayFullNames(ids),
    db().from("player_profiles").select("player_id, last_name, first_name, patronymic").in("player_id", ids),
  ]);
  const names = new Map(nicknames);
  for (const p of profiles ?? []) {
    const full = [p.last_name, p.first_name, p.patronymic].map((x) => x?.trim()).filter(Boolean).join(" ");
    if (p.last_name?.trim() && p.first_name?.trim()) names.set(p.player_id, full);
  }
  return names;
}
