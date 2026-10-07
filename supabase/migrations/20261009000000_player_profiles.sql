-- Анкета игрока: ФИО, дата рождения, телефон, город, место работы или учёбы, согласие на обработку
-- персональных данных (Закон РК «О персональных данных и их защите»).
-- Отдельная таблица, а не колонки players: players читают публичные страницы (select *), анкету —
-- только сервер для владельца и админов. RLS включён без политик: anon/authenticated не видят ничего.

create table if not exists public.player_profiles (
  player_id       uuid primary key references public.players(id) on delete cascade,
  last_name       text,
  first_name      text,
  patronymic      text,
  birth_date      date,
  phone           text,          -- +7XXXXXXXXXX (нормализует сайт)
  city            text,
  occupation      text,          -- works | studies | other
  organization    text,          -- место работы или учёбы
  position        text,          -- должность (работает)
  course          text,          -- курс / класс (учится)
  study_group     text,          -- группа (учится)
  consent_at      timestamptz,   -- согласие на обработку персональных данных
  consent_version text,          -- версия политики /privacy (или «paper» — согласие получено на бумаге)
  prompted_at     timestamptz,   -- когда после первого входа один раз отправили заполнить анкету
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.players(id) on delete set null,
  constraint player_profiles_occupation_known check (occupation is null or occupation in ('works', 'studies', 'other')),
  constraint player_profiles_birth_date_range check (birth_date is null or birth_date between date '1900-01-01' and date '2100-01-01'),
  constraint player_profiles_phone_format check (phone is null or phone ~ '^\+7[0-9]{10}$')
);
alter table public.player_profiles enable row level security;
revoke all on public.player_profiles from anon, authenticated;

-- подсказки организаций: различные названия без учёта регистра
create index if not exists player_profiles_organization on public.player_profiles(lower(organization)) where organization is not null;

-- Анкета заполнена: то же правило, что isProfileComplete в src/lib/profile.ts.
-- Организация обязательна для работающих и учащихся; должность — для работающих; курс и группа — для учащихся.
create function public.player_profile_complete(p public.player_profiles) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p.player_id is not null and p.consent_at is not null
    and coalesce(btrim(p.last_name), '') <> '' and coalesce(btrim(p.first_name), '') <> ''
    and p.birth_date is not null and p.phone is not null and coalesce(btrim(p.city), '') <> ''
    and p.occupation is not null
    and (p.occupation = 'other' or coalesce(btrim(p.organization), '') <> '')
    and (p.occupation <> 'works' or coalesce(btrim(p.position), '') <> '')
    and (p.occupation <> 'studies' or (coalesce(btrim(p.course), '') <> '' and coalesce(btrim(p.study_group), '') <> '')),
  false);
$$;

revoke execute on function public.player_profile_complete(public.player_profiles) from public, anon, authenticated;
grant execute on function public.player_profile_complete(public.player_profiles) to service_role;
