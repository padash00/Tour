-- Логи раундов игр лобби (HTTP-лог CS2). MatchZy для лобби присылает нулями первые убийства, трейды,
-- флеш-ассисты и KAST, а по оружию и сторонам не присылает ничего — считаем сами по событиям раундов.
--
-- lobby_log_batches — разобранные события из пачек лога, в порядке прихода (id). Пачки без событий не хранятся.
--   key — ключ приёма пачки (хэш содержимого): повторная досылка той же пачки вторую строку не создаёт.
-- lobby_round_facts — посчитанное по этим событиям на игрока и карту; пересчитывается целиком, когда
--   заканчивается карта или досылается хвост лога. Счёт и основная статистика по-прежнему идут от MatchZy
--   в lobby_player_stats — эта таблица их только дополняет.
create table public.lobby_log_batches (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.lobby_games(id) on delete cascade,
  key        text not null unique,
  events     jsonb not null,
  created_at timestamptz not null default now()
);
create index lobby_log_batches_game on public.lobby_log_batches (game_id, id);

create table public.lobby_round_facts (
  game_id       uuid not null references public.lobby_games(id) on delete cascade,
  map_number    int  not null,
  steam_id      text not null,
  rounds        int  not null default 0,               -- раундов карты, найденных в логе
  kast          int  not null default 0,               -- раундов с убийством, ассистом, выживанием или разменом
  first_kills   int  not null default 0,
  first_deaths  int  not null default 0,
  trade_kills   int  not null default 0,
  flash_assists int  not null default 0,
  weapons       jsonb not null default '{}'::jsonb,    -- оружие → убийств соперников
  sides         jsonb not null default '{}'::jsonb,    -- {"CT": {"rounds","wins","kills","deaths"}, "T": {...}}
  updated_at    timestamptz not null default now(),
  primary key (game_id, map_number, steam_id)
);

-- только сервер (service role)
alter table public.lobby_log_batches enable row level security;
alter table public.lobby_round_facts enable row level security;

-- права заданы явно: не зависят от того, под какой ролью применена миграция
grant all on table public.lobby_log_batches, public.lobby_round_facts to service_role;
grant usage, select on sequence public.lobby_log_batches_id_seq to service_role;
