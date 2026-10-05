-- Critical writes are single transactions. These functions are server-only;
-- Steam identity is resolved by the Server Action, never accepted from the browser.
create function public.save_registration(p_tournament uuid, p_team uuid, p_actor uuid, p_main uuid[], p_sub uuid[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t tournaments; tm teams; r tournament_registrations;
  n int; subs int; was_active boolean; auto boolean := false;
begin
  select * into t from tournaments where id = p_tournament for update;
  if not found or t.status <> 'registration' or t.registration_closes_at < now()
    or t.registration_opens_at > now() then raise exception 'registration_closed'; end if;
  select * into tm from teams where id = p_team for update;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null then raise exception 'captain_required'; end if;
  if not exists(select 1 from players where id = p_actor and not is_banned) then raise exception 'player_banned'; end if;
  n := case t.format when '1v1' then 1 when '2v2' then 2 else 5 end;
  subs := case n when 1 then 0 when 2 then 1 else 2 end;
  if p_main is null or p_sub is null or cardinality(p_main) <> n or cardinality(p_sub) > subs
    or cardinality(p_main || p_sub) <> (select count(distinct x) from unnest(p_main || p_sub) x)
    then raise exception 'invalid_roster'; end if;
  -- Hold membership/player rows until the roster has been written.
  perform 1 from team_members where team_id = p_team and player_id = any(p_main || p_sub) and left_at is null for share;
  if (select count(*) from team_members where team_id = p_team and player_id = any(p_main || p_sub) and left_at is null)
      <> cardinality(p_main || p_sub) then raise exception 'membership_changed'; end if;
  perform 1 from players where id = any(p_main || p_sub) for share;
  if exists(select 1 from players where id = any(p_main || p_sub) and is_banned) then raise exception 'player_banned'; end if;
  select * into r from tournament_registrations where tournament_id = p_tournament and team_id = p_team for update;
  was_active := found and r.status in ('pending', 'approved');
  if r.id is null then
    insert into tournament_registrations(tournament_id, team_id) values(p_tournament, p_team) returning * into r;
  elsif not was_active then
    update tournament_registrations set status = 'pending', note = null, decided_by = null, decided_at = null,
      checked_in_at = null, checked_in_by = null, seed = null where id = r.id returning * into r;
  end if;
  delete from tournament_roster_players where registration_id = r.id;
  insert into tournament_roster_players(registration_id, tournament_id, player_id, role)
    select r.id, p_tournament, x, 'main'::roster_role from unnest(p_main) x
    union all select r.id, p_tournament, x, 'sub'::roster_role from unnest(p_sub) x;
  -- Unique(tournament_id, player_id) rolls back the entire operation on conflict.
  if not was_active and t.auto_approve and
    (select count(*) from tournament_registrations where tournament_id = p_tournament and status = 'approved') < t.max_teams then
    update tournament_registrations set status = 'approved', decided_at = now(), note = 'одобрено автоматически' where id = r.id;
    auto := true;
  end if;
  return jsonb_build_object('id', r.id, 'updated', was_active, 'approved', auto);
end;
$$;

-- All approval writers share the same lock, including administrative actions.
create function public.guard_registration_capacity() returns trigger
language plpgsql security invoker set search_path = public as $$
declare cap int;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and old.tournament_id = new.tournament_id then return new; end if;
  select max_teams into cap from tournaments where id = new.tournament_id for update;
  if (select count(*) from tournament_registrations where tournament_id = new.tournament_id and status = 'approved' and id <> new.id) >= cap
    then raise exception 'tournament_full'; end if;
  return new;
end;
$$;
create trigger registration_capacity before insert or update of status, tournament_id on tournament_registrations
  for each row execute function public.guard_registration_capacity();

create function public.change_registration(p_registration uuid, p_actor uuid, p_status registration_status, p_note text default null, p_admin boolean default false)
returns boolean language plpgsql security invoker set search_path = public as $$
declare r tournament_registrations; t tournaments; admin boolean;
begin
  select * into t from tournaments where id = (select tournament_id from tournament_registrations where id = p_registration) for update;
  select * into r from tournament_registrations where id = p_registration for update;
  if not found then raise exception 'registration_missing'; end if;
  -- p_admin is set only after requireAdmin(); it also supports ADMIN_STEAM_IDS.
  select p_admin and not is_banned into admin from players where id = p_actor;
  if not coalesce(admin, false) then
    if p_status <> 'withdrawn' or t.status <> 'registration' or not exists(
      select 1 from teams join players on players.id = teams.captain_id where teams.id = r.team_id and captain_id = p_actor and not players.is_banned
    ) then raise exception 'captain_required'; end if;
    if r.status not in ('pending', 'approved', 'withdrawn') then raise exception 'registration_missing'; end if;
  end if;
  if r.status = p_status then return false; end if;
  if p_status = 'approved' then
    if (select count(*) from tournament_roster_players where registration_id = r.id and role = 'main') <>
      (case t.format when '1v1' then 1 when '2v2' then 2 else 5 end) then raise exception 'invalid_roster'; end if;
    if exists(select 1 from tournament_roster_players rp join players p on p.id = rp.player_id where registration_id = r.id and p.is_banned)
      then raise exception 'player_banned'; end if;
  end if;
  update tournament_registrations set status = p_status, note = p_note, decided_by = p_actor, decided_at = now(),
    checked_in_at = case when p_status = 'approved' then checked_in_at end,
    checked_in_by = case when p_status = 'approved' then checked_in_by end where id = r.id;
  if p_status in ('rejected', 'withdrawn') then delete from tournament_roster_players where registration_id = r.id; end if;
  return true;
end;
$$;

create function public.check_in_registration(p_registration uuid, p_actor uuid, p_admin boolean default false, p_undo boolean default false)
returns boolean language plpgsql security invoker set search_path = public as $$
declare r tournament_registrations; t tournaments;
begin
  select * into t from tournaments where id = (select tournament_id from tournament_registrations where id = p_registration) for update;
  select * into r from tournament_registrations where id = p_registration for update;
  if not found or r.status <> 'approved' then raise exception 'registration_missing'; end if;
  if p_admin then
    if not exists(select 1 from players where id = p_actor and not is_banned) then raise exception 'captain_required'; end if;
  else
    if p_undo or not exists(select 1 from teams join players on players.id = teams.captain_id
      where teams.id = r.team_id and captain_id = p_actor and not players.is_banned) then raise exception 'captain_required'; end if;
    if t.status <> 'checkin' or t.checkin_opens_at > now() or t.checkin_closes_at < now() then raise exception 'checkin_closed'; end if;
  end if;
  if p_undo then
    update tournament_registrations set checked_in_at = null, checked_in_by = null where id = r.id;
    return r.checked_in_at is not null;
  end if;
  if r.checked_in_at is not null then return false; end if;
  if (select count(*) from tournament_roster_players where registration_id = r.id and role = 'main') <>
    (case t.format when '1v1' then 1 when '2v2' then 2 else 5 end) then raise exception 'invalid_roster'; end if;
  if exists(select 1 from tournament_roster_players rp join players p on p.id = rp.player_id
    where registration_id = r.id and (p.is_banned or p.steam_id !~ '^[0-9]{17}$')) then raise exception 'invalid_player'; end if;
  update tournament_registrations set checked_in_at = now(), checked_in_by = p_actor where id = r.id;
  return true;
end;
$$;

-- One allocation lock covers tournament matches AND lobbies. Queueing the load
-- and moving the old match happen in the same transaction as the reservation.
create function public.assign_game_server(p_game uuid, p_instance text, p_lobby boolean default false, p_actor uuid default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare inst server_instances; old_instance text; old_state text; mid bigint; bots boolean := false;
begin
  perform pg_advisory_xact_lock(16160001);
  if not exists(select 1 from server_host where id = 'main' and last_seen_at > now() - interval '30 seconds'
    and coalesce(info->>'busy', '') = '') then return false; end if;
  select * into inst from server_instances where name = p_instance for update;
  if not found or not inst.running or coalesce(inst.gamestate, 'none') <> 'none' or inst.for_lobby <> p_lobby
    or inst.last_seen_at is null or inst.last_seen_at < now() - interval '30 seconds' then return false; end if;
  if p_lobby then
    select server_instance, server_state, matchzy_id, jsonb_array_length(team1->'bots') + jsonb_array_length(team2->'bots') > 0
      into old_instance, old_state, mid, bots from lobby_games where id = p_game and status = 'waiting' for update;
  else
    select server_instance, server_state, matchzy_id into old_instance, old_state, mid from matches
      where id = p_game and status in ('ready', 'live') for update;
  end if;
  if not found then return false; end if;
  if old_instance = p_instance and old_state in ('loading', 'ready') then return false; end if;
  if exists(select 1 from matches where server_instance = p_instance and status in ('ready', 'live') and id <> p_game)
    or exists(select 1 from lobby_games where server_instance = p_instance and status in ('waiting', 'live') and id <> p_game)
    or exists(select 1 from agent_commands where instance = p_instance and status in ('pending', 'sent')
      and type in ('stop', 'restart', 'end_match', 'load_match')) then return false; end if;
  if old_instance is not null and old_instance <> p_instance then
    insert into agent_commands(instance, type, created_by) values(old_instance, 'end_match', p_actor);
  end if;
  if p_lobby then
    update lobby_games set server_instance = p_instance, server_state = 'loading', server_address = null,
      server_assigned_at = now(), server_ready_at = null, note = 'загружаем матч на ' || p_instance where id = p_game;
  else
    update matches set server_instance = p_instance, server_state = 'loading', server_address = null, server_password = null,
      server_assigned_at = now(), server_ready_at = null where id = p_game;
  end if;
  insert into agent_commands(instance, type, payload, created_by) values(p_instance, 'load_match',
    jsonb_build_object('match_id', p_game, 'matchzy_id', mid, 'lobby', p_lobby, 'autostart_off', bots), p_actor);
  return true;
end;
$$;

alter table agent_commands add column delivery_at timestamptz;
alter table agent_commands add column delivery_attempts int not null default 0;
create index agent_commands_inflight on agent_commands(delivery_at) where status = 'sent';
create function public.claim_agent_commands(p_replay boolean default false)
returns setof agent_commands language sql security invoker set search_path = public as $$
  with picked as (
    select id from agent_commands where status = 'pending' or
      (p_replay and status = 'sent' and delivery_at < now() - interval '30 seconds')
    order by created_at, id limit 20 for update skip locked
  )
  update agent_commands c set status = 'sent', sent_at = coalesce(c.sent_at, now()),
    delivery_at = now(), delivery_attempts = delivery_attempts + 1
  from picked where c.id = picked.id returning c.*;
$$;

create index audit_logs_actor_action_time on audit_logs(actor_id, action, created_at desc);
create index registrations_tournament_status on tournament_registrations(tournament_id, status);
create index roster_registration on tournament_roster_players(registration_id);
create index commands_instance_status on agent_commands(instance, status);
create index matches_server on matches(server_instance);
create index lobby_games_server on lobby_games(server_instance);

-- Completion is recorded only after successful processing. A concurrent retry
-- receives "busy", and a crashed worker's lease can be reclaimed.
alter table ingest_dedupe add column completed_at timestamptz default now();
alter table ingest_dedupe alter column completed_at drop default;
alter table ingest_dedupe add column lease_until timestamptz;
alter table ingest_dedupe add column lease_token uuid;
create function public.claim_ingest(p_key text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r ingest_dedupe; token uuid := gen_random_uuid();
begin
  insert into ingest_dedupe(key, lease_until, lease_token) values(p_key, now() + interval '2 minutes', token) on conflict do nothing;
  select * into r from ingest_dedupe where key = p_key for update;
  if r.completed_at is not null then return jsonb_build_object('status','done'); end if;
  if r.lease_token <> token and r.lease_until > now() then return jsonb_build_object('status','busy'); end if;
  update ingest_dedupe set lease_until = now() + interval '2 minutes', lease_token = token where key = p_key;
  return jsonb_build_object('status','claimed','token',token);
end;
$$;

create function public.recompute_match_series(p_match uuid, p_advantage int default 1) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare m matches; s1 int; s2 int; advantage int; winner uuid;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.status = 'cancelled' then return null; end if;
  if m.status = 'finished' then return jsonb_build_object('tournament_id',m.tournament_id,'winner',m.winner_id); end if;
  advantage := case when m.bracket = 'grand_final' and m.best_of >= 3 then p_advantage else 0 end;
  select count(*) filter (where winner_id = m.team1_id), count(*) filter (where winner_id = m.team2_id)
    into s1,s2 from match_maps where match_id = p_match and status = 'finished';
  s1 := s1 + advantage;
  winner := case when s1 >= m.best_of / 2 + 1 then m.team1_id when s2 >= m.best_of / 2 + 1 then m.team2_id end;
  update matches set team1_score=s1, team2_score=s2, winner_id=winner,
    status=case when winner is not null then 'finished'::match_status else status end,
    finished_at=case when winner is not null then coalesce(finished_at,now()) else finished_at end where id=p_match;
  if winner is not null then
    if advantage > 0 and winner = m.team1_id and m.server_instance is not null then
      insert into agent_commands(instance,type) values(m.server_instance,'end_match');
      update matches set server_instance=null, server_state=null, server_address=null where id=p_match;
    end if;
    delete from match_maps where match_id=p_match and status='pending';
  end if;
  return jsonb_build_object('tournament_id',m.tournament_id,'winner',winner);
end;
$$;

revoke execute on function public.save_registration(uuid, uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function public.guard_registration_capacity() from public, anon, authenticated;
revoke execute on function public.change_registration(uuid, uuid, registration_status, text, boolean) from public, anon, authenticated;
revoke execute on function public.check_in_registration(uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.assign_game_server(uuid, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.claim_agent_commands(boolean) from public, anon, authenticated;
grant execute on function public.save_registration(uuid, uuid, uuid, uuid[], uuid[]) to service_role;
grant execute on function public.guard_registration_capacity() to service_role;
grant execute on function public.change_registration(uuid, uuid, registration_status, text, boolean) to service_role;
grant execute on function public.check_in_registration(uuid, uuid, boolean, boolean) to service_role;
grant execute on function public.assign_game_server(uuid, text, boolean, uuid) to service_role;
grant execute on function public.claim_agent_commands(boolean) to service_role;
revoke execute on function public.claim_ingest(text) from public, anon, authenticated;
revoke execute on function public.recompute_match_series(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_ingest(text) to service_role;
grant execute on function public.recompute_match_series(uuid, int) to service_role;

create function public.save_match_map_score(p_match uuid, p_map uuid, p_score1 int, p_score2 int, p_finish boolean, p_advantage int default 1)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare m matches; mp match_maps; result jsonb;
begin
  select * into m from matches where id=p_match for update;
  if not found or m.status <> 'live' then raise exception 'match_not_live'; end if;
  if p_score1 not between 0 and 99 or p_score2 not between 0 and 99 or (p_finish and p_score1=p_score2)
    then raise exception 'invalid_score'; end if;
  update match_maps set team1_score=p_score1,team2_score=p_score2,
    status=case when p_finish then 'finished' else 'live' end,
    winner_id=case when p_finish then case when p_score1>p_score2 then m.team1_id else m.team2_id end end
    where id=p_map and match_id=p_match returning * into mp;
  if not found then raise exception 'map_missing'; end if;
  result := recompute_match_series(p_match,p_advantage);
  if p_finish and result->>'winner' is null then
    update match_maps set status='live' where id=(select id from match_maps
      where match_id=p_match and map_number>mp.map_number and status='pending' order by map_number limit 1);
  end if;
  return result;
end;
$$;
revoke execute on function public.save_match_map_score(uuid,uuid,int,int,boolean,int) from public,anon,authenticated;
grant execute on function public.save_match_map_score(uuid,uuid,int,int,boolean,int) to service_role;

alter table match_log_state add column revision bigint not null default 0;
create function public.start_map_logging(p_match uuid, p_map int) returns void
language sql security invoker set search_path = public as $$
  insert into match_log_state(match_id,live,map_number) values(p_match,true,p_map)
  on conflict(match_id) do update set live=true,map_number=p_map,round_number=0,roster='{}',buffer='[]',
    revision=match_log_state.revision+1,updated_at=now() where match_log_state.map_number < p_map;
$$;

create function public.commit_log_batch(p_match uuid,p_map int,p_revision bigint,p_roster jsonb,p_buffer jsonb,p_rounds jsonb,p_key text,p_token uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare s match_log_state;
begin
  select * into s from match_log_state where match_id=p_match for update;
  if not found or not s.live or s.map_number <> p_map or s.revision <> p_revision then raise exception 'log_state_changed'; end if;
  perform 1 from ingest_dedupe where key=p_key and lease_token=p_token and completed_at is null for update;
  if not found then raise exception 'ingest_lease_changed'; end if;
  insert into match_rounds(match_id,map_number,round_number,winner_side,events,swing)
    select p_match,p_map,(r->>'round_number')::int,r->>'winner_side',r->'events',r->'swing' from jsonb_array_elements(p_rounds) r
    on conflict(match_id,map_number,round_number) do update set winner_side=excluded.winner_side,events=excluded.events,swing=excluded.swing;
  if jsonb_array_length(p_rounds)>0 then
    -- Recompute totals from unique saved rounds; never increment on retry.
    insert into player_map_swing(match_id,map_number,steam_id,swing_sum,rounds)
      select p_match,p_map,e.key,sum(e.value::double precision),count(*) from match_rounds r,
        lateral jsonb_each_text(r.swing) e where r.match_id=p_match and r.map_number=p_map group by e.key
      on conflict(match_id,map_number,steam_id) do update set swing_sum=excluded.swing_sum,rounds=excluded.rounds;
  end if;
  update match_log_state set roster=p_roster,buffer=p_buffer,round_number=s.round_number+jsonb_array_length(p_rounds),revision=s.revision+1,updated_at=now() where match_id=p_match;
  update ingest_dedupe set completed_at=now(),lease_until=null where key=p_key and lease_token=p_token;
end;
$$;
revoke execute on function public.start_map_logging(uuid,int) from public,anon,authenticated;
revoke execute on function public.commit_log_batch(uuid,int,bigint,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.start_map_logging(uuid,int) to service_role;
grant execute on function public.commit_log_batch(uuid,int,bigint,jsonb,jsonb,jsonb,text,uuid) to service_role;
