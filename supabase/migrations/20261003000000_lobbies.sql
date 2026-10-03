-- Лобби: игроки сами собирают матч на свободном сервере клуба. Неофициально — в общую статистику не идёт.

-- серверы, которые отданы под лобби (турниры их не берут); по умолчанию — два резервных
alter table server_instances add column if not exists for_lobby boolean not null default false;
update server_instances set for_lobby = true where name in ('CS2-04', 'CS2-05');

-- id матчей лобби для MatchZy — из своего диапазона, чтобы не пересекаться с турнирными
create sequence if not exists lobby_matchzy_seq start 1000000;

create table lobbies (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                       -- короткий код для ссылки /lobby/<code>
  host_id      uuid not null references players(id),
  visibility   text not null default 'public' check (visibility in ('public', 'closed', 'private')),
  password_hash text,                                      -- для закрытого и приватного
  invite_token text not null,                              -- ссылка-приглашение пускает без пароля
  status       text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  settings     jsonb not null default '{}'::jsonb,         -- режим, карты, геймплей, паузы, модификаторы
  team1_name   text not null default 'Команда A',
  team2_name   text not null default 'Команда B',
  bots         jsonb not null default '{"team1": [], "team2": []}'::jsonb,
  ready_check_until timestamptz,                           -- идёт проверка готовности до этого времени
  draft        jsonb,                                      -- пик капитанов: {"captains": [id1, id2], "turn": 1|2}
  current_game_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index lobbies_open on lobbies (status, visibility) where status <> 'closed';

create table lobby_members (
  lobby_id     uuid not null references lobbies(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  slot         text not null default 'wait' check (slot in ('team1', 'team2', 'wait', 'spec')),
  ready        boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);
create index lobby_members_player on lobby_members (player_id);

create table lobby_bans (
  lobby_id   uuid not null references lobbies(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);

create table lobby_messages (
  id         bigint generated always as identity primary key,
  lobby_id   uuid not null references lobbies(id) on delete cascade,
  player_id  uuid references players(id) on delete set null,  -- null — системное сообщение
  body       text not null,
  created_at timestamptz not null default now()
);
create index lobby_messages_lobby on lobby_messages (lobby_id, id);

-- одна игра лобби (реванш — новая игра в том же лобби)
create table lobby_games (
  id            uuid primary key default gen_random_uuid(),
  lobby_id      uuid not null references lobbies(id) on delete cascade,
  matchzy_id    bigint not null unique default nextval('lobby_matchzy_seq'),
  status        text not null default 'veto' check (status in ('veto', 'waiting', 'live', 'finished', 'cancelled')),
  best_of       int  not null default 1 check (best_of in (1, 3, 5)),
  settings      jsonb not null,                            -- снимок настроек на момент старта
  team1         jsonb not null,                            -- {"name", "players": [{"id","steam_id","nickname"}], "bots": n}
  team2         jsonb not null,
  veto          jsonb not null default '[]'::jsonb,        -- [{"step","team","action","map","auto"}]
  veto_pool     text[] not null default '{}',
  veto_deadline timestamptz,
  maps          jsonb not null default '[]'::jsonb,        -- [{"map","team1_score","team2_score","status","winner"}]
  team1_score   int not null default 0,
  team2_score   int not null default 0,
  winner        int check (winner in (1, 2)),
  server_instance text references server_instances(name) on delete set null,
  server_state  text check (server_state in ('loading', 'ready', 'error')),
  server_address text,
  server_assigned_at timestamptz,
  server_ready_at timestamptz,
  note          text,                                      -- что сейчас происходит (ждём сервер, прогрев карты)
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index lobby_games_lobby on lobby_games (lobby_id, created_at desc);
create index lobby_games_active on lobby_games (status) where status in ('veto', 'waiting', 'live');

alter table lobbies add constraint lobbies_current_game_fkey
  foreign key (current_game_id) references lobby_games(id) on delete set null;

-- статистика игроков в играх лобби — отдельно от турнирной
create table lobby_player_stats (
  game_id        uuid not null references lobby_games(id) on delete cascade,
  map_number     int  not null,
  steam_id       text not null,
  player_id      uuid references players(id) on delete set null,
  team           int  not null check (team in (1, 2)),
  name           text,
  kills          int not null default 0,
  deaths         int not null default 0,
  assists        int not null default 0,
  damage         int not null default 0,
  headshot_kills int not null default 0,
  rounds_played  int not null default 0,
  kast           int not null default 0,
  first_kills    int not null default 0,
  clutch_wins    int not null default 0,
  mvp            int not null default 0,
  raw            jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (game_id, map_number, steam_id)
);
create index lobby_player_stats_player on lobby_player_stats (player_id);

-- свои шаблоны настроек игрока
create table lobby_templates (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  name       text not null,
  settings   jsonb not null,
  created_at timestamptz not null default now()
);
create index lobby_templates_player on lobby_templates (player_id);

-- только сервер (service role)
alter table lobbies            enable row level security;
alter table lobby_members      enable row level security;
alter table lobby_bans         enable row level security;
alter table lobby_messages     enable row level security;
alter table lobby_games        enable row level security;
alter table lobby_player_stats enable row level security;
alter table lobby_templates    enable row level security;
