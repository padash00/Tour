-- Настройки игры (уходят в конфиг MatchZy) и информация для зрителей/участников.

-- игра
alter table tournaments add column overtime          boolean not null default true;  -- MR3 овертайм
alter table tournaments add column knife_round       boolean not null default true;  -- иначе стороны фиксированы
alter table tournaments add column timeouts_per_team int     not null default 3 check (timeouts_per_team between 0 and 10);
alter table tournaments add column timeout_seconds   int     not null default 30 check (timeout_seconds between 15 and 120);
alter table tournaments add column tech_pauses       int     not null default 2 check (tech_pauses between 0 and 10);
alter table tournaments add column tech_pause_seconds int    not null default 300 check (tech_pause_seconds between 60 and 900);

-- информация
alter table tournaments add column stream_url  text;   -- Twitch / YouTube
alter table tournaments add column discord_url text;
alter table tournaments add column contact     text;   -- Telegram / телефон организатора
alter table tournaments add column entry_fee   text;   -- «Бесплатно» / «5 000 ₸ с команды»
alter table tournaments add column sponsors    jsonb not null default '[]'::jsonb; -- [{name, url}]
