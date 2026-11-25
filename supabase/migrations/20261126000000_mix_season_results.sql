-- Итоги сезонов «Микса». Сезон — календарный месяц; за 1–3 места клуб платит призы.
-- До этой таблицы призёры прошлого месяца каждый раз вычислялись заново из истории игр: отмена или правка
-- старой игры задним числом меняла «окончательные» итоги. Теперь тройка записывается один раз, когда месяц
-- закончился (при первом открытии раздела после конца сезона), и дальше показывается из этой таблицы.
--   paid_at / paid_by — отметка админа «приз выплачен».
-- Пересчитать зафиксированный сезон может только админ и только пока ни один его приз не отмечен выплаченным.
create table public.mix_season_results (
  season    text not null check (season ~ '^\d{4}-(0[1-9]|1[0-2])$'),   -- «2026-11»
  place     int  not null check (place between 1 and 3),
  steam_id  text not null,
  name      text,
  rating    numeric(6, 3) not null,
  maps      int  not null,
  prize     int  not null,                                              -- тенге
  fixed_at  timestamptz not null default now(),
  paid_at   timestamptz,
  paid_by   uuid references public.players(id) on delete set null,
  primary key (season, place)
);

-- только сервер (service role)
alter table public.mix_season_results enable row level security;

-- права заданы явно: не зависят от того, под какой ролью применена миграция
grant all on table public.mix_season_results to service_role;
