-- F16 Arena — этап 2: сетка, матчи, карты, вето.

create type match_status as enum (
  'pending',   -- ждёт соперников из предыдущих матчей
  'upcoming',  -- соперники известны, вето ещё не началось
  'veto',      -- идёт вето карт
  'ready',     -- карты выбраны, ждём сервер / старт
  'live',
  'finished',
  'cancelled'  -- пустой матч (бай с обеих сторон)
);

create type bracket_side as enum ('upper', 'lower', 'grand_final');

create table matches (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references tournaments(id) on delete cascade,
  number           int  not null,                 -- сквозной номер матча в турнире
  bracket          bracket_side not null,
  round            int  not null,
  position         int  not null,
  best_of          int  not null default 1 check (best_of in (1, 3, 5)),
  status           match_status not null default 'pending',
  team1_id         uuid references teams(id),
  team2_id         uuid references teams(id),
  team1_score      int  not null default 0,       -- выигранные карты
  team2_score      int  not null default 0,
  winner_id        uuid references teams(id),
  is_walkover      boolean not null default false,
  winner_to_match  uuid references matches(id) on delete set null,
  winner_to_slot   int check (winner_to_slot in (1, 2)),
  loser_to_match   uuid references matches(id) on delete set null,
  loser_to_slot    int check (loser_to_slot in (1, 2)),
  veto_deadline    timestamptz,                   -- дедлайн текущего шага вето
  server_address   text,                          -- ip:port, пока вручную (этап 3 — Server Agent)
  server_password  text,
  scheduled_at     timestamptz,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (tournament_id, bracket, round, position),
  unique (tournament_id, number)
);
create index matches_tournament on matches(tournament_id);

create table match_maps (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches(id) on delete cascade,
  map_number  int  not null,
  map_name    text not null,
  picked_by   uuid references teams(id),          -- null = decider / единственная карта BO1
  team1_score int  not null default 0,
  team2_score int  not null default 0,
  winner_id   uuid references teams(id),
  status      text not null default 'pending' check (status in ('pending', 'live', 'finished')),
  unique (match_id, map_number)
);

create table veto_actions (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  step       int  not null,
  team_id    uuid references teams(id),           -- null = авто-решение по таймауту / decider
  action     text not null check (action in ('ban', 'pick', 'decider')),
  map_name   text not null,
  auto       boolean not null default false,
  actor_id   uuid references players(id),
  created_at timestamptz not null default now(),
  unique (match_id, step),
  unique (match_id, map_name)
);

alter table tournaments add column bracket_published_at timestamptz;

alter table matches      enable row level security;
alter table match_maps   enable row level security;
alter table veto_actions enable row level security;

-- server_password в публичное чтение не отдаём: читаем матчи только через сервер,
-- поэтому для matches публичной политики нет.
create policy "public read" on match_maps   for select using (true);
create policy "public read" on veto_actions for select using (true);

-- учёт применённых миграций
create table if not exists _migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
alter table _migrations enable row level security;
