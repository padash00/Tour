import { unstable_cache } from "next/cache";
import { db } from "./supabase";
import { buildTwenty, currentSeason, playDayOf, seasonOf, type CoreMap, eloFit, mapEdge, type EloFit, type CoreGame, type CoreStat, type FixedSeasons, type RoleKey, type TwentyScope } from "./twenty-core";

/*
 * «Двадцатка»: общий рейтинг игроков по играм на банк — «Десятка» и матчи больших лобби (20, 30 и 40 игроков).
 * Здесь только чтение из базы; сами расчёты (рейтинг, карты, роли, номинации, рекорды) — в twenty-core.ts.
 */

export { TWENTY_MIN_MAPS, MAP_MIN, ROLE_MIN_MAPS, DUO_MIN, SEASON_MIN_MAPS, SEASON_PRIZES, ACHIEVEMENTS_TOTAL, currentSeason, nextSeason, seasonMinMaps } from "./twenty-core";
export type { TwentyRow, MapBoard, MapCell, Nomination, RecordItem, Duo, Relations, RoleKey, Season, Achievement, AchievementBoard, HistoryPoint } from "./twenty-core";

export type TwentyEvening = { code: string; finished_at: string; matches: number };
export type TwentyPlayer = { nickname: string; avatar_url: string | null };
/** fixed — записанные итоги сезонов; null — таблицы итогов ещё нет или она не прочиталась (тогда считаем по истории) */
/** Сыгранная игра для вкладки «Игры»: кто с кем играл, счёт серии и карт, убийства и смерти каждого за матч */
export type MixGame = {
  id: string;
  code: string | null;
  finished_at: string | null;
  /** игровой день: «2026-11-25» */
  day: string;
  winner: number | null;
  score: [number, number];
  maps: CoreMap[];
  teams: [MixTeam, MixTeam];
};
export type MixTeam = { name: string; players: { steam_id: string; name: string | null; kills: number; deaths: number }[] };
type GameInfo = { names: [string, string]; score: [number, number] };
export type TwentyData = { games: CoreGame[]; info: Record<string, GameInfo>; stats: CoreStat[]; players: Record<string, TwentyPlayer>; elo: Record<string, number>; fixed: FixedSeasons | null };

/** Записанные итоги сезонов. Сбой здесь рейтинг не ломает: без записи тройка считается по истории, как раньше */
async function loadFixedSeasons(): Promise<FixedSeasons | null> {
  const { data, error } = await db().from("mix_season_results").select("season, place, steam_id, name, rating, maps, prize, paid_at").order("season").order("place");
  if (error) {
    console.error("mix season results", error.message);
    return null;
  }
  const out: FixedSeasons = {};
  for (const r of data ?? []) (out[r.season] ??= []).push({ steam_id: r.steam_id, name: r.name, rating: Number(r.rating), maps: r.maps, prize: r.prize, paid: !!r.paid_at });
  return out;
}

type GameRow = { id: string; winner: number | null; finished_at: string | null; maps: CoreGame["maps"] | null; team1: { name?: string } | null; team2: { name?: string } | null; team1_score: number | null; team2_score: number | null; settings: { cup_of?: { code?: string } | null } | null };
type StatRow = Pick<CoreStat, "game_id" | "map_number" | "steam_id" | "name" | "team" | "kills" | "deaths" | "assists" | "damage" | "headshot_kills" | "rounds_played" | "kast" | "mvp" | "clutch_wins" | "first_kills"> & { raw: Record<string, unknown> | null };
/**
 * Swing, экономика и мультикиллы карты из лога раундов, приведённые к статистике MatchZy: лог мог потерять хвост карты,
 * поэтому суммы за раунды растягиваются на сыгранные раунды, а вес экономики берётся долей от убийств и смертей по логу.
 */
function swingOf(s: { rounds_played: number; kills: number; deaths: number }, f: FactRow | undefined, ct: SideFact, t: SideFact) {
  if (!f || (ct.swing == null && t.swing == null)) return { swing: null };
  const sum = (k: keyof SideFact) => (ct[k] ?? 0) + (t[k] ?? 0);
  const stretch = f.rounds > 0 ? s.rounds_played / f.rounds : 1;
  const logKills = sum("kills");
  const logDeaths = sum("deaths");
  return {
    swing: sum("swing") * stretch,
    eco_kills: logKills > 0 ? (s.kills * sum("ekills")) / logKills : s.kills,
    eco_deaths: logDeaths > 0 ? (s.deaths * sum("edeaths")) / logDeaths : s.deaths,
    multi: sum("multi") * stretch,
    eco_duels: sum("eco"),
  };
}

