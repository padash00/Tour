-- Защита от сбоев в день турнира.
-- Агент копит события MatchZy и HTTP-лог CS2 на диске и досылает их, когда связь с сайтом вернулась.
-- Досылка может повторить уже принятое событие (ответ потерялся) — ключ здесь не даёт обработать его дважды.
create table if not exists ingest_dedupe (
  key        text primary key,
  created_at timestamptz not null default now()
);
create index if not exists ingest_dedupe_created on ingest_dedupe(created_at);
alter table ingest_dedupe enable row level security;
