-- Привязка подключения TeamSpeak к профилю игрока.
-- Игрок заходит в канал «Привязка» на сервере TeamSpeak клуба, бот присылает ему ссылку на сайт;
-- после подтверждения сайт запоминает: этот идентификатор TeamSpeak — этот профиль.
-- По привязке бот разносит игроков по голосовым комнатам их команд, а лобби показывает, кто в голосе.
-- У профиля одна привязка и у идентификатора один профиль. Привязка живёт, пока игрок на сервере
-- TeamSpeak: на ПК клуба идентификатор общий для всех, кто садится за компьютер.
create table public.voice_links (
  player_id uuid primary key references public.players(id) on delete cascade,
  ts_uid    text not null unique,
  ts_nick   text not null default '',
  linked_at timestamptz not null default now(),
  -- когда бот последний раз видел этого игрока на сервере TeamSpeak
  seen_at   timestamptz not null default now()
);

-- только сервер (service role)
alter table public.voice_links enable row level security;
