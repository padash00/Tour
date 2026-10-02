-- Поиск команды / игрока: объявления игроков («ищу команду») и капитанов («ищем игрока»)
create table finder_posts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('player', 'team')),
  player_id    uuid not null references players(id) on delete cascade, -- автор (для team — капитан)
  team_id      uuid references teams(id) on delete cascade,            -- только для kind = 'team'
  roles        text[] not null default '{}',                           -- entry / awp / support / lurk / igl / any
  modes        text[] not null default '{5v5}',                        -- 5v5 / 2v2
  availability text,
  note         text,
  active       boolean not null default true,
  expires_at   timestamptz not null default now() + interval '14 days',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((kind = 'team') = (team_id is not null))
);

-- одно активное объявление на игрока и на команду
create unique index finder_posts_one_player on finder_posts (player_id) where active and kind = 'player';
create unique index finder_posts_one_team on finder_posts (team_id) where active and kind = 'team';
create index finder_posts_list on finder_posts (kind, active, expires_at);

-- только сервер (service role) — читают и пишут server actions
alter table finder_posts enable row level security;