type SideFact = { rounds?: number; wins?: number; kills?: number; deaths?: number; swing?: number; ekills?: number; edeaths?: number; multi?: number; eco?: number };
type FactRow = { game_id: string; map_number: number; steam_id: string; rounds: number; kast: number; first_kills: number; first_deaths: number; trade_kills: number; weapons: Record<string, number> | null; sides: { CT?: SideFact; T?: SideFact } | null };
const SNIPERS = ["awp", "ssg08", "scar20", "g3sg1"];

/** Сколько порций статистики запрашиваем одновременно */
const STAT_PARALLEL = 6;

/**
 * Все сыгранные игры на банк со статистикой по картам и никами игроков.
 * Сбой базы — исключение, а не пустой ответ: иначе страница показала бы «рейтинга нет» и положила это в кэш.
 */
export async function loadTwentyData(): Promise<TwentyData> {
  // игры — страницами, пока не кончатся: «за всё время» не должно обрезаться пределом строк ответа
  const gameRows: GameRow[] = [];
  for (;;) {
    const { data } = await db()
      .from("lobby_games")
      .select("id, winner, finished_at, maps, team1, team2, team1_score, team2_score, settings")
      .eq("status", "finished")
      .or("settings->>pot.eq.true,settings->>cup_of.not.is.null")
      .order("finished_at", { ascending: false })
      .order("id")
      .range(gameRows.length, gameRows.length + 999)
      .throwOnError();
    gameRows.push(...((data ?? []) as unknown as GameRow[]));
    if (!data?.length) break;
  }
  const games: CoreGame[] = gameRows.map((g) => ({ id: g.id, code: g.settings?.cup_of?.code ?? null, winner: g.winner, finished_at: g.finished_at, maps: g.maps ?? [] }));

  const info: Record<string, GameInfo> = {};
  for (const g of gameRows) info[g.id] = { names: [g.team1?.name || "Команда 1", g.team2?.name || "Команда 2"], score: [g.team1_score ?? 0, g.team2_score ?? 0] };

  // статистика по картам: порциями, чтобы не упереться в лимит строк ответа (BO5 — до 50 строк на игру)
  const ids = games.map((g) => g.id);
  const loadChunk = async (chunk: string[]): Promise<CoreStat[]> => {
    const stats: CoreStat[] = [];
    const [{ data: rows }, { data: factRows }] = await Promise.all([
      db()
        .from("lobby_player_stats")
        .select("game_id, map_number, steam_id, name, team, kills, deaths, assists, damage, headshot_kills, rounds_played, kast, mvp, clutch_wins, first_kills, raw")
        .in("game_id", chunk)
        .limit(1000)
        .throwOnError(),
      // факты по раундам из лога сервера: то, чего MatchZy для лобби не присылает (у старых игр их нет)
      db()
        .from("lobby_round_facts")
        .select("game_id, map_number, steam_id, rounds, kast, first_kills, first_deaths, trade_kills, weapons, sides")
        .in("game_id", chunk)
        .limit(1000)
        .throwOnError(),
    ]);
    const facts = new Map(((factRows ?? []) as unknown as FactRow[]).map((f) => [`${f.game_id}:${f.map_number}:${f.steam_id}`, f]));
    for (const { raw, ...s } of (rows ?? []) as unknown as StatRow[]) {
      const n = (k: string) => Number(raw?.[k] ?? 0) || 0;
      const f = facts.get(`${s.game_id}:${s.map_number}:${s.steam_id}`);
      const ct = f?.sides?.CT ?? {};
      const t = f?.sides?.T ?? {};
      stats.push({
        ...s,
        // KAST и первые убийства — из лога, если MatchZy их не дал; KAST не больше числа сыгранных раундов
        kast: s.kast || Math.min(f?.kast ?? 0, s.rounds_played),
        first_kills: s.first_kills || (f?.first_kills ?? 0),
        k3: n("3k"), k4: n("4k"), k5: n("5k"), utility_damage: n("utility_damage"), enemies_flashed: n("enemies_flashed"), bomb_plants: n("bomb_plants"), bomb_defuses: n("bomb_defuses"),
        first_deaths: f?.first_deaths ?? 0,
        trade_kills: f?.trade_kills ?? 0,
        sniper_kills: SNIPERS.reduce((sum, w) => sum + (f?.weapons?.[w] ?? 0), 0),
        weapons: f?.weapons ?? {},
        // у карт, посчитанных до появления Swing, его в записи нет — такие карты идут по прежней формуле
        ...swingOf(s, f, ct, t),
        ct_rounds: ct.rounds ?? 0, ct_wins: ct.wins ?? 0, ct_kills: ct.kills ?? 0, ct_deaths: ct.deaths ?? 0,
        t_rounds: t.rounds ?? 0, t_wins: t.wins ?? 0, t_kills: t.kills ?? 0, t_deaths: t.deaths ?? 0,
      });
    }
    return stats;
  };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 15) chunks.push(ids.slice(i, i + 15));
  const stats: CoreStat[] = [];
  for (let i = 0; i < chunks.length; i += STAT_PARALLEL) {
    for (const part of await Promise.all(chunks.slice(i, i + STAT_PARALLEL).map(loadChunk))) stats.push(...part);
  }

  const steamIds = [...new Set(stats.map((s) => s.steam_id))];
  const players: Record<string, TwentyPlayer> = {};
  const elo: Record<string, number> = {};
  for (let i = 0; i < steamIds.length; i += 200) {
    const { data: rows } = await db().from("players").select("steam_id, nickname, avatar_url, faceit_elo").in("steam_id", steamIds.slice(i, i + 200)).throwOnError();
    for (const p of rows ?? []) {
      players[p.steam_id] = { nickname: p.nickname, avatar_url: p.avatar_url };
      if (p.faceit_elo) elo[p.steam_id] = p.faceit_elo;
    }
  }
  return { games, info, stats, players, elo, fixed: await loadFixedSeasons() };
}

