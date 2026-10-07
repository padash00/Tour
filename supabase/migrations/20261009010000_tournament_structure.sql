-- Структура городского турнира: матч за 3-е место, номинации (решение судей), жеребьёвка.
-- Только добавления: новые значение enum, колонка и таблица.

-- ───────────────────────── матч за 3-е место
-- Отдельная сторона сетки: в него попадают проигравшие полуфиналов Single Elimination (loser_to_match).
-- Новое значение не используется в этой же миграции (ограничение ALTER TYPE … ADD VALUE в транзакции).
alter type bracket_side add value if not exists 'third_place';

-- Флаг турнира. Та же колонка может прийти из миграции формы турнира — обе идемпотентны.
alter table public.tournaments add column if not exists third_place_match boolean not null default false;

-- ───────────────────────── номинации
-- Решение судей по номинации (Положение 5.5): перекрывает кандидата, посчитанного по статистике,
-- или задаёт ручную номинацию (лучший капитан, лучший тренер). Тренер — не пользователь сайта:
-- тогда player_id пуст, а имя хранится в name. Нет строки — действует расчёт по статистике.
create table if not exists public.tournament_nominations (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  key           text not null check (key ~ '^[a-z_]{2,32}$'),
  player_id     uuid references public.players(id) on delete set null,
  name          text check (name is null or length(name) between 1 and 120),
  team_id       uuid references public.teams(id) on delete set null,
  note          text check (note is null or length(note) <= 300),
  decided_by    uuid references public.players(id) on delete set null,
  decided_at    timestamptz not null default now(),
  primary key (tournament_id, key),
  check (player_id is not null or name is not null)
);
alter table public.tournament_nominations enable row level security;
-- политик нет: сайт работает серверным ключом
revoke all on public.tournament_nominations from anon, authenticated;
grant select, insert, update, delete on public.tournament_nominations to service_role;

-- ───────────────────────── жеребьёвка
-- Порядок посева жеребьёвки пишется в audit_logs (action = 'bracket.draw'); выборка последней по турниру.
create index if not exists audit_logs_entity_action on public.audit_logs(entity_id, action, created_at desc);
