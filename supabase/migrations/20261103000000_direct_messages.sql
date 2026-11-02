-- Личные сообщения между игроками и «был на сайте».
-- Пишет и читает только сервер сайта (service role): доступ клиентов закрыт RLS, как у общего чата.

alter table public.players add column if not exists last_seen_at timestamptz;

create table if not exists public.direct_messages (
  id            bigint generated always as identity primary key,
  sender_id     uuid not null references public.players(id) on delete cascade,
  recipient_id  uuid not null references public.players(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 1000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_sender on public.direct_messages (sender_id, id desc);
create index if not exists direct_messages_recipient on public.direct_messages (recipient_id, id desc);
create index if not exists direct_messages_unread on public.direct_messages (recipient_id) where read_at is null;

-- блокировка: blocker не получает сообщений от blocked и не может ему писать
create table if not exists public.dm_blocks (
  blocker_id  uuid not null references public.players(id) on delete cascade,
  blocked_id  uuid not null references public.players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- жалоба на сообщение: админ видит переписку только по жалобе
create table if not exists public.dm_reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid not null references public.players(id) on delete cascade,
  reported_id  uuid not null references public.players(id) on delete cascade,
  message_id   bigint references public.direct_messages(id) on delete set null,
  reason       text check (char_length(reason) <= 300),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.players(id) on delete set null
);
create index if not exists dm_reports_open on public.dm_reports (created_at desc) where resolved_at is null;

alter table public.direct_messages enable row level security;
alter table public.dm_blocks enable row level security;
alter table public.dm_reports enable row level security;
revoke all on public.direct_messages, public.dm_blocks, public.dm_reports from anon, authenticated;

notify pgrst, 'reload schema';
