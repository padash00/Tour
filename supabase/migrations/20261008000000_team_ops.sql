-- Команды: роль и исключение под блокировкой команды, старые теги ведут на команду, индекс для ограничения частоты.

-- ───────────────────────── роль игрока
-- Счётчики основы/запасных читаются под блокировкой строки команды, как в join_team.
create function public.set_team_member_role(p_team uuid, p_actor uuid, p_member uuid, p_role text, p_max_main int, p_max_subs int) returns text
language plpgsql security invoker set search_path = public as $$
declare tm teams; target team_members; mains int; subs int;
begin
  if p_role not in ('player', 'substitute') then raise exception 'role_invalid'; end if;
  select * into tm from teams where id = p_team for update;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null then raise exception 'captain_required'; end if;
  select * into target from team_members where id = p_member and team_id = p_team and left_at is null for update;
  if not found or target.role = 'captain' then raise exception 'member_missing'; end if;
  if target.role::text = p_role then return p_role; end if;
  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute') into mains, subs
    from team_members where team_id = p_team and left_at is null;
  if p_role = 'player' and mains >= p_max_main then raise exception 'main_full'; end if;
  if p_role = 'substitute' and subs >= p_max_subs then raise exception 'subs_full'; end if;
  update team_members set role = p_role::member_role where id = target.id;
  return p_role;
end;
$$;

-- ───────────────────────── исключение
create function public.kick_team_member(p_team uuid, p_actor uuid, p_member uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare tm teams; target team_members;
begin
  select * into tm from teams where id = p_team for update;
  if not found or tm.captain_id <> p_actor or tm.disbanded_at is not null then raise exception 'captain_required'; end if;
  select * into target from team_members where id = p_member and team_id = p_team and left_at is null for update;
  if not found or target.player_id = p_actor then raise exception 'member_missing'; end if;
  update team_members set left_at = now() where id = target.id;
  return target.player_id;
end;
$$;

-- ───────────────────────── старые теги
-- После смены тега ссылки /teams/OLD ведут на команду. Тег, который заняла другая команда, из псевдонимов уходит.
create table if not exists public.team_tag_aliases (
  tag        citext primary key,
  team_id    uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.team_tag_aliases enable row level security;
create index if not exists team_tag_aliases_team on public.team_tag_aliases(team_id);

create function public.remember_team_tag() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.tag is distinct from new.tag and not old.is_solo then
    insert into team_tag_aliases(tag, team_id) values(old.tag, old.id)
      on conflict (tag) do update set team_id = excluded.team_id, created_at = now();
  end if;
  delete from team_tag_aliases where tag = new.tag;
  return new;
end;
$$;

create trigger teams_remember_tag after insert or update of tag on public.teams
  for each row execute function public.remember_team_tag();

-- ───────────────────────── ограничение частоты: поиск последних действий игрока по типу
create index if not exists audit_logs_action_created on public.audit_logs(action, created_at desc);

revoke execute on function public.set_team_member_role(uuid, uuid, uuid, text, int, int) from public, anon, authenticated;
revoke execute on function public.kick_team_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.remember_team_tag() from public, anon, authenticated;
grant execute on function public.set_team_member_role(uuid, uuid, uuid, text, int, int) to service_role;
grant execute on function public.kick_team_member(uuid, uuid, uuid) to service_role;