/**
 * Игрок в «Миксе» для его профиля: место, строка рейтинга, напарник и соперники. null — в рейтинге его нет.
 * В кэше до 2 минут и по одному игроку: свежесть до секунды профилю не нужна, а запись остаётся маленькой.
 */
export const getTwentyProfile = unstable_cache(
  async (steamId: string) => {
    const data = await loadTwentyData();
    const twenty = buildTwenty(data.games, data.stats, { fixed: data.fixed });
    const place = twenty.rows.findIndex((r) => r.steam_id === steamId);
    if (place < 0) return null;
    const relations = twenty.relations(steamId);
    // место в сезоне, который идёт сейчас (null — в этом месяце не играл)
    const season = buildTwenty(data.games, data.stats, { season: currentSeason() });
    const seasonPlace = season.rows.findIndex((r) => r.steam_id === steamId);
    const seasonRow = seasonPlace >= 0 ? season.rows[seasonPlace] : null;
    const players: Record<string, TwentyPlayer> = {};
    for (const id of [steamId, relations.partner?.steam_id, relations.nemesis?.steam_id, relations.victim?.steam_id]) if (id && data.players[id]) players[id] = data.players[id];
    return {
      place: place + 1,
      total: twenty.rows.length,
      row: twenty.rows[place],
      relations,
      players,
      achievements: twenty.achievements(steamId),
      history: twenty.history(steamId),
      season: seasonRow ? { key: currentSeason(), place: seasonPlace + 1, rating: seasonRow.rating, maps: seasonRow.maps, qualified: seasonRow.qualified, prize: seasonRow.prize } : null,
    };
  },
  ["twenty-profile", "v2"],
  { revalidate: 120 },
);

/** Вечера: последние большие лобби, по которым есть сыгранные матчи */
export function eveningsOf(games: CoreGame[]): TwentyEvening[] {
  const byCode = new Map<string, TwentyEvening>();
  for (const g of games) {
    if (!g.code || !g.finished_at) continue;
    const e = byCode.get(g.code);
    if (!e) byCode.set(g.code, { code: g.code, finished_at: g.finished_at, matches: 1 });
    else e.matches++;
  }
  return [...byCode.values()].slice(0, 12);
}

/** Сколько последних игр показывает вкладка «Игры» */
export const MIX_GAMES_SHOWN = 60;

/** Последние игры выбранного отрезка (сезон, вечер или всё время) с составами: состав — те, кто реально играл, по статистике карт */
export function mixGames(data: TwentyData, opts: TwentyScope = {}): MixGame[] {
  const scoped = (opts.code ? data.games.filter((g) => g.code === opts.code) : opts.season ? data.games.filter((g) => seasonOf(g.finished_at) === opts.season) : data.games).slice(0, MIX_GAMES_SHOWN);
  const ids = new Set(scoped.map((g) => g.id));
  const rosters = new Map<string, Map<string, { steam_id: string; name: string | null; team: number; kills: number; deaths: number }>>();
  for (const s of data.stats) {
    if (!ids.has(s.game_id)) continue;
    const roster = rosters.get(s.game_id) ?? rosters.set(s.game_id, new Map()).get(s.game_id)!;
    const p = roster.get(s.steam_id) ?? roster.set(s.steam_id, { steam_id: s.steam_id, name: s.name, team: s.team, kills: 0, deaths: 0 }).get(s.steam_id)!;
    p.kills += s.kills;
    p.deaths += s.deaths;
  }
  return scoped.map((g) => {
    const roster = [...(rosters.get(g.id)?.values() ?? [])].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const team = (n: number): MixTeam => ({ name: data.info[g.id]?.names[n - 1] ?? `Команда ${n}`, players: roster.filter((p) => p.team === n).map(({ steam_id, name, kills, deaths }) => ({ steam_id, name, kills, deaths })) });
    return { id: g.id, code: g.code, finished_at: g.finished_at, day: playDayOf(g.finished_at), winner: g.winner, score: data.info[g.id]?.score ?? [0, 0], maps: g.maps.filter((m) => m.status === "finished"), teams: [team(1), team(2)] };
  });
}

