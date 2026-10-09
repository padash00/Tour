-- Заявки игроков на вступление в команду. Решает капитан: принять (игрок вступает через join_team) или отклонить.
-- Заявка «висит» 7 дней — просроченные просто не показываются и не считаются (без фоновой очистки).
create table team_applications (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  message     text,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references players(id) on delete set null
);

-- одна заявка игрока в одну команду (повторную можно подать после решения)
create unique index team_applications_one_pending on team_applications (team_id, player_id) where status = 'pending';
create index team_applications_team on team_applications (team_id, status, created_at desc);
create index team_applications_player on team_applications (player_id, status, created_at desc);

-- только сервер (service role) — читают и пишут server actions
alter table team_applications enable row level security;

-- капитан может закрыть приём заявок
alter table teams add column accepts_applications boolean not null default true;

-- Подать заявку: лимит активных заявок игрока и пауза после отказа считаются под блокировкой игрока,
-- два одновременных запроса не обойдут лимит.
create function public.apply_to_team(p_team uuid, p_player uuid, p_message text, p_limit int, p_ttl_days int, p_cooldown_hours int) returns uuid
language plpgsql security invoker set search_path = public as $$
declare tm teams; app_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('team_applications:' || p_player::text));
  select * into tm from teams where id = p_team;
  if not found or tm.disbanded_at is not null or tm.is_solo then raise exception 'team_missing'; end if;
  if not tm.accepts_applications then raise exception 'applications_closed'; end if;
  if exists(select 1 from team_members where player_id = p_player and left_at is null and not is_solo) then raise exception 'already_member'; end if;
  if exists(select 1 from team_applications where team_id = p_team and player_id = p_player and status = 'pending'
            and created_at > now() - make_interval(days => p_ttl_days)) then raise exception 'already_applied'; end if;
  if exists(select 1 from team_applications where team_id = p_team and player_id = p_player and status = 'declined'
            and decided_at > now() - make_interval(hours => p_cooldown_hours)) then raise exception 'cooldown'; end if;
  if (select count(*) from team_applications where player_id = p_player and status = 'pending'
      and created_at > now() - make_interval(days => p_ttl_days)) >= p_limit then raise exception 'limit'; end if;
  -- просроченная заявка в эту же команду не мешает подать новую
  update team_applications set status = 'cancelled', decided_at = now()
    where team_id = p_team and player_id = p_player and status = 'pending';
  insert into team_applications(team_id, player_id, message) values(p_team, p_player, nullif(btrim(p_message), ''))
    returning id into app_id;
  return app_id;
end;
$$;

-- Принять заявку: проверка капитана, вступление (те же лимиты, что по ссылке) и отмена остальных заявок игрока — одной транзакцией.
create function public.accept_team_application(p_application uuid, p_actor uuid, p_max_main int, p_max_subs int, p_ttl_days int) returns text
language plpgsql security invoker set search_path = public as $$
declare app team_applications; tm teams; r text;
begin
  select * into app from team_applications where id = p_application for update;
  if not found or app.status <> 'pending' or app.created_at <= now() - make_interval(days => p_ttl_days) then raise exception 'application_missing'; end if;
  select * into tm from teams where id = app.team_id;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null then raise exception 'captain_required'; end if;
  r := public.join_team(app.team_id, app.player_id, p_max_main, p_max_subs);
  update team_applications set status = 'accepted', decided_at = now(), decided_by = p_actor where id = app.id;
  update team_applications set status = 'cancelled', decided_at = now()
    where player_id = app.player_id and status = 'pending' and id <> app.id;
  return r;
end;
$$;

revoke execute on function public.apply_to_team(uuid, uuid, text, int, int, int) from public, anon, authenticated;
revoke execute on function public.accept_team_application(uuid, uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.apply_to_team(uuid, uuid, text, int, int, int) to service_role;
grant execute on function public.accept_team_application(uuid, uuid, int, int, int) to service_role;
