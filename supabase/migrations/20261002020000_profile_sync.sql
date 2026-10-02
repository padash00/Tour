-- Когда профиль игрока (Steam + FACEIT) последний раз обновлялся автоматически
alter table players add column if not exists profile_refreshed_at timestamptz;
create index if not exists players_profile_refreshed_at on players (profile_refreshed_at nulls first);
