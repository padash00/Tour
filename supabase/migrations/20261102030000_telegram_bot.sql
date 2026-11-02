-- Telegram-бот: подтверждённый Telegram игрока (chat_id) и одноразовые ссылки привязки. Только добавление.
alter table public.player_profiles add column if not exists telegram_chat_id bigint;
alter table public.player_profiles add column if not exists telegram_verified_at timestamptz;
create unique index if not exists player_profiles_telegram_chat on public.player_profiles (telegram_chat_id) where telegram_chat_id is not null;

-- ссылка t.me/<бот>?start=<token>: живёт 30 минут, после привязки удаляется
create table if not exists public.telegram_link_tokens (
  token      text primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.telegram_link_tokens enable row level security;
revoke all on public.telegram_link_tokens from anon, authenticated;
