/**
 * Настройки лобби — общие для сервера и браузера: значения по умолчанию, проверка, шаблоны
 * и перевод в cvars CS2 для конфига MatchZy.
 */
import { MODES, type ModeKey } from "./modes";
import { makeT, tr, type T } from "./i18n/core";
import { normalizeTiers, TIERS, type TierKey } from "./tiers";
import { cupFormatAllowed, cupTeams, type CupFormat } from "./cup-core";

export type LobbySettings = {
  // основные
  mode: ModeKey;
  team_size: number; // игроков в команде (1–5), по умолчанию — как в режиме
  network: "lan" | "internet";
  player_pick: "free" | "captains";
  /** сколько секунд у капитана на выбор игрока; 0 — без ограничения (авто-выбора нет) */
  pick_seconds: PickSeconds;
  start: "host" | "all_ready";
  gotv: boolean;
  // карты
  best_of: 1 | 3 | 5;
  map_choice: "host" | "veto" | "random";
  maps: string[]; // хост: карты серии по порядку; вето / случайно — пул
  // лобби
  allow_join_team: boolean;
  rematch: boolean; // после матча лобби остаётся с тем же составом (иначе закрывается)
  voice: "all" | "team" | "off";
  max_waiting: number;
  max_spectators: number;
  filter: boolean;
  filter_faceit_min: number; // 0 — любой
  filter_faceit_max: number; // 10 — любой
  filter_min_matches: number; // сыгранных матчей на сайте (турниры + лобби)
  // геймплей
  knife: boolean;
  max_rounds: 16 | 24 | 30 | 60;
  backups: boolean;
  overtime: boolean;
  start_money: number;
  max_money: number;
  ot_money: number;
  armor: "default" | "kevlar" | "helmet";
  headshot_only: boolean;
  // время и паузы
  timeouts: number;
  timeout_seconds: number;
  freezetime: number;
  // модификаторы
  disable_radar: boolean;
  low_gravity: boolean;
  infinite_ammo: boolean;
  no_grenades: boolean;
  autobhop: boolean;
  // боты
  bot_difficulty: 0 | 1 | 2 | 3;
  /**
   * «Десятка»: игра на банк между игроками. Взносы игроки передают организатору сами — сайт денег не принимает,
   * только показывает банк и отметки организатора. Включает жёсткие правила (см. enforcePot).
   */
  pot: boolean;
  /** тиры (по FACEIT ELO), которым открыт вход */
  pot_tiers: TierKey[];
  /** взнос с игрока, тг (0 — без взноса) */
  pot_fee: number;
  /** id игроков, у кого организатор отметил взнос. Меняется только действием togglePaid, не формой настроек */
  pot_paid: string[];
  /** ELO игроков на момент старта выбора капитанами: по нему капитаны и тиры до конца игры. Пишет только сервер */
  pot_elo: Record<string, number>;
  /**
   * Сколько игроков собирает лобби: 0 — обычное, на две команды; 20, 30 или 40 — несколько команд по пять
   * и сетка матчей между ними (см. cup-core.ts). Задаётся при создании.
   */
  players: number;
  /** лобби на несколько команд: сетка на вылет или круговая (круговая — только на 4 команды) */
  cup_format: CupFormat;
  /** комната одного матча большого лобби: код большого лобби и матч сетки. Пишет только сервер */
  cup_of: { code: string; match: string } | null;
};

export const PICK_SECONDS = [30, 60, 120, 300, 0] as const;
export type PickSeconds = (typeof PICK_SECONDS)[number];

export const DEFAULT_SETTINGS: LobbySettings = {
  mode: "5v5",
  team_size: 5,
  network: "lan",
  player_pick: "free",
  pick_seconds: 60,
  start: "host",
  gotv: false,
  best_of: 1,
  map_choice: "host",
  maps: ["de_mirage"],
  allow_join_team: true,
  rematch: true,
  voice: "team",
  max_waiting: 50,
  max_spectators: 10,
  filter: false,
  filter_faceit_min: 0,
  filter_faceit_max: 10,
  filter_min_matches: 0,
  knife: true,
  max_rounds: 24,
  backups: true,
  overtime: true,
  start_money: 800,
  max_money: 16000,
  ot_money: 10000,
  armor: "default",
  headshot_only: false,
  timeouts: 4,
  timeout_seconds: 30,
  freezetime: 15,
  disable_radar: false,
  low_gravity: false,
  infinite_ammo: false,
  no_grenades: false,
  autobhop: false,
  bot_difficulty: 3,
  pot: false,
  pot_tiers: [...TIERS],
  pot_fee: 0,
  pot_paid: [],
  pot_elo: {},
  players: 0,
  cup_format: "bracket",
  cup_of: null,
};

