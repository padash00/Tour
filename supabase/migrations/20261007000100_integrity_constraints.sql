-- Целостность данных: CHECK-ограничения, согласованность составов, индексы, отказ от публичных политик.
--
-- Ограничения добавляются NOT VALID — новые записи проверяются сразу, а проверка уже сохранённых строк
-- выполняется отдельно и при нарушении не валит миграцию: в журнал уходит NOTICE, ограничение остаётся
-- NOT VALID. Найти такие: select conname from pg_constraint where not convalidated;
-- После исправления данных: alter table … validate constraint ….

-- ───────────────────────── matches
alter table matches add constraint matches_distinct_teams
  check (team1_id is null or team2_id is null or team1_id <> team2_id) not valid;
alter table matches add constraint matches_winner_is_participant
  check (winner_id is null or winner_id is not distinct from team1_id or winner_id is not distinct from team2_id) not valid;
alter table matches add constraint matches_scores_nonnegative
  check (team1_score >= 0 and team2_score >= 0) not valid;

-- ───────────────────────── match_maps
alter table match_maps add constraint match_maps_number_positive check (map_number > 0) not valid;
alter table match_maps add constraint match_maps_scores_nonnegative check (team1_score >= 0 and team2_score >= 0) not valid;

-- ───────────────────────── tournaments
-- format — режимы src/lib/modes.ts; bracket_type — ключи FORMATS из src/lib/formats.ts
alter table tournaments add constraint tournaments_format_known check (format in ('1v1', '2v2', '5v5')) not valid;
alter table tournaments add constraint tournaments_bracket_type_known check (bracket_type in
  ('single_elimination', 'double_elimination', 'round_robin', 'groups_playoff', 'swiss', 'swiss_playoff')) not valid;
alter table tournaments add constraint tournaments_max_teams_range check (max_teams between 2 and 256) not valid;
-- тот же порядок дат, что проверяет форма админки: регистрация → check-in → старт
alter table tournaments add constraint tournaments_dates_ordered check (
  (registration_opens_at is null or registration_closes_at is null or registration_closes_at > registration_opens_at)
  and (registration_closes_at is null or starts_at is null or registration_closes_at <= starts_at)
  and (checkin_opens_at is null or checkin_closes_at is null or checkin_closes_at > checkin_opens_at)
  and (checkin_closes_at is null or starts_at is null or checkin_closes_at <= starts_at)
) not valid;

-- ───────────────────────── составы: игрок записан в тот же турнир, что и его заявка
alter table tournament_registrations add constraint tournament_registrations_id_tournament_key unique (id, tournament_id);
alter table tournament_roster_players add constraint tournament_roster_players_registration_tournament_fkey
  foreign key (registration_id, tournament_id) references tournament_registrations(id, tournament_id) on delete cascade not valid;

do $validate$
declare c record;
begin
  for c in select * from (values
    ('matches', 'matches_distinct_teams'),
    ('matches', 'matches_winner_is_participant'),
    ('matches', 'matches_scores_nonnegative'),
    ('match_maps', 'match_maps_number_positive'),
    ('match_maps', 'match_maps_scores_nonnegative'),
    ('tournaments', 'tournaments_format_known'),
    ('tournaments', 'tournaments_bracket_type_known'),
    ('tournaments', 'tournaments_max_teams_range'),
    ('tournaments', 'tournaments_dates_ordered'),
    ('tournament_roster_players', 'tournament_roster_players_registration_tournament_fkey')
  ) as v(tbl, name) loop
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation or foreign_key_violation then
      raise notice 'Constraint %.% left NOT VALID: existing rows violate it (%)', c.tbl, c.name, sqlerrm;
    end;
  end loop;
end;
$validate$;

-- ───────────────────────── индексы под частые выборки
create index if not exists matches_team1 on matches(team1_id);
create index if not exists matches_team2 on matches(team2_id);
create index if not exists matches_active_status on matches(status) where status in ('veto', 'ready', 'live');
create index if not exists matches_winner_to on matches(winner_to_match);
create index if not exists matches_loser_to on matches(loser_to_match);
create index if not exists player_map_stats_player on player_map_stats(player_id);
create index if not exists roster_player on tournament_roster_players(player_id);
create index if not exists match_events_match_event on match_events(match_id, event, map_number);

-- ───────────────────────── RLS
-- Сайт читает и пишет только серверным ключом (service role, обходит RLS); клиента с anon-ключом нет.
-- Публичные политики чтения не используются и открывали бы таблицы anon-ключу. RLS остаётся включённым:
-- без политик anon/authenticated не видят ничего.
drop policy if exists "public read" on players;
drop policy if exists "public read" on teams;
drop policy if exists "public read" on team_members;
drop policy if exists "public read" on tournaments;
drop policy if exists "public read" on tournament_registrations;
drop policy if exists "public read" on tournament_roster_players;
drop policy if exists "public read" on match_maps;
drop policy if exists "public read" on veto_actions;
drop policy if exists "public read" on player_map_stats;
drop policy if exists "public read" on player_map_swing;
drop policy if exists "public read" on match_rounds;
drop policy if exists "public read" on disputes;
drop policy if exists "public read" on roster_changes;
