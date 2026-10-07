import "server-only";
import { getMatch, getMatchRosters } from "../matches";
import { buildLobbyConfig } from "../lobby";
import { modeOf } from "../modes";
import { getSetting } from "../settings";
import { db } from "../supabase";
import { adminPlayers } from "./admins";

// ───────────────────────── конфиг матча для MatchZy

const observerIds = async () =>
  ((await getSetting("OBSERVER_STEAM_IDS")) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));

export async function buildMatchzyConfig(matchId: string) {
  const [m, observers, admins] = await Promise.all([getMatch(matchId), observerIds(), adminPlayers()]);
  if (!m) {
    // не турнирный матч — может быть игрой лобби
    return buildLobbyConfig(matchId, [
      ...observers.map((id, i) => [id, `F16 Observer ${i + 1}`] as [string, string]),
      ...admins.map((a) => [a.steam_id, a.nickname] as [string, string]),
    ]);
  }
  if (!m.team1 || !m.team2 || m.maps.length === 0 || m.matchzy_id == null) return null;
  const rosters = await getMatchRosters(m);
  const players = (list: typeof rosters.team1) =>
    Object.fromEntries(list.map((r) => [r.player.steam_id, r.player.nickname]));
  const inRoster = new Set([...rosters.team1, ...rosters.team2].map((r) => r.player.steam_id));

  return {
    matchid: m.matchzy_id,
    team1: { id: m.team1.id, name: m.team1.name, tag: m.team1.tag, players: players(rosters.team1) },
    team2: { id: m.team2.id, name: m.team2.name, tag: m.team2.tag, players: players(rosters.team2) },
    num_maps: m.best_of,
    // workshop-карта хранится как «name@id» — MatchZy грузит её по числовому ID (host_workshop_map)
    maplist: m.maps.map((x) => (x.map_name.includes("@") ? x.map_name.split("@")[1] : x.map_name)),
    // нож — победитель выбирает сторону; без ножа стороны чередуются (team1 начинает за CT на нечётных картах)
    map_sides: m.maps.map((_, i) => (m.tournament.knife_round ? "knife" : i % 2 === 0 ? "team1_ct" : "team2_ct")),
    skip_veto: true, // вето уже прошло на сайте
    clinch_series: true,
    players_per_team: modeOf(m.tournament.format).size,
    min_players_to_ready: modeOf(m.tournament.format).size * 2,
    wingman: modeOf(m.tournament.format).wingman,
    min_spectators_to_ready: 0,
    // зрители: наблюдатели из настроек и все админы сайта — админ заходит на любой матч сверх состава
    spectators: {
      players: Object.fromEntries([
        ...observers.map((id, i) => [id, `F16 Observer ${i + 1}`] as const),
        ...admins.filter((a) => !inRoster.has(a.steam_id)).map((a) => [a.steam_id, a.nickname] as const),
      ]),
    },
    // только числовые cvars: MatchZy выполняет их без кавычек.
    // Адрес отправки событий агент выставляет отдельно через RCON.
    cvars: {
      mp_overtime_enable: m.tournament.overtime ? 1 : 0,
      mp_overtime_maxrounds: 6,
      mp_team_timeout_max: m.tournament.timeouts_per_team,
      mp_team_timeout_time: m.tournament.timeout_seconds,
      // MatchZy применяет эти cvars через секунду после live.cfg; на aim-картах — без фризтайма
      ...modeCvars(m.tournament.format, m.maps.map((x) => x.map_name)),
    },
  };
}

/**
 * Настройки режима. Workshop-карты (aim_map и т.п.) часто сами ставят mp_maxrounds и прочее —
 * агент проверяет их каждые 5 секунд и возвращает, пока идёт матч.
 */
export function modeCvars(format: string, maps: string[] = []): Record<string, number> {
  const size = modeOf(format).size;
  const base: Record<string, number> = {
    ...(size === 1 ? { mp_maxrounds: 24, mp_halftime_duration: 5 } : size === 2 ? { mp_maxrounds: 16 } : { mp_maxrounds: 24 }),
    // MatchZy включает это только для турнирных de-карт после перехода в live.
    sv_auto_full_alltalk_during_warmup_half_end: 0,
    // смена карты в серии: gamemode_competitive.cfg на каждой карте ставит tv_delay 105, и MatchZy
    // растягивает экран итогов до tv_delay + 25 = 130 с. Трансляцию с задержкой мы не ведём —
    // держим 0, тогда экран итогов 15 с (минимум MatchZy)
    tv_delay: 0,
    mp_match_restart_delay: 15,
  };
  // aim-карты (aim_map и т.п.): без фризтайма и с быстрым рестартом раунда; на обычных картах — стандарт MatchZy
  if (maps.length > 0 && maps.every(isAimMap)) return { ...base, mp_freezetime: 0, mp_round_restart_delay: 2 };
  if (size === 5) {
    // Турнирные карты 5×5: MR12, MR3, экономика и тайминги соревновательного CS2.
    return {
      ...base,
      mp_halftime: 1,
      mp_halftime_duration: 16,
      mp_overtime_startmoney: 12500,
      mp_roundtime: 1.92,
      mp_roundtime_defuse: 1.92,
      mp_startmoney: 800,
      mp_maxmoney: 16000,
      mp_freezetime: 20,
      mp_buytime: 20,
      mp_c4timer: 40,
      mp_round_restart_delay: 5,
      mp_friendlyfire: 1,
    };
  }
  // Wingman — свой конфиг MatchZy; на дуэлях сохраняем короткий фризтайм.
  return size === 2 ? base : { ...base, mp_freezetime: 15 };
}

/** aim-карта: aim_map, aim_map@3070549948, aim_redline… */
export function isAimMap(map: string) {
  return /^aim[_-]/i.test(map.split("@")[0]);
}

export async function matchEnforce(matchId: string) {
  const { data } = await db().from("matches").select("matchzy_id, tournament:tournaments(format, overtime, timeouts_per_team, timeout_seconds)").eq("id", matchId).single();
  const row = data;
  if (!row) return null;
  const { data: maps } = await db().from("match_maps").select("map_number, map_name").eq("match_id", matchId).order("map_number");
  const cvars = {
    ...modeCvars(row.tournament.format, (maps ?? []).map((x) => x.map_name)),
    mp_overtime_enable: row.tournament.overtime ? 1 : 0,
    mp_overtime_maxrounds: 6,
    mp_team_timeout_max: row.tournament.timeouts_per_team,
    mp_team_timeout_time: row.tournament.timeout_seconds,
  };
  // MatchZy нумерует карты с нуля. Голос между командами включается только на de-картах турнира.
  const halftimeVoiceMaps = (maps ?? [])
    .filter((x) => /^de_/i.test(x.map_name.split("@")[0]))
    .map((x) => x.map_number - 1);
  return Object.keys(cvars).length ? { matchid: row.matchzy_id, cvars, halftimeVoiceMaps } : null;
}

export async function matchzyPostCommands(matchId: string) {
  const { data } = await db()
    .from("matches")
    .select("tournament:tournaments(tech_pauses, tech_pause_seconds)")
    .eq("id", matchId)
    .single();
  const t = data?.tournament;
  if (!t) return [];
  return [`matchzy_max_tech_pauses_allowed ${t.tech_pauses}`, `matchzy_tech_pause_duration ${t.tech_pause_seconds}`];
}
