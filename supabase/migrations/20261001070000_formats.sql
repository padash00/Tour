-- Форматы турнира: Round Robin, группы + плей-офф, швейцарская система (+ плей-офф).

alter type bracket_side add value if not exists 'group';
alter type bracket_side add value if not exists 'swiss';

-- стадия матча и группа
alter table matches add column stage text not null default 'playoff' check (stage in ('group', 'swiss', 'playoff'));
alter table matches add column group_label text;

-- настройки формата
alter table tournaments add column groups_count      int  not null default 2 check (groups_count between 1 and 8);
alter table tournaments add column advance_per_group int  not null default 2 check (advance_per_group between 1 and 8);
alter table tournaments add column swiss_wins        int  not null default 3 check (swiss_wins between 1 and 5);
alter table tournaments add column playoff_type      text not null default 'single_elimination'
  check (playoff_type in ('single_elimination', 'double_elimination'));
alter table tournaments add column playoff_created_at timestamptz;

-- ───────────────────────── соло-участие (1×1 без команды)
-- у каждого игрока может быть одна скрытая соло-команда; она не мешает состоять в обычной команде
alter table teams add column is_solo boolean not null default false;
alter table team_members add column is_solo boolean not null default false;

drop index if exists teams_name_active;
drop index if exists teams_tag_active;
create unique index teams_name_active on teams(name) where disbanded_at is null and not is_solo;
create unique index teams_tag_active  on teams(tag)  where disbanded_at is null and not is_solo;
create unique index teams_solo_owner  on teams(captain_id) where is_solo;

drop index if exists team_members_one_team;
create unique index team_members_one_team on team_members(player_id) where left_at is null and not is_solo;
