-- Скины на сайте и лобби на несколько команд.

-- ── Скины. Источник правды — база плагина WeaponPaints на серверном ПК (MariaDB f16_skins).
-- player_skins — её зеркало по игрокам: агент присылает набор игрока, когда он изменился (в игре или с сайта).
-- data: {"skins": [{"t": 2|3, "d": defindex, "p": paint, "w": wear, "s": seed, "n": nametag, "st": 0|1}],
--        "knife": {"2": "weapon_knife_…", "3": "…"}, "gloves": {"2": defindex, "3": defindex}}
-- Команда: 2 — T, 3 — CT (как в плагине).
create table public.player_skins (
  steam_id  text primary key,
  data      jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

-- Изменения с сайта: агент забирает неприменённые, пишет в базу плагина и подтверждает.
-- Пока изменение не применено, сайт показывает его поверх зеркала.
create table public.skin_ops (
  id         bigint generated always as identity primary key,
  steam_id   text not null,
  op         jsonb not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  error      text
);
create index skin_ops_pending on public.skin_ops (id) where applied_at is null;
create index skin_ops_player on public.skin_ops (steam_id, id);

-- только сервер (service role)
alter table public.player_skins enable row level security;
alter table public.skin_ops     enable row level security;

-- ── Лобби на 20–40 игроков: до восьми команд и сетка внутри лобби.
alter table public.lobby_members drop constraint if exists lobby_members_slot_check;
alter table public.lobby_members add constraint lobby_members_slot_check
  check (slot ~ '^(team[1-8]|wait|spec)$');

-- сетка или круговая лобби: команды, матчи, кто с кем играет дальше
alter table public.lobbies add column if not exists bracket jsonb;
-- какой матч сетки играет эта игра (null — обычная игра лобби)
alter table public.lobby_games add column if not exists bracket_match text;