/** Карты «Десятки» по умолчанию — соревновательный пул, вето */
export const POT_MAPS = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"];
export const POT_FEE_MAX = 1_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Правила «Десятки», которые организатор поменять не может: 5×5 через интернет, игроков выбирают капитаны, без ботов-добивок */
function enforcePot(input: LobbySettings): LobbySettings {
  let s = input;
  // несколько команд: всегда 5×5, игроков разбирают капитаны, реванша нет — после финала лобби собирается заново
  if (cupTeams(s.players) > 0) {
    s = { ...s, mode: "5v5", team_size: 5, player_pick: "captains", allow_join_team: false, start: "host", rematch: false, max_waiting: Math.max(s.max_waiting, s.players) };
    if (!cupFormatAllowed(cupTeams(s.players), s.cup_format)) s = { ...s, cup_format: "bracket" };
  }
  if (!s.pot) return { ...s, pot_paid: [], pot_elo: {} };
  return { ...s, mode: "5v5", team_size: 5, network: "internet", player_pick: "captains", allow_join_team: false, start: "host", filter: false };
}

/** Банк «Десятки»: взнос × число игроков в двух командах */
export const potBank = (s: Pick<LobbySettings, "pot_fee" | "team_size"> & { players?: number }) => s.pot_fee * (cupTeams(s.players ?? 0) > 0 ? s.players! : s.team_size * 2);

/** Сколько игроков нужно лобби, чтобы начать: все команды полные */
export const playersNeeded = (s: Pick<LobbySettings, "players" | "team_size">) => (cupTeams(s.players) > 0 ? s.players : s.team_size * 2);

export const LIMITS = {
  team_size: [1, 5],
  max_waiting: [0, 200],
  max_spectators: [0, 10],
  filter_faceit_min: [0, 10],
  filter_faceit_max: [0, 10],
  filter_min_matches: [0, 500],
  start_money: [0, 16000],
  max_money: [800, 60000],
  ot_money: [0, 60000],
  timeouts: [0, 10],
  timeout_seconds: [10, 120],
  freezetime: [0, 30],
} as const;

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Карта: официальная (de_mirage) или из мастерской (name@id) */
export const MAP_RE = /^[a-z0-9_]{2,40}(@\d{6,12})?$/i;

