-- К каким матчам плей-офф применяется «финальный» формат (final_best_of):
-- semis — полуфиналы, матч за 3-е место и финал (как было); final — только финал. Только добавление.
alter table public.tournaments add column if not exists final_bo_scope text not null default 'semis'
  check (final_bo_scope in ('semis', 'final'));
