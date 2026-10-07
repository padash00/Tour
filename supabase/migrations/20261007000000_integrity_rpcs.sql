-- Целостность данных: многошаговые записи сетки, вето, команд и ограничения частоты — одной транзакцией.
-- Функции только для service role; права игрока проверяет Server Action, сюда приходят доверенные id.

-- ───────────────────────── сетка
-- Сайт считает сетку (resolveBracket) по снимку матчей и присылает снимок вместе с изменениями.
-- Под блокировкой строк плей-офф снимок сверяется с базой: если кто-то успел изменить сетку
-- (результат, параллельный пересчёт), ничего не пишется — сайт перечитывает и считает заново.
create function public.sync_bracket_apply(p_tournament uuid, p_expected jsonb, p_updates jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare stale boolean; upcoming uuid[];
begin
  perform pg_advisory_xact_lock(16160010, hashtext(p_tournament::text));
  perform 1 from matches where tournament_id = p_tournament and stage = 'playoff' order by id for update;
  select (select count(*) from matches where tournament_id = p_tournament and stage = 'playoff') <> jsonb_array_length(p_expected)
    or exists(
      select 1 from jsonb_to_recordset(p_expected) as e(id uuid, status match_status, team1_id uuid, team2_id uuid, winner_id uuid, is_walkover boolean)
      left join matches m on m.id = e.id and m.tournament_id = p_tournament and m.stage = 'playoff'
      where m.id is null or m.status <> e.status or m.team1_id is distinct from e.team1_id or m.team2_id is distinct from e.team2_id
        or m.winner_id is distinct from e.winner_id or m.is_walkover <> e.is_walkover)
    into stale;
  if stale then return jsonb_build_object('status', 'conflict'); end if;
  if exists(select 1 from jsonb_to_recordset(p_updates) as u(id uuid) where not exists(
    select 1 from jsonb_to_recordset(p_expected) as e(id uuid) where e.id = u.id)) then raise exception 'bracket_update_unknown_match'; end if;

  select coalesce(array_agg(m.id), '{}') into upcoming
    from jsonb_to_recordset(p_updates) as u(id uuid, status match_status) join matches m on m.id = u.id
    where m.status <> 'upcoming' and u.status = 'upcoming';
  update matches m set team1_id = u.team1_id, team2_id = u.team2_id, status = u.status, winner_id = u.winner_id,
      is_walkover = u.is_walkover,
      finished_at = case when u.status = 'finished' and m.finished_at is null then now() else m.finished_at end
    from jsonb_to_recordset(p_updates) as u(id uuid, status match_status, team1_id uuid, team2_id uuid, winner_id uuid, is_walkover boolean)
    where m.id = u.id;
  return jsonb_build_object('status', 'ok', 'upcoming', to_jsonb(upcoming));
end;
$$;

-- Матчи новой стадии и отметка о ней записываются вместе. Повтор (двойной клик, параллельный
-- пересчёт, повтор после ошибки) возвращает false и ничего не создаёт.
--   bracket — первая стадия турнира (bracket_published_at), playoff — плей-офф после групп/швейцарки
--   (playoff_created_at), round — следующий тур швейцарки (по номеру тура).
-- Номера матчей в p_rows относительные (1, 2, …): сквозной номер назначается под блокировкой турнира.
create function public.create_stage_matches(p_tournament uuid, p_mode text, p_rows jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
declare t tournaments; base int; head jsonb := p_rows->0;
begin
  select * into t from tournaments where id = p_tournament for update;
  if not found then raise exception 'tournament_missing'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'stage_rows_missing'; end if;
  if p_mode = 'bracket' then
    if t.bracket_published_at is not null or exists(select 1 from matches where tournament_id = p_tournament) then return false; end if;
  elsif p_mode = 'playoff' then
    if t.playoff_created_at is not null or exists(select 1 from matches where tournament_id = p_tournament and stage = 'playoff') then return false; end if;
  elsif p_mode = 'round' then
    if exists(select 1 from matches where tournament_id = p_tournament and stage = head->>'stage' and round = (head->>'round')::int) then return false; end if;
  else
    raise exception 'invalid_stage_mode';
  end if;
  select coalesce(max(number), 0) into base from matches where tournament_id = p_tournament;
  insert into matches(id, tournament_id, number, bracket, stage, group_label, round, position, best_of, status,
      team1_id, team2_id, winner_id, is_walkover, finished_at, winner_to_match, winner_to_slot, loser_to_match, loser_to_slot)
    select r.id, p_tournament, base + r.number, r.bracket, coalesce(r.stage, 'playoff'), r.group_label, r.round, r.position,
      coalesce(r.best_of, 1), r.status, r.team1_id, r.team2_id, r.winner_id, coalesce(r.is_walkover, false), r.finished_at,
      r.winner_to_match, r.winner_to_slot, r.loser_to_match, r.loser_to_slot
    from jsonb_to_recordset(p_rows) as r(id uuid, number int, bracket bracket_side, stage text, group_label text, round int,
      position int, best_of int, status match_status, team1_id uuid, team2_id uuid, winner_id uuid, is_walkover boolean,
      finished_at timestamptz, winner_to_match uuid, winner_to_slot int, loser_to_match uuid, loser_to_slot int);
  if p_mode = 'bracket' then
    update tournaments set bracket_published_at = now() where id = p_tournament;
  elsif p_mode = 'playoff' then
    update tournaments set playoff_created_at = now() where id = p_tournament;
  end if;
  return true;
end;
$$;

-- ───────────────────────── вето
-- Завершение вето: карты серии (пики по порядку, затем decider) и статус «готов» — одной транзакцией
-- под блокировкой матча. Повторный вызов (таймер вето и ход капитана одновременно) возвращает false.
-- p_single_map — маппул из одной карты: вето нет, карта играется best_of раз (из статуса upcoming).
create function public.finish_veto(p_match uuid, p_single_map text default null) returns boolean
language plpgsql security invoker set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if not found then return false; end if;
  if p_single_map is not null then
    if m.status <> 'upcoming' then return false; end if;
    delete from match_maps where match_id = p_match;
    insert into match_maps(match_id, map_number, map_name)
      select p_match, g, p_single_map from generate_series(1, greatest(1, m.best_of)) g;
  else
    if m.status <> 'veto' or not exists(select 1 from veto_actions where match_id = p_match and action = 'decider') then return false; end if;
    delete from match_maps where match_id = p_match;
    insert into match_maps(match_id, map_number, map_name, picked_by)
      select p_match, row_number() over (order by step), map_name, case when action = 'pick' then team_id end
      from veto_actions where match_id = p_match and action in ('pick', 'decider');
  end if;
  update matches set status = 'ready', veto_deadline = null where id = p_match;
  return true;
end;
$$;

-- ───────────────────────── команды
-- Вступление по приглашению: строка команды блокируется, места считаются и игрок добавляется вместе —
-- два одновременных вступления не переполнят состав.
create function public.join_team(p_team uuid, p_player uuid, p_max_main int, p_max_subs int) returns text
language plpgsql security invoker set search_path = public as $$
declare tm teams; mains int; subs int; r member_role;
begin
  select * into tm from teams where id = p_team for update;
  if not found or tm.disbanded_at is not null or tm.is_solo then raise exception 'team_missing'; end if;
  if exists(select 1 from team_members where player_id = p_player and left_at is null and not is_solo) then raise exception 'already_member'; end if;
  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute') into mains, subs
    from team_members where team_id = p_team and left_at is null;
  r := case when mains < p_max_main then 'player'::member_role when subs < p_max_subs then 'substitute'::member_role end;
  if r is null then raise exception 'team_full'; end if;
  insert into team_members(team_id, player_id, role) values(p_team, p_player, r);
  return r::text;
end;
$$;

-- Передача капитанства: роли обоих игроков и captain_id команды меняются вместе.
create function public.transfer_team_captain(p_team uuid, p_actor uuid, p_member uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare tm teams; target team_members;
begin
  select * into tm from teams where id = p_team for update;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null then raise exception 'captain_required'; end if;
  select * into target from team_members where id = p_member and team_id = p_team and left_at is null for update;
  if not found or target.player_id = p_actor then raise exception 'member_missing'; end if;
  update team_members set role = case when target.role = 'substitute' then 'substitute'::member_role else 'player'::member_role end
    where team_id = p_team and player_id = p_actor and left_at is null;
  update team_members set role = 'captain' where id = target.id;
  update teams set captain_id = target.player_id where id = p_team;
  return target.player_id;
end;
$$;

-- ───────────────────────── ограничение частоты
-- true — действие ограничено. Успешные действия видны в audit_logs (окно p_seconds).
-- Отметка попытки закрывает гонку двух одновременных запросов: второй ждёт первый и видит отметку.
-- Окно отметки не больше 3 секунд — исправленная после ошибки формы попытка не блокируется надолго.
create table if not exists public.rate_limit_claims (
  actor_id   uuid not null,
  action     text not null,
  claimed_at timestamptz not null default now(),
  primary key (actor_id, action)
);
alter table public.rate_limit_claims enable row level security;

create function public.rate_limit_claim(p_actor uuid, p_action text, p_seconds int) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(16160011, hashtext(p_actor::text || ':' || p_action));
  if exists(select 1 from audit_logs where actor_id = p_actor and action = p_action
    and created_at >= now() - make_interval(secs => p_seconds)) then return true; end if;
  insert into rate_limit_claims(actor_id, action, claimed_at) values(p_actor, p_action, clock_timestamp())
    on conflict (actor_id, action) do update set claimed_at = excluded.claimed_at
    where rate_limit_claims.claimed_at <= clock_timestamp() - make_interval(secs => least(p_seconds, 3));
  return not found;
end;
$$;

-- ───────────────────────── лог карты
-- Перезапуск той же карты (карта не идёт) сбрасывает разбор; старое событие going_live
-- во время идущей карты по-прежнему ничего не сбрасывает.
create or replace function public.start_map_logging(p_match uuid, p_map int) returns void
language sql security invoker set search_path = public as $$
  insert into match_log_state(match_id,live,map_number) values(p_match,true,p_map)
  on conflict(match_id) do update set live=true,map_number=p_map,round_number=0,roster='{}',buffer='[]',
    revision=match_log_state.revision+1,updated_at=now()
  where match_log_state.map_number < p_map or (match_log_state.map_number = p_map and not match_log_state.live);
$$;

-- ───────────────────────── очистка
-- Удаляет старые записи журналов. Вызывается вручную или из задачи обслуживания:
--   select prune_old_rows();  -- значения по умолчанию
create function public.prune_old_rows(p_audit_days int default 180, p_event_days int default 365, p_command_days int default 30)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare audit int; events int; commands int; dedupe int; claims int;
begin
  if least(p_audit_days, p_event_days, p_command_days) < 7 then raise exception 'retention_too_short'; end if;
  delete from audit_logs where created_at < now() - make_interval(days => p_audit_days);
  get diagnostics audit = row_count;
  delete from match_events where received_at < now() - make_interval(days => p_event_days);
  get diagnostics events = row_count;
  delete from agent_commands where status in ('done', 'error') and created_at < now() - make_interval(days => p_command_days);
  get diagnostics commands = row_count;
  delete from ingest_dedupe where completed_at < now() - interval '30 days';
  get diagnostics dedupe = row_count;
  delete from rate_limit_claims where claimed_at < now() - interval '1 day';
  get diagnostics claims = row_count;
  return jsonb_build_object('audit_logs', audit, 'match_events', events, 'agent_commands', commands,
    'ingest_dedupe', dedupe, 'rate_limit_claims', claims);
end;
$$;

revoke all on public.rate_limit_claims from anon, authenticated;
revoke execute on function public.sync_bracket_apply(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.create_stage_matches(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_veto(uuid, text) from public, anon, authenticated;
revoke execute on function public.join_team(uuid, uuid, int, int) from public, anon, authenticated;
revoke execute on function public.transfer_team_captain(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rate_limit_claim(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.start_map_logging(uuid, int) from public, anon, authenticated;
revoke execute on function public.prune_old_rows(int, int, int) from public, anon, authenticated;
grant execute on function public.sync_bracket_apply(uuid, jsonb, jsonb) to service_role;
grant execute on function public.create_stage_matches(uuid, text, jsonb) to service_role;
grant execute on function public.finish_veto(uuid, text) to service_role;
grant execute on function public.join_team(uuid, uuid, int, int) to service_role;
grant execute on function public.transfer_team_captain(uuid, uuid, uuid) to service_role;
grant execute on function public.rate_limit_claim(uuid, text, int) to service_role;
grant execute on function public.start_map_logging(uuid, int) to service_role;
grant execute on function public.prune_old_rows(int, int, int) to service_role;