/** Приводит любые присланные настройки к допустимым (лишнее отбрасывается, недостающее — по умолчанию) */
export function normalizeSettings(input: unknown, base: LobbySettings = DEFAULT_SETTINGS): LobbySettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = base;
  const mode = pick(s.mode, Object.keys(MODES) as ModeKey[], d.mode);
  const maps = Array.isArray(s.maps) ? (s.maps as unknown[]).map(String).filter((m) => MAP_RE.test(m)).slice(0, 30) : d.maps;
  const out: LobbySettings = {
    mode,
    team_size: num(s.team_size, LIMITS.team_size, MODES[mode].size),
    network: pick(s.network, ["lan", "internet"] as const, d.network),
    player_pick: pick(s.player_pick, ["free", "captains"] as const, d.player_pick),
    pick_seconds: pick(s.pick_seconds === undefined ? undefined : Number(s.pick_seconds), PICK_SECONDS, d.pick_seconds),
    start: pick(s.start, ["host", "all_ready"] as const, d.start),
    gotv: bool(s.gotv, d.gotv),
    best_of: pick(Number(s.best_of), [1, 3, 5] as const, d.best_of),
    map_choice: pick(s.map_choice, ["host", "veto", "random"] as const, d.map_choice),
    maps: maps.length ? [...new Set(maps)] : d.maps,
    allow_join_team: bool(s.allow_join_team, d.allow_join_team),
    rematch: bool(s.rematch, d.rematch),
    voice: pick(s.voice, ["all", "team", "off"] as const, d.voice),
    max_waiting: num(s.max_waiting, LIMITS.max_waiting, d.max_waiting),
    max_spectators: num(s.max_spectators, LIMITS.max_spectators, d.max_spectators),
    filter: bool(s.filter, d.filter),
    filter_faceit_min: num(s.filter_faceit_min, LIMITS.filter_faceit_min, d.filter_faceit_min),
    filter_faceit_max: num(s.filter_faceit_max, LIMITS.filter_faceit_max, d.filter_faceit_max),
    filter_min_matches: num(s.filter_min_matches, LIMITS.filter_min_matches, d.filter_min_matches),
    knife: bool(s.knife, d.knife),
    max_rounds: pick(Number(s.max_rounds), [16, 24, 30, 60] as const, d.max_rounds),
    backups: bool(s.backups, d.backups),
    overtime: bool(s.overtime, d.overtime),
    start_money: num(s.start_money, LIMITS.start_money, d.start_money),
    max_money: num(s.max_money, LIMITS.max_money, d.max_money),
    ot_money: num(s.ot_money, LIMITS.ot_money, d.ot_money),
    armor: pick(s.armor, ["default", "kevlar", "helmet"] as const, d.armor),
    headshot_only: bool(s.headshot_only, d.headshot_only),
    timeouts: num(s.timeouts, LIMITS.timeouts, d.timeouts),
    timeout_seconds: num(s.timeout_seconds, LIMITS.timeout_seconds, d.timeout_seconds),
    freezetime: num(s.freezetime, LIMITS.freezetime, d.freezetime),
    disable_radar: bool(s.disable_radar, d.disable_radar),
    low_gravity: bool(s.low_gravity, d.low_gravity),
    infinite_ammo: bool(s.infinite_ammo, d.infinite_ammo),
    no_grenades: bool(s.no_grenades, d.no_grenades),
    autobhop: bool(s.autobhop, d.autobhop),
    bot_difficulty: pick(Number(s.bot_difficulty), [0, 1, 2, 3] as const, d.bot_difficulty),
    pot: bool(s.pot, d.pot),
    pot_tiers: normalizeTiers(s.pot_tiers, d.pot_tiers),
    pot_fee: num(s.pot_fee, [0, POT_FEE_MAX], d.pot_fee),
    pot_paid: Array.isArray(s.pot_paid) ? [...new Set((s.pot_paid as unknown[]).map(String).filter((x) => UUID_RE.test(x)))].slice(0, 100) : d.pot_paid,
    pot_elo:
      s.pot_elo && typeof s.pot_elo === "object" && !Array.isArray(s.pot_elo)
        ? Object.fromEntries(
            Object.entries(s.pot_elo as Record<string, unknown>)
              .filter(([k, v]) => UUID_RE.test(k) && Number.isFinite(Number(v)) && Number(v) > 0)
              .slice(0, 100)
              .map(([k, v]) => [k, Math.round(Number(v))]),
          )
        : d.pot_elo,
    players: 0,
    cup_format: "bracket",
    cup_of: null,
  };
  out.players = cupTeams(Number(s.players)) > 0 ? Number(s.players) : cupTeams(d.players) > 0 && s.players === undefined ? d.players : 0;
  out.cup_format = pick(s.cup_format, ["bracket", "round"] as const, d.cup_format);
  const of = s.cup_of as { code?: unknown; match?: unknown } | null | undefined;
  out.cup_of = of && typeof of === "object" && /^[A-Za-z0-9]{3,16}$/.test(String(of.code)) && /^r\d{1,2}m\d{1,2}$/.test(String(of.match)) ? { code: String(of.code), match: String(of.match) } : null;
  if (out.filter_faceit_min > out.filter_faceit_max) out.filter_faceit_max = out.filter_faceit_min;
  if (out.start_money > out.max_money) out.start_money = out.max_money;
  return enforcePot(out);
}

/** Смена режима подтягивает размер команды */
export function withMode(s: LobbySettings, mode: ModeKey): LobbySettings {
  return { ...s, mode, team_size: MODES[mode].size, max_rounds: mode === "2v2" ? 16 : s.max_rounds === 16 ? 24 : s.max_rounds };
}

