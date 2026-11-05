-- Разбор демок: каждая запись — одна карта (матч F16 или демка про-игроков). Сам разбор (позиции, убийства,
-- гранаты, экономика) — JSON в закрытом хранилище «analyses»; здесь — карточка для списка и фильтров.
-- Только добавление. Страница «Разбор» пока видна только админам.
create table if not exists public.demo_analyses (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'pro',          -- 'pro' — демка топовых игроков, 'match' — матч F16
  match_id    uuid references public.matches(id) on delete set null,
  map_number  int,
  map         text not null,
  title       text not null,
  team_a      text,
  team_b      text,
  score_a     int,
  score_b     int,
  rounds      int not null default 0,
  players     jsonb not null default '[]'::jsonb,   -- [{name, steamid, team}]
  source      text,                                 -- имя исходного файла
  storage_path text not null,
  size_bytes  int,
  created_at  timestamptz not null default now()
);
alter table public.demo_analyses drop constraint if exists demo_analyses_kind_known;
alter table public.demo_analyses add constraint demo_analyses_kind_known check (kind in ('pro', 'match'));
create index if not exists demo_analyses_map_idx on public.demo_analyses (map, created_at desc);
create unique index if not exists demo_analyses_source_uq on public.demo_analyses (source) where source is not null;

alter table public.demo_analyses enable row level security;
revoke all on public.demo_analyses from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('analyses', 'analyses', false, 52428800, array['application/json', 'application/gzip'])
on conflict (id) do nothing;
