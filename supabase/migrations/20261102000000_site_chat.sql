-- Общий чат сайта: читают все, пишут вошедшие через Steam. Модерация — админ удаляет сообщения
-- (мягко, deleted_at) и запрещает игроку писать (players.chat_muted). Только добавление.

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 300),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.players(id) on delete set null
);
create index if not exists chat_messages_recent on public.chat_messages (id desc) where deleted_at is null;

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

alter table public.players add column if not exists chat_muted boolean not null default false;
