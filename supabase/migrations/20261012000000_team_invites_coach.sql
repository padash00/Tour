-- Тренер команды: аккаунт на сайте, один на команду. Не игрок — не считается в основу/запас и не идёт на сервер.
-- Хранится в teams, а не в team_members: тренер может вести несколько команд, а членство игрока остаётся одним.
alter table teams add column coach_id uuid references players(id) on delete set null;
create index teams_coach on teams (coach_id) where coach_id is not null;

-- Личные приглашения: капитан находит игрока по нику и зовёт игроком или тренером, тот подтверждает.
-- Приглашение «висит» 7 дней — просроченные просто не показываются (без фоновой очистки).
create table team_invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  role        text not null check (role in ('player', 'coach')),
  invited_by  uuid references players(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index team_invites_one_pending on team_invites (team_id, player_id) where status = 'pending';
create index team_invites_team on team_invites (team_id, status, created_at desc);
create index team_invites_player on team_invites (player_id, status, created_at desc);

-- только сервер (service role) — читают и пишут server actions
alter table team_invites enable row level security;

-- Пригласить: проверка капитана и свободных мест под блокировкой команды.
-- Ожидающие приглашения игроков занимают места — капитан не раздаст больше приглашений, чем мест в составе.
create function public.create_team_invite(p_team uuid, p_actor uuid, p_player uuid, p_role text, p_max_total int, p_ttl_days int) returns uuid
language plpgsql security invoker set search_path = public as $$
declare tm teams; taken int; inv_id uuid;
begin
  select * into tm from teams where id = p_team for update;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null or tm.is_solo then raise exception 'captain_required'; end if;
  if p_player = p_actor then raise exception 'self'; end if;
  if exists(select 1 from team_members where team_id = p_team and player_id = p_player and left_at is null) then raise exception 'already_in_team'; end if;
  if exists(select 1 from team_invites where team_id = p_team and player_id = p_player and status = 'pending'
            and created_at > now() - make_interval(days => p_ttl_days)) then raise exception 'already_invited'; end if;
  if p_role = 'player' then
    if exists(select 1 from team_members where player_id = p_player and left_at is null and not is_solo) then raise exception 'already_member'; end if;
    select (select count(*) from team_members where team_id = p_team and left_at is null)
         + (select count(*) from team_invites where team_id = p_team and role = 'player' and status = 'pending'
            and created_at > now() - make_interval(days => p_ttl_days))
      into taken;
    if taken >= p_max_total then raise exception 'no_slots'; end if;
  elsif p_role = 'coach' then
    if tm.coach_id is not null then raise exception 'coach_taken'; end if;
    if exists(select 1 from team_invites where team_id = p_team and role = 'coach' and status = 'pending'
              and created_at > now() - make_interval(days => p_ttl_days)) then raise exception 'coach_invited'; end if;
  else
    raise exception 'bad_role';
  end if;
  -- просроченное приглашение того же игрока не мешает новому
  update team_invites set status = 'cancelled', decided_at = now() where team_id = p_team and player_id = p_player and status = 'pending';
  insert into team_invites(team_id, player_id, role, invited_by) values(p_team, p_player, p_role, p_actor) returning id into inv_id;
  return inv_id;
end;
$$;

-- Принять: игрок вступает через join_team (те же лимиты, что по ссылке) или становится тренером — одной транзакцией.
create function public.accept_team_invite(p_invite uuid, p_player uuid, p_max_main int, p_max_subs int, p_ttl_days int) returns text
language plpgsql security invoker set search_path = public as $$
declare inv team_invites; tm teams; r text;
begin
  select * into inv from team_invites where id = p_invite for update;
  if not found or inv.player_id <> p_player or inv.status <> 'pending' or inv.created_at <= now() - make_interval(days => p_ttl_days) then
    raise exception 'invite_missing';
  end if;
  select * into tm from teams where id = inv.team_id for update;
  if not found or tm.disbanded_at is not null then raise exception 'team_missing'; end if;
  if inv.role = 'player' then
    if tm.coach_id = p_player then raise exception 'is_coach'; end if;
    r := public.join_team(inv.team_id, p_player, p_max_main, p_max_subs);
    update team_applications set status = 'cancelled', decided_at = now() where player_id = p_player and status = 'pending';
    update team_invites set status = 'cancelled', decided_at = now()
      where player_id = p_player and role = 'player' and status = 'pending' and id <> inv.id;
  else
    if tm.coach_id is not null and tm.coach_id <> p_player then raise exception 'coach_taken'; end if;
    if exists(select 1 from team_members where team_id = inv.team_id and player_id = p_player and left_at is null) then raise exception 'already_in_team'; end if;
    update teams set coach_id = p_player where id = inv.team_id;
    r := 'coach';
  end if;
  update team_invites set status = 'accepted', decided_at = now() where id = inv.id;
  return r;
end;
$$;

revoke execute on function public.create_team_invite(uuid, uuid, uuid, text, int, int) from public, anon, authenticated;
revoke execute on function public.accept_team_invite(uuid, uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.create_team_invite(uuid, uuid, uuid, text, int, int) to service_role;
grant execute on function public.accept_team_invite(uuid, uuid, int, int, int) to service_role;
