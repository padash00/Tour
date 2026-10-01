-- F16 Arena — Swing: события раундов из HTTP-лога CS2 и вклад игроков в шанс победы раунда.

-- состояние разбора лога по матчу (какая карта идёт, номер раунда, состав по сторонам, события текущего раунда)
create table match_log_state (
  match_id     uuid primary key references matches(id) on delete cascade,
  live         boolean not null default false,
  map_number   int not null default 1,
  round_number int not null default 0,
  roster       jsonb not null default '{}'::jsonb,   -- steam_id → "CT" | "T"
  buffer       jsonb not null default '[]'::jsonb,   -- события текущего раунда
  updated_at   timestamptz not null default now()
);

-- сыгранные раунды: события и посчитанный swing (можно пересчитать при смене модели)
create table match_rounds (
  match_id     uuid not null references matches(id) on delete cascade,
  map_number   int not null,
  round_number int not null,
  winner_side  text,
  events       jsonb not null,
  swing        jsonb not null,   -- steam_id → Δ (доля, 0.12 = 12 п.п.)
  model        text not null default 'v1',
  created_at   timestamptz not null default now(),
  primary key (match_id, map_number, round_number)
);

-- swing игрока за карту (сумма по раундам)
create table player_map_swing (
  match_id   uuid not null references matches(id) on delete cascade,
  map_number int not null,
  steam_id   text not null,
  swing_sum  double precision not null default 0,
  rounds     int not null default 0,
  primary key (match_id, map_number, steam_id)
);

alter table match_log_state  enable row level security;
alter table match_rounds     enable row level security;
alter table player_map_swing enable row level security;
create policy "public read" on player_map_swing for select using (true);
create policy "public read" on match_rounds     for select using (true);

-- ───────────────────────── настройки платформы (ключи API и т.п.), редактируются в админке
-- читаются только сервером (service role); публичных политик нет
create table app_settings (
  key        text primary key,
  value      text not null,
  updated_by uuid references players(id),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
