-- F16 Arena — споры по матчам, обложки турниров, замены игроков.

-- ───────────────────────── споры
alter table matches add column under_review boolean not null default false;

create table disputes (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches(id) on delete cascade,
  opened_by   uuid not null references players(id),
  team_id     uuid references teams(id),          -- от чьего имени (капитан); null — админ
  reason      text not null,
  status      text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  decision    text,
  decided_by  uuid references players(id),
  decided_at  timestamptz,
  result_before jsonb,                              -- счёт/победитель до решения
  result_after  jsonb,                              -- после (если результат меняли)
  created_at  timestamptz not null default now()
);
create index disputes_match on disputes(match_id);
create index disputes_open on disputes(created_at) where status = 'open';

alter table disputes enable row level security;
create policy "public read" on disputes for select using (true);

-- ───────────────────────── обложки турниров
alter table tournaments add column cover_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-covers', 'tournament-covers', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- ───────────────────────── история замен в составах (кто кого заменил и когда)
create table roster_changes (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id       uuid not null references teams(id),
  match_id      uuid references matches(id) on delete set null,
  player_out    uuid references players(id),
  player_in     uuid references players(id),
  reason        text,
  changed_by    uuid references players(id),
  created_at    timestamptz not null default now()
);
alter table roster_changes enable row level security;
create policy "public read" on roster_changes for select using (true);
