-- F16 Arena — этап 1: игроки, команды, турниры, заявки, составы, уведомления, аудит.
-- Все записи идут через сервер (service role). RLS включён везде;
-- публичное чтение открыто только для публичных данных (на будущее — Realtime).

create extension if not exists citext;

create type tournament_status as enum (
  'draft',               -- черновик, не виден публично
  'registration',        -- регистрация открыта
  'registration_closed', -- регистрация закрыта, составы заблокированы
  'checkin',             -- идёт check-in
  'live',                -- турнир идёт
  'finished',
  'cancelled'
);

create type registration_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type member_role as enum ('captain', 'player', 'substitute');
create type roster_role as enum ('main', 'sub');

-- ───────────────────────── players
create table players (
  id                uuid primary key default gen_random_uuid(),
  steam_id          text not null unique,          -- SteamID64, главный идентификатор
  nickname          text not null,
  avatar_url        text,
  profile_url       text,
  country           text,
  is_admin          boolean not null default false,
  is_banned         boolean not null default false,
  faceit_id         text,
  faceit_nickname   text,
  faceit_level      int,
  faceit_elo        int,
  faceit_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  last_login_at     timestamptz
);

-- ───────────────────────── teams
create table teams (
  id           uuid primary key default gen_random_uuid(),
  name         citext not null,
  tag          citext not null,
  region       text,
  description  text,
  logo_url     text,
  captain_id   uuid not null references players(id),
  invite_code  text not null unique,
  created_at   timestamptz not null default now(),
  disbanded_at timestamptz
);
create unique index teams_name_active on teams(name) where disbanded_at is null;
create unique index teams_tag_active  on teams(tag)  where disbanded_at is null;

create table team_members (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id),
  role      member_role not null default 'player',
  joined_at timestamptz not null default now(),
  left_at   timestamptz
);
-- игрок может состоять только в одной активной команде
create unique index team_members_one_team on team_members(player_id) where left_at is null;
create index team_members_team on team_members(team_id) where left_at is null;

-- ───────────────────────── tournaments
create table tournaments (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  game                   text not null default 'CS2',
  format                 text not null default '5v5',
  bracket_type           text not null default 'double_elimination',
  max_teams              int  not null default 16,
  status                 tournament_status not null default 'draft',
  starts_at              timestamptz,
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  checkin_opens_at       timestamptz,
  checkin_closes_at      timestamptz,
  location               text,
  is_lan                 boolean not null default true,
  prize_pool             text,
  prize_distribution     jsonb not null default '[]'::jsonb, -- [{"place":"1","prize":"..."}]
  match_format           text,  -- например "BO1 до полуфинала, BO3 полуфинал и финал"
  map_pool               text[] not null default array['de_mirage','de_inferno','de_nuke','de_ancient','de_anubis','de_dust2','de_train'],
  description            text,
  rules                  text,
  requirements           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table tournament_registrations (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id       uuid not null references teams(id),
  status        registration_status not null default 'pending',
  seed          int,
  note          text,          -- комментарий админа (причина отказа и т.п.)
  decided_by    uuid references players(id),
  decided_at    timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references players(id),
  created_at    timestamptz not null default now(),
  unique (tournament_id, team_id)
);

-- состав команды на конкретный турнир; хранится навсегда
create table tournament_roster_players (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references tournament_registrations(id) on delete cascade,
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  player_id       uuid not null references players(id),
  role            roster_role not null default 'main',
  created_at      timestamptz not null default now(),
  -- 1 SteamID = 1 команда в одном турнире
  unique (tournament_id, player_id)
);

-- ───────────────────────── notifications / audit
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_player on notifications(player_id, created_at desc);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references players(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created on audit_logs(created_at desc);

-- ───────────────────────── RLS
alter table players                   enable row level security;
alter table teams                     enable row level security;
alter table team_members              enable row level security;
alter table tournaments               enable row level security;
alter table tournament_registrations  enable row level security;
alter table tournament_roster_players enable row level security;
alter table notifications             enable row level security;
alter table audit_logs                enable row level security;

create policy "public read" on players                   for select using (true);
create policy "public read" on teams                     for select using (true);
create policy "public read" on team_members              for select using (true);
create policy "public read" on tournaments               for select using (status <> 'draft');
create policy "public read" on tournament_registrations  for select using (true);
create policy "public read" on tournament_roster_players for select using (true);
-- notifications и audit_logs — только service role

-- ───────────────────────── storage: логотипы команд
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
