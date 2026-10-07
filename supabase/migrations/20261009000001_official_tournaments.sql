-- Официальный турнир (например, городской с акиматом): возраст участников, город, тренер, без запасных,
-- заявка организации (Приложение №1) и отметки о сданных бумажных документах.
-- Здесь же матч за 3-е место (логику сетки делает отдельное изменение — тут только настройка).

-- ───────────────────────── настройки турнира
alter table public.tournaments
  add column if not exists is_official       boolean not null default false,
  add column if not exists min_age           int     not null default 16,
  add column if not exists max_age           int     not null default 35,
  add column if not exists city              text    not null default 'Усть-Каменогорск',
  add column if not exists require_coach     boolean not null default true,
  add column if not exists allow_substitutes boolean not null default false,
  add column if not exists third_place_match boolean not null default false;
alter table public.tournaments add constraint tournaments_age_range
  check (min_age between 0 and 120 and max_age between min_age and 120);

-- ───────────────────────── заявка организации (одна на заявку команды)
-- Состав игроков — в tournament_roster_players, их ФИО и даты — в player_profiles.
-- Тренер аккаунта на сайте не имеет — его данные хранятся в заявке.
create table if not exists public.tournament_applications (
  registration_id    uuid primary key,
  tournament_id      uuid not null references public.tournaments(id) on delete cascade,
  organization       text not null,  -- полное название организации, которую представляет команда
  captain_phone      text,
  responsible_name   text,           -- ответственное лицо
  responsible_phone  text,
  coach_name         text,
  coach_birth_date   date,
  coach_workplace    text,           -- место работы или учёбы тренера
  coach_position     text,           -- должность или курс/группа тренера
  coach_documents_at timestamptz,    -- документы тренера сданы организатору
  coach_documents_by uuid references public.players(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tournament_applications_registration_fkey foreign key (registration_id, tournament_id)
    references public.tournament_registrations(id, tournament_id) on delete cascade
);
alter table public.tournament_applications enable row level security;
revoke all on public.tournament_applications from anon, authenticated;
create index if not exists tournament_applications_tournament on public.tournament_applications(tournament_id);

-- ───────────────────────── бумажные документы участников (справка с места работы/учёбы, студенческий)
-- Отдельно от состава: save_registration пересоздаёт строки состава, а отметка должна сохраниться.
create table if not exists public.tournament_participant_documents (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  marked_by     uuid references public.players(id) on delete set null,
  primary key (tournament_id, player_id)
);
alter table public.tournament_participant_documents enable row level security;
revoke all on public.tournament_participant_documents from anon, authenticated;

-- ───────────────────────── заявка на официальный турнир
-- Проверки официального турнира, состав (через save_registration) и данные заявки — одной транзакцией.
-- Сайт проверяет то же самое до отправки (src/lib/official.ts) и показывает понятный чек-лист;
-- здесь — последняя защита от устаревшей формы и параллельных изменений анкет.
create function public.save_official_registration(p_tournament uuid, p_team uuid, p_actor uuid, p_main uuid[], p_sub uuid[], p_application jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare t tournaments; day date; res jsonb; a jsonb := coalesce(p_application, '{}'::jsonb);
begin
  select * into t from tournaments where id = p_tournament for update;
  if not found or not t.is_official then raise exception 'not_official'; end if;
  if t.format = '1v1' or (not t.allow_substitutes and cardinality(coalesce(p_sub, '{}')) > 0) then raise exception 'invalid_roster'; end if;
  -- день турнира по времени Алматы (UTC+5): дата старта, а без неё — сегодня
  day := (coalesce(t.starts_at, now()) at time zone interval '+05:00')::date;
  -- анкеты читаются под блокировкой: параллельная правка не проскочит между проверкой и записью
  perform 1 from player_profiles where player_id = any(p_main || coalesce(p_sub, '{}')) for share;
  if exists(select 1 from unnest(p_main || coalesce(p_sub, '{}')) x left join player_profiles pp on pp.player_id = x
    where not player_profile_complete(pp)) then raise exception 'profile_incomplete'; end if;
  if exists(select 1 from player_profiles pp where pp.player_id = any(p_main || coalesce(p_sub, '{}'))
    and extract(year from age(day::timestamp, pp.birth_date::timestamp)) not between t.min_age and t.max_age) then raise exception 'age_out_of_range'; end if;
  if coalesce(btrim(a->>'organization'), '') = '' or coalesce(btrim(a->>'captain_phone'), '') = ''
    or coalesce(btrim(a->>'responsible_name'), '') = '' or coalesce(btrim(a->>'responsible_phone'), '') = ''
    or (t.require_coach and (coalesce(btrim(a->>'coach_name'), '') = '' or coalesce(a->>'coach_birth_date', '') = ''
      or coalesce(btrim(a->>'coach_workplace'), '') = '' or coalesce(btrim(a->>'coach_position'), '') = ''))
    then raise exception 'application_incomplete'; end if;

  res := save_registration(p_tournament, p_team, p_actor, p_main, coalesce(p_sub, '{}'));
  insert into tournament_applications(registration_id, tournament_id, organization, captain_phone, responsible_name, responsible_phone,
      coach_name, coach_birth_date, coach_workplace, coach_position)
    values((res->>'id')::uuid, p_tournament, btrim(a->>'organization'), a->>'captain_phone', a->>'responsible_name', a->>'responsible_phone',
      nullif(a->>'coach_name', ''), nullif(a->>'coach_birth_date', '')::date, nullif(a->>'coach_workplace', ''), nullif(a->>'coach_position', ''))
    on conflict (registration_id) do update set organization = excluded.organization, captain_phone = excluded.captain_phone,
      responsible_name = excluded.responsible_name, responsible_phone = excluded.responsible_phone,
      coach_name = excluded.coach_name, coach_birth_date = excluded.coach_birth_date, coach_workplace = excluded.coach_workplace,
      coach_position = excluded.coach_position,
      -- другой тренер — прежняя отметка о его документах не действует
      coach_documents_at = case when tournament_applications.coach_name is not distinct from excluded.coach_name
        and tournament_applications.coach_birth_date is not distinct from excluded.coach_birth_date
        then tournament_applications.coach_documents_at end,
      coach_documents_by = case when tournament_applications.coach_name is not distinct from excluded.coach_name
        and tournament_applications.coach_birth_date is not distinct from excluded.coach_birth_date
        then tournament_applications.coach_documents_by end,
      updated_at = now();
  return res;
end;
$$;

-- После турнира: удалить данные заявок (организация, капитан/ответственный, тренер) и отметки документов.
-- Составы, матчи и статистика остаются. Только для завершённого или отменённого турнира.
create function public.purge_official_application_data(p_tournament uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare t tournaments; apps int; docs int;
begin
  select * into t from tournaments where id = p_tournament for update;
  if not found then raise exception 'tournament_missing'; end if;
  if t.status not in ('finished', 'cancelled') then raise exception 'tournament_not_finished'; end if;
  delete from tournament_applications where tournament_id = p_tournament;
  get diagnostics apps = row_count;
  delete from tournament_participant_documents where tournament_id = p_tournament;
  get diagnostics docs = row_count;
  return jsonb_build_object('applications', apps, 'documents', docs);
end;
$$;

revoke execute on function public.save_official_registration(uuid, uuid, uuid, uuid[], uuid[], jsonb) from public, anon, authenticated;
revoke execute on function public.purge_official_application_data(uuid) from public, anon, authenticated;
grant execute on function public.save_official_registration(uuid, uuid, uuid, uuid[], uuid[], jsonb) to service_role;
grant execute on function public.purge_official_application_data(uuid) to service_role;