/** Рейтинг и всё остальное для страницы «Микс»: за сезон, за один вечер (код лобби) или за всё время */
export async function getTwenty(opts: TwentyScope = {}) {
  const data = await loadTwentyData();
  let twenty = buildTwenty(data.games, data.stats, { ...opts, fixed: data.fixed });
  // месяц закончился, а его итоги ещё не записаны — записываем один раз: дальше тройка от истории игр не зависит
  const fresh = data.fixed ? twenty.seasons.filter((s) => s.finished && !s.fixed && s.podium.length > 0) : [];
  if (data.fixed && fresh.length) {
    const rows = fresh.flatMap((s) => s.podium.map((p, i) => ({ season: s.key, place: i + 1, steam_id: p.steam_id, name: p.name, rating: Math.round(p.rating * 1000) / 1000, maps: p.maps, prize: p.prize })));
    const { error } = await db().from("mix_season_results").upsert(rows, { onConflict: "season,place", ignoreDuplicates: true });
    if (error) console.error("mix season fix", error.message);
    else {
      // запись могла уже существовать (два открытия разом) — показываем то, что реально лежит в базе
      const fixed = await loadFixedSeasons();
      if (fixed) twenty = buildTwenty(data.games, data.stats, { ...opts, fixed });
    }
  }
  return { ...twenty, players: data.players, evenings: eveningsOf(data.games), games: mixGames(data, opts) };
}

/** Короткая справка по игроку для комнаты лобби: рейтинг, роль, коронная карта и рейтинг по картам */
export type TwentyBrief = { rating: number; maps: number; wins: number; matches: number; kd: number; adr: number; hsPct: number; role: RoleKey | null; best: { map: string; rating: number } | null; byMap: { map: string; rating: number; rounds: number }[] };

/**
 * Справки по всем игрокам «Двадцатки» — комната лобби опрашивается раз в 1,5 с, поэтому результат лежит в кэше 5 минут:
 * подсказки капитанам не обязаны меняться в ту же секунду, когда закончилась карта.
 */
export const twentyBriefs = unstable_cache(
  async (): Promise<{ players: Record<string, TwentyBrief>; fit: EloFit | null }> => {
    const data = await loadTwentyData();
    const out: Record<string, TwentyBrief> = {};
    const rows = buildTwenty(data.games, data.stats).rows;
    for (const r of rows) {
      out[r.steam_id] = {
        rating: Math.round(r.rating * 100) / 100,
        maps: r.maps,
        wins: r.wins,
        matches: r.matches,
        kd: Math.round(r.kd * 100) / 100,
        adr: Math.round(r.adr),
        hsPct: Math.round(r.hsPct),
        role: r.role,
        best: r.best ? { map: r.best.map, rating: Math.round(r.best.rating * 100) / 100 } : null,
        byMap: r.byMap.map((c) => ({ map: c.map, rating: c.rating, rounds: c.rounds })),
      };
    }
    // связь ELO → рейтинг нужна, чтобы оценить силу тех, кто в «Миксе» ещё почти не играл
    return { players: out, fit: eloFit(rows.map((r) => ({ rating: r.rating, maps: r.maps, elo: data.elo[r.steam_id] ?? null }))) };
  },
  ["twenty-briefs", "v3"],
  { revalidate: 300 },
);

/** Перевес команд по картам пула — для вето (см. mapEdge) */
export function vetoEdge(briefs: Record<string, TwentyBrief>, team1: string[], team2: string[], pool: string[]) {
  const edge = mapEdge(Object.entries(briefs).map(([steam_id, b]) => ({ steam_id, byMap: b.byMap })), team1, team2, pool);
  const round = (x: { rating: number; known: number } | null) => (x ? { rating: Math.round(x.rating * 100) / 100, known: x.known } : null);
  return Object.fromEntries(Object.entries(edge).map(([map, e]) => [map, { team1: round(e.team1), team2: round(e.team2) }]));
}
