/**
 * Ник игрока на сайте. Основной — с FACEIT (решение владельца 25.11.2026): его нельзя менять каждый день, как в Steam,
 * поэтому игрока проще узнать и труднее выдать себя за другого. FACEIT не привязан — ник из Steam.
 * Ник из Steam хранится отдельно (players.steam_nickname): он виден в игре, по нему тоже ищут.
 */
export function displayNick(steam: string | null | undefined, faceit: string | null | undefined): string | null {
  return faceit?.trim() || steam?.trim() || null;
}
