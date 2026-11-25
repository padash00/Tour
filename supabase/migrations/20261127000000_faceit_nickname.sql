-- Основной ник игрока на сайте — с FACEIT (решение владельца 25.11.2026). Ник из Steam больше не затирается, а хранится
-- отдельно: он виден в игре и по нему ищут. У кого FACEIT не привязан — основным остаётся ник из Steam.
-- Применять прямо перед выкладкой кода: прежний код при обновлении профиля снова пишет в nickname ник из Steam.
alter table public.players add column if not exists steam_nickname text;
update public.players set steam_nickname = nickname where steam_nickname is null;
update public.players set nickname = btrim(faceit_nickname) where faceit_nickname is not null and btrim(faceit_nickname) <> '' and nickname is distinct from btrim(faceit_nickname);
