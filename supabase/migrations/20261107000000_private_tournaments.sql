-- Закрытые турниры: видят только приглашённые и админы.
-- Сайт читает базу служебным ключом, публичных политик чтения нет (anon не видит ничего) —
-- закрытость обеспечивает серверный код (src/lib/private-tournament.ts).

alter table public.tournaments add column if not exists is_private boolean not null default false;

-- Приглашения: invited → accepted / declined; чек-ин — лично каждого игрока; запасной — не попал в пару
create table if not exists public.tournament_access (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  status        text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  invited_by    uuid references public.players(id) on delete set null,
  invited_at    timestamptz not null default now(),
  decided_at    timestamptz,
  checked_in_at timestamptz,
  is_reserve    boolean not null default false,
  primary key (tournament_id, player_id)
);
create index if not exists tournament_access_player on public.tournament_access(player_id);
alter table public.tournament_access enable row level security;
revoke all on public.tournament_access from anon, authenticated;

-- Пары закрытого турнира — скрытые команды (как соло-команды дуэлей: is_solo, вне общих списков),
-- принадлежат турниру и удаляются вместе с ним
alter table public.teams add column if not exists private_tournament_id uuid references public.tournaments(id) on delete cascade;
create index if not exists teams_private_tournament on public.teams(private_tournament_id) where private_tournament_id is not null;
-- одна соло-команда дуэлей на игрока — пары закрытых турниров сюда не входят
drop index if exists public.teams_solo_owner;
create unique index teams_solo_owner on public.teams(captain_id) where is_solo and private_tournament_id is null;

-- Пары закрытого турнира одним действием: прежние пары (пока сетки нет) удаляются,
-- каждая пара — скрытая команда + одобренная заявка с отмеченным чек-ином + состав.
-- p_pairs: [{"name": "...", "tag": "...", "players": [uuid, uuid]}], первый игрок — капитан.
create or replace function public.create_private_pairs(p_tournament uuid, p_actor uuid, p_pairs jsonb, p_reserve uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare t tournaments; pair jsonb; ids uuid[]; tm uuid; reg uuid; n int := 0;
begin
  select * into t from tournaments where id = p_tournament for update;
  if not found or not t.is_private then raise exception 'not_private'; end if;
  if t.bracket_published_at is not null then raise exception 'bracket_exists'; end if;
  -- старые пары: заявки, составы, команды
  delete from tournament_roster_players where tournament_id = p_tournament;
  delete from tournament_registrations where tournament_id = p_tournament;
  delete from teams where private_tournament_id = p_tournament;
  update tournament_access set is_reserve = coalesce(player_id = any(p_reserve), false) where tournament_id = p_tournament;
  for pair in select * from jsonb_array_elements(p_pairs) loop
    select array_agg(x::uuid) into ids from jsonb_array_elements_text(pair->'players') x;
    if cardinality(ids) <> 2 or ids[1] = ids[2] then raise exception 'invalid_pair'; end if;
    if (select count(*) from tournament_access where tournament_id = p_tournament and player_id = any(ids)
        and status = 'accepted' and checked_in_at is not null) <> 2 then raise exception 'player_not_checked_in'; end if;
    insert into teams(name, tag, captain_id, invite_code, is_solo, private_tournament_id)
      values(pair->>'name', pair->>'tag', ids[1], 'PRIV-' || replace(gen_random_uuid()::text, '-', ''), true, p_tournament)
      returning id into tm;
    insert into team_members(team_id, player_id, role, is_solo)
      values(tm, ids[1], 'captain', true), (tm, ids[2], 'player', true);
    insert into tournament_registrations(tournament_id, team_id, status, decided_by, decided_at, checked_in_at, checked_in_by, note)
      values(p_tournament, tm, 'approved', p_actor, now(), now(), p_actor, 'пара закрытого турнира')
      returning id into reg;
    insert into tournament_roster_players(registration_id, tournament_id, player_id, role)
      values(reg, p_tournament, ids[1], 'main'), (reg, p_tournament, ids[2], 'main');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.create_private_pairs(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.create_private_pairs(uuid, uuid, jsonb, uuid[]) to service_role;