/** Почему с такими картами матч не начать (null — всё в порядке) */
export function mapsProblem(s: LobbySettings, t: T = makeT("ru")): string | null {
  const n = s.maps.length;
  if (s.map_choice === "host" && n !== s.best_of) {
    const left = s.best_of - n;
    return left > 0
      ? t("Выберите ещё {left} {word} для игры в формате BO{bo}", { left, word: t.plural(left, "карту", "карты", "карт"), bo: s.best_of })
      : t("Для BO{bo} нужно ровно {bo} — уберите лишние", { bo: s.best_of });
  }
  if (s.map_choice === "veto" && n < s.best_of + 1) return t("Для вето в BO{bo} нужно хотя бы {n} карт в пуле", { bo: s.best_of, n: s.best_of + 1 });
  if (s.map_choice === "random" && n < 1) return t("Выберите хотя бы одну карту");
  return null;
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Числовые и однословные cvars для MatchZy (выполняет их без кавычек) */
export function lobbyCvars(s: LobbySettings, bots: number, humans: number): Record<string, number | string> {
  const cvars: Record<string, number | string> = {
    mp_maxrounds: s.max_rounds,
    mp_overtime_enable: s.overtime ? 1 : 0,
    mp_overtime_maxrounds: 6,
    mp_overtime_startmoney: s.ot_money,
    mp_startmoney: s.start_money,
    mp_maxmoney: s.max_money,
    mp_free_armor: s.armor === "helmet" ? 2 : s.armor === "kevlar" ? 1 : 0,
    mp_damage_headshot_only: s.headshot_only ? 1 : 0,
    mp_team_timeout_max: s.timeouts,
    mp_team_timeout_time: s.timeout_seconds,
    mp_freezetime: s.freezetime,
    mp_backup_round_auto: s.backups ? 1 : 0,
    sv_disable_radar: s.disable_radar ? 1 : 0,
    sv_gravity: s.low_gravity ? 300 : 800,
    sv_infinite_ammo: s.infinite_ammo ? 2 : 0,
    mp_buy_allow_grenades: s.no_grenades ? 0 : 1,
    sv_autobunnyhopping: s.autobhop ? 1 : 0,
    sv_enablebunnyhopping: s.autobhop ? 1 : 0,
    // голос: все слышат всех / только своя команда / выключен
    sv_voiceenable: s.voice === "off" ? 0 : 1,
    sv_alltalk: s.voice === "all" ? 1 : 0,
    sv_deadtalk: s.voice === "all" ? 1 : 0,
    sv_full_alltalk: s.voice === "all" ? 1 : 0,
    sv_talk_enemy_living: s.voice === "all" ? 1 : 0,
    sv_talk_enemy_dead: s.voice === "all" ? 1 : 0,
    // GOTV для зрителей: порт игры + 5
    tv_maxclients: s.gotv ? 10 : 0,
    tv_delay: 0,
    mp_match_restart_delay: 15,
    bot_difficulty: s.bot_difficulty,
  };
  if (bots > 0) {
    // боты добивают команды до нужного числа: всего игроков = люди + боты
    cvars.bot_quota_mode = "fill";
    cvars.bot_quota = humans + bots;
    cvars.bot_join_after_player = 0;
  } else {
    cvars.bot_quota = 0;
  }
  return cvars;
}

/** Готовые шаблоны */
export const PRESETS: { key: string; name: string; text: string; settings: Partial<LobbySettings> }[] = [
  {
    key: "classic",
    name: tr("Классика 5×5"),
    text: tr("MR24, нож, овертаймы, вето карт"),
    settings: { mode: "5v5", team_size: 5, max_rounds: 24, knife: true, overtime: true, map_choice: "veto", maps: ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"] },
  },
  {
    key: "wingman",
    name: tr("Wingman 2×2"),
    text: tr("MR16, компактные карты"),
    settings: { mode: "2v2", team_size: 2, max_rounds: 16, knife: true, overtime: true, map_choice: "host", best_of: 1, maps: ["de_inferno"] },
  },
  {
    key: "duel",
    name: tr("Дуэль 1×1"),
    text: tr("Один на один, без ножа"),
    settings: { mode: "1v1", team_size: 1, max_rounds: 24, knife: false, overtime: false, map_choice: "host", best_of: 1, maps: ["de_dust2"] },
  },
  {
    key: "fun",
    name: tr("Фан"),
    text: tr("Только в голову, низкая гравитация, автобхоп"),
    settings: { headshot_only: true, low_gravity: true, autobhop: true, knife: false, max_rounds: 16, start_money: 16000, max_money: 16000 },
  },
];

export const BOT_NAMES = [
  "Victor", "Opie", "Calvin", "Ridgway", "Erik", "Vladimir", "Kask", "Ringo", "Toby", "Brian",
  "Wolf", "Elliot", "Gunner", "Hank", "Ivan", "Jacob", "Keith", "Lou", "Moe", "Norm",
];

export const BOT_DIFFICULTY = [tr("Лёгкие"), tr("Нормальные"), tr("Сложные"), tr("Эксперт")] as const;
