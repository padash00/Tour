import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { notify } from "./audit";
import { generateBracket, resolveBracket, type BracketMatch, GRAND_FINAL_ADVANTAGE } from "./bracket";
import {
  FORMATS,
  groupLabel,
  roundRobinRounds,
  splitGroups,
  standings,
  swissFirstRound,
  swissPairings,
  type FormatKind,
  type StageMatch,
} from "./formats";
import { db } from "./supabase";
import type { BracketSyncRow, Match, MatchMap, SeriesResult, StageCreateMode, SyncBracketResult, Team, Tournament, VetoActionRow } from "./types";
import { VETO_STEP_SECONDS, vetoState } from "./veto";

export type MatchWithTeams = Match & { team1: Team | null; team2: Team | null };

const MATCH_SELECT = "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)";

// Геттеры для страниц обёрнуты в React cache(): generateMetadata и страница в одном рендере делают один
// запрос. Вне рендера (Server Actions, маршруты API) cache() ничего не кэширует. Логика, которой нужно
// свежее состояние после собственной записи (вето, стадии), читает некэшированные load*/fetch*.

export const getTournamentMatches = cache(async (tournamentId: string): Promise<MatchWithTeams[]> => {
  const { data } = await db()
    .from("matches")
    .select(MATCH_SELECT)
    .eq("tournament_id", tournamentId)
    .order("number");
  return (data ?? []) as MatchWithTeams[];
});

export type MatchFull = MatchWithTeams & {
  tournament: Tournament;
  maps: MatchMap[];
  veto: VetoActionRow[];
};

async function fetchMatch(id: string): Promise<MatchFull | null> {
  const { data } = await db()
    .from("matches")
    .select(`${MATCH_SELECT}, tournament:tournaments(*), maps:match_maps(*), veto:veto_actions(*)`)
    .eq("id", id)
    .maybeSingle().throwOnError();
  if (!data) return null;
  const m = data as MatchFull;
  m.maps.sort((a, b) => a.map_number - b.map_number);
  m.veto.sort((a, b) => a.step - b.step);
  return m;
}

export const getMatch = cache(fetchMatch);

/** Матчи команды (кроме отменённых и технических без соперника) */
export const getTeamMatches = cache(async (teamId: string): Promise<(MatchWithTeams & { tournament: Tournament })[]> => {
  const { data } = await db()
    .from("matches")
    .select(`${MATCH_SELECT}, tournament:tournaments(*)`)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .neq("status", "cancelled")
    .order("number");
  return ((data ?? []) as (MatchWithTeams & { tournament: Tournament })[]).filter(
    // черновик турнира виден только админу — его матчи игроку не показываем
    (m) => !(m.is_walkover && (!m.team1_id || !m.team2_id)) && m.tournament?.status !== "draft",
  );
});

/** Состав команды на турнир — кто может действовать в вето и видеть данные сервера */
export async function getMatchRosters(match: Match) {
  const ids = [match.team1_id, match.team2_id].filter(Boolean) as string[];
  if (ids.length === 0) return { team1: [], team2: [] };
  const { data } = await db()
    .from("tournament_roster_players")
    .select("role, player:players(*), registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(team_id)")
    .eq("tournament_id", match.tournament_id)
    .in("registration.team_id", ids);
  const rows = data ?? [];
  return {
    team1: rows.filter((r) => r.registration.team_id === match.team1_id),
    team2: rows.filter((r) => r.registration.team_id === match.team2_id),
  };
}

// ───────────────────────── сетка

function toBracket(m: Match): BracketMatch {
  return {
    key: m.id,
    number: m.number,
    bracket: m.bracket,
    round: m.round,
    position: m.position,
    best_of: m.best_of,
    status: m.status,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    winner_id: m.winner_id,
    is_walkover: m.is_walkover,
    winner_to: m.winner_to_match ? { key: m.winner_to_match, slot: m.winner_to_slot ?? 1 } : null,
    loser_to: m.loser_to_match ? { key: m.loser_to_match, slot: m.loser_to_slot ?? 1 } : null,
  };
}

const syncRow = (m: Pick<Match, "status" | "team1_id" | "team2_id" | "winner_id" | "is_walkover">, id: string): BracketSyncRow => ({
  id,
  status: m.status,
  team1_id: m.team1_id,
  team2_id: m.team2_id,
  winner_id: m.winner_id,
  is_walkover: m.is_walkover,
});

/**
 * Чистый расчёт сетки плей-офф по снимку матчей: `expected` — снимок для сверки в базе,
 * `updates` — изменённые матчи. Пустой `updates` — сетка уже согласована.
 */
export function planBracketSync(rows: Match[]) {
  const playoff = rows.filter((r) => (r.stage ?? "playoff") === "playoff");
  const bm = playoff.map(toBracket);
  const changed = resolveBracket(bm);
  return {
    expected: playoff.map((r) => syncRow(r, r.id)),
    updates: bm.filter((m) => changed.has(m.key)).map((m) => syncRow(m, m.key)),
  };
}

const SYNC_ATTEMPTS = 5;

/** Применяет результаты к сетке плей-офф, затем двигает стадии (следующий раунд швейцарки, создание плей-офф) */
export async function syncBracket(tournamentId: string) {
  let nowUpcoming: string[] = [];
  // Оптимистичная запись: база применяет изменения, только если сетка не менялась с момента чтения.
  // Иначе (параллельный пересчёт или новый результат) — читаем заново и пересчитываем.
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await db().from("matches").select("*").eq("tournament_id", tournamentId).eq("stage", "playoff");
    if (error) throw new Error("Не удалось прочитать сетку", { cause: error });
    const { expected, updates } = planBracketSync((data ?? []) as Match[]);
    if (updates.length === 0) break;
    const { data: result, error: applyError } = await db().rpc("sync_bracket_apply", {
      p_tournament: tournamentId,
      p_expected: expected,
      p_updates: updates,
    });
    if (applyError) throw new Error("Не удалось обновить сетку", { cause: applyError });
    const applied = result as SyncBracketResult | null;
    if (applied?.status === "ok") {
      nowUpcoming = applied.upcoming ?? [];
      break;
    }
    if (attempt >= SYNC_ATTEMPTS) throw new Error("Сетка меняется одновременно из нескольких мест — повторите позже");
  }

  if (nowUpcoming.length) await afterMatchesUpcoming(tournamentId, nowUpcoming);
  await progressStages(tournamentId);
}

/** Уведомить капитанов и, если в маппуле одна карта, сразу подготовить матч (вето не нужно) */
async function afterMatchesUpcoming(tournamentId: string, matchIds: string[]) {
  if (matchIds.length === 0) return;
  const [{ data: t }, { data: list }] = await Promise.all([
    db().from("tournaments").select("map_pool").eq("id", tournamentId).single(),
    db().from("matches").select("id, number, team1_id, team2_id").in("id", matchIds),
  ]);
  const pool = (t?.map_pool ?? []) as string[];
  const teamIds = (list ?? []).flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean) as string[];
  const { data: teams } = teamIds.length
    ? await db().from("teams").select("id, captain_id, name").in("id", teamIds)
    : { data: [] as { id: string; captain_id: string; name: string }[] };
  for (const m of list ?? []) {
    if (pool.length === 1) {
      // одна карта (например aim_map): BO3 — эта карта три раза, MatchZy перезагружает её между играми.
      // Карты серии и статус «готов» записываются одной транзакцией.
      const { error } = await db().rpc("finish_veto", { p_match: m.id, p_single_map: pool[0] });
      if (error) throw new Error("Не удалось подготовить карты матча", { cause: error });
    }
    const t1 = teams?.find((x) => x.id === m.team1_id);
    const t2 = teams?.find((x) => x.id === m.team2_id);
    if (!t1 || !t2) continue;
    await notify(
      [t1.captain_id, t2.captain_id],
      `Матч #${m.number}: ${t1.name} vs ${t2.name}`,
      pool.length === 1
        ? "Соперник определён. Карта одна — вето не нужно, ждите сервер."
        : "Соперник определён. Вето карт начнётся по сигналу администратора.",
      `/matches/${m.id}`,
    );
  }
}

type NewMatch = {
  bracket: Match["bracket"];
  stage: Match["stage"];
  group_label?: string | null;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  best_of: number;
};

/**
 * Записывает матчи стадии вместе с отметкой о ней (create_stage_matches). Номера матчей относительные —
 * сквозной номер назначает база. false — стадия уже создана (повтор или параллельный вызов).
 */
async function saveStage(tournamentId: string, mode: StageCreateMode, rows: { id: string; status: string; team1_id: string | null; team2_id: string | null }[]) {
  const { data: created, error } = await db().rpc("create_stage_matches", { p_tournament: tournamentId, p_mode: mode, p_rows: rows });
  if (error) throw new Error(error.message);
  if (!created) return false;
  await afterMatchesUpcoming(
    tournamentId,
    rows.filter((r) => r.status === "upcoming" && r.team1_id && r.team2_id).map((r) => r.id),
  );
  return true;
}

async function insertStageMatches(tournament: Tournament, list: NewMatch[], mode: StageCreateMode) {
  const finishedAt = new Date().toISOString();
  const rows = list.map((m, i) => {
    // бай швейцарки: соперника нет — сразу техническая победа
    const bye = m.stage === "swiss" && !!m.team1_id && !m.team2_id;
    return {
      id: randomUUID(),
      number: i + 1,
      status: m.team1_id && m.team2_id ? "upcoming" : bye ? "finished" : "pending",
      winner_id: bye ? m.team1_id : null,
      is_walkover: bye,
      finished_at: bye ? finishedAt : null,
      ...m,
    };
  });
  return saveStage(tournament.id, mode, rows);
}

/** Создаёт первую стадию турнира по его формату */
export async function createBracket(tournament: Tournament, seededTeamIds: string[]) {
  const kind = tournament.bracket_type as FormatKind;
  const bo = tournament.default_best_of ?? 1;

  let created: boolean;
  if (kind === "round_robin" || kind === "groups_playoff") {
    const groupsCount = Math.max(1, Math.min(tournament.groups_count ?? 2, Math.floor(seededTeamIds.length / 2)));
    const groups = kind === "round_robin" ? [seededTeamIds] : splitGroups(seededTeamIds, groupsCount);
    const list: NewMatch[] = [];
    let position = 0;
    groups.forEach((g, gi) => {
      roundRobinRounds(g).forEach((pairs, ri) =>
        pairs.forEach(([a, b]) =>
          list.push({
            bracket: "group",
            stage: "group",
            group_label: groupLabel(gi),
            round: ri + 1,
            position: position++,
            team1_id: a,
            team2_id: b,
            best_of: bo,
          }),
        ),
      );
    });
    // номера матчей: тур за туром по всем группам
    list.sort((x, y) => x.round - y.round || (x.group_label ?? "").localeCompare(y.group_label ?? "") || x.position - y.position);
    created = await insertStageMatches(tournament, list, "bracket");
  } else if (kind === "swiss" || kind === "swiss_playoff") {
    const pairs = swissFirstRound(seededTeamIds);
    created = await insertStageMatches(
      tournament,
      pairs.map(([a, b], i) => ({ bracket: "swiss", stage: "swiss", round: 1, position: i, team1_id: a, team2_id: b, best_of: bo })),
      "bracket",
    );
  } else {
    created = await createEliminationStage(tournament, seededTeamIds, kind === "double_elimination", "bracket");
  }
  if (!created) throw new Error("Сетка уже создана");
  await syncBracket(tournament.id);
}

/** Сетка на выбывание (весь турнир или плей-офф после групп/швейцарки) */
async function createEliminationStage(tournament: Tournament, seededTeamIds: string[], double: boolean, mode: StageCreateMode) {
  // матчи первого раунда создаются сразу «скоро» — уведомить и (при одной карте) подготовить серию,
  // как это делает syncBracket для следующих раундов
  return saveStage(tournament.id, mode, eliminationStageRows(tournament, seededTeamIds, double));
}

/** Строки матчей сетки на выбывание для create_stage_matches (чистая функция, номера относительные) */
export function eliminationStageRows(
  tournament: Pick<Tournament, "default_best_of" | "final_best_of">,
  seededTeamIds: string[],
  double: boolean,
) {
  const generated = generateBracket({
    seeded: seededTeamIds,
    double,
    bestOf: tournament.default_best_of ?? 1,
    finalBestOf: tournament.final_best_of ?? 3,
  });
  const ids = new Map(generated.map((m) => [m.key, randomUUID()]));
  const finishedAt = new Date().toISOString();
  return generated.map((m) => ({
    id: ids.get(m.key)!,
    number: m.number,
    bracket: m.bracket,
    stage: "playoff",
    round: m.round,
    position: m.position,
    best_of: m.best_of,
    status: m.status,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    winner_id: m.winner_id,
    is_walkover: m.is_walkover,
    finished_at: m.status === "finished" ? finishedAt : null,
    winner_to_match: m.winner_to ? ids.get(m.winner_to.key)! : null,
    winner_to_slot: m.winner_to?.slot ?? null,
    loser_to_match: m.loser_to ? ids.get(m.loser_to.key)! : null,
    loser_to_slot: m.loser_to?.slot ?? null,
  }));
}

/** Команды стадии (группы/швейцарки) в порядке посева и матчи стадии */
async function loadStageData(tournamentId: string) {
  const [{ data: regs }, { data: ms }] = await Promise.all([
    db().from("tournament_registrations").select("team_id, seed").eq("tournament_id", tournamentId).eq("status", "approved").order("seed"),
    db()
      .from("matches")
      .select("*, maps:match_maps(team1_score, team2_score, winner_id, status)")
      .eq("tournament_id", tournamentId)
      .in("stage", ["group", "swiss"])
      .order("number"),
  ]);
  const matches = (ms ?? []) as (Match & { maps: StageMatch["maps"] })[];
  const inStage = new Set(matches.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean) as string[]);
  const seeded = (regs ?? []).map((r) => r.team_id as string).filter((id) => inStage.has(id));
  return { seeded, matches };
}

export const getStageData = cache(loadStageData);

function stageTables(tournament: Tournament, { seeded, matches }: Awaited<ReturnType<typeof loadStageData>>) {
  const kind = tournament.bracket_type as FormatKind;
  if (kind === "swiss" || kind === "swiss_playoff") {
    return [{ label: null as string | null, table: standings(seeded, matches, { swiss: true, swissWins: tournament.swiss_wins }), matches }];
  }
  const labels = [...new Set(matches.map((m) => m.group_label ?? "A"))].sort();
  return labels.map((label) => {
    const gm = matches.filter((m) => (m.group_label ?? "A") === label);
    const ids = seeded.filter((id) => gm.some((m) => m.team1_id === id || m.team2_id === id));
    return { label: label as string | null, table: standings(ids, gm), matches: gm };
  });
}

/** Таблицы групп / швейцарки */
export async function getStandings(tournament: Tournament) {
  return stageTables(tournament, await getStageData(tournament.id));
}

/**
 * Двигает стадии: новый раунд швейцарки, когда текущий сыгран; плей-офф, когда закончилась
 * групповая/швейцарская стадия.
 */
export async function progressStages(tournamentId: string) {
  const { data: t } = await db().from("tournaments").select("*").eq("id", tournamentId).single();
  const tournament = t as Tournament | null;
  if (!tournament?.bracket_published_at) return;
  const kind = tournament.bracket_type as FormatKind;
  if (!["round_robin", "groups_playoff", "swiss", "swiss_playoff"].includes(kind)) return;

  const stage = await loadStageData(tournament.id);
  const { seeded, matches } = stage;
  if (matches.length === 0 || matches.some((m) => !["finished", "cancelled"].includes(m.status))) return;

  const swiss = kind === "swiss" || kind === "swiss_playoff";
  if (swiss) {
    const table = standings(seeded, matches, { swiss: true, swissWins: tournament.swiss_wins });
    if (table.some((r) => r.status === "active")) {
      // сыгранные пары + полученные баи (`${id}:BYE`), чтобы бай не доставался одной команде дважды
      const played = new Set(
        matches.map((m) => (m.team1_id && m.team2_id ? [m.team1_id, m.team2_id].sort().join(":") : `${m.team1_id ?? m.team2_id}:BYE`)),
      );
      const round = Math.max(...matches.map((m) => m.round)) + 1;
      const pairs = swissPairings(table, played, tournament.swiss_wins);
      if (pairs.length) {
        // тур создаётся один раз: параллельный вызов получит false
        const created = await insertStageMatches(
          tournament,
          pairs.map(([a, b], i) => ({
            bracket: "swiss",
            stage: "swiss",
            round,
            position: i,
            team1_id: a,
            team2_id: b,
            best_of: tournament.default_best_of ?? 1,
          })),
          "round",
        );
        // раунд из одного бая играть некому — сразу двигаем стадию дальше
        if (created && pairs.every(([, b]) => !b)) await progressStages(tournamentId);
      }
      return;
    }
  }

  // стадия завершена → плей-офф (если формат его предполагает и он ещё не создан)
  if (!FORMATS[kind].playoff || tournament.playoff_created_at) return;
  let advancing: string[];
  if (swiss) {
    advancing = standings(seeded, matches, { swiss: true, swissWins: tournament.swiss_wins })
      .filter((r) => r.status === "advanced")
      .map((r) => r.teamId);
  } else {
    const groups = stageTables(tournament, stage).map((g) => g.table.slice(0, tournament.advance_per_group).map((r) => r.teamId));
    // посев плей-офф: все первые места по группам, затем все вторые… → A1–B2, B1–A2
    advancing = [];
    for (let place = 0; place < tournament.advance_per_group; place++) for (const g of groups) if (g[place]) advancing.push(g[place]);
  }
  if (advancing.length < 2) return;
  // матчи плей-офф и playoff_created_at пишутся одной транзакцией: при сбое отметка не остаётся,
  // а параллельный вызов не создаст плей-офф дважды
  const created = await createEliminationStage(tournament, advancing, tournament.playoff_type === "double_elimination", "playoff");
  if (created) await syncBracket(tournament.id);
}

// ───────────────────────── вето

/** Выполняет авто-баны/пики по истёкшим таймерам. Вызывается при открытии матча и при каждом действии. */
export async function applyVetoTimeouts(matchId: string) {
  for (let i = 0; i < 10; i++) {
    const m = await fetchMatch(matchId);
    if (!m || m.status !== "veto" || !m.veto_deadline) return;
    const deadline = new Date(m.veto_deadline).getTime();
    if (deadline > Date.now()) return;
    const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
    if (!state.current || state.current.action === "decider") {
      await completeVeto(m);
      return;
    }
    const map = state.remaining[Math.floor(Math.random() * state.remaining.length)];
    const teamId = state.current.team === 1 ? m.team1_id : m.team2_id;
    const ok = await insertVetoAction(m, map, teamId, null, true, new Date(deadline + VETO_STEP_SECONDS * 1000));
    if (!ok) return;
  }
}

/** Все вето, у которых истёк таймер хода, — авто-бан/пик (вызывается на каждой синхронизации агента) */
export async function applyDueVetoTimeouts() {
  const { data } = await db()
    .from("matches")
    .select("id")
    .eq("status", "veto")
    .lt("veto_deadline", new Date().toISOString());
  for (const m of data ?? []) await applyVetoTimeouts(m.id);
  return data?.length ?? 0;
}

/** Записывает шаг вето; если остался decider — дописывает его и завершает вето. */
export async function insertVetoAction(
  m: MatchFull,
  map: string,
  teamId: string | null,
  actorId: string | null,
  auto: boolean,
  nextDeadline: Date,
): Promise<boolean> {
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  if (!state.current || state.current.action === "decider") return false;
  const { error } = await db().from("veto_actions").insert({
    match_id: m.id,
    step: state.current.step,
    team_id: teamId,
    action: state.current.action,
    map_name: map,
    auto,
    actor_id: actorId,
  });
  if (error) return false; // кто-то успел раньше

  const fresh = (await fetchMatch(m.id))!;
  const next = vetoState(fresh.best_of, fresh.tournament.map_pool, fresh.veto);
  if (next.current?.action === "decider" || next.complete) {
    await completeVeto(fresh);
  } else {
    await db().from("matches").update({ veto_deadline: nextDeadline.toISOString() }).eq("id", m.id).eq("status", "veto");
  }
  return true;
}

/**
 * Дописывает decider (если его ещё нет) и завершает вето: карты серии и статус «готов» —
 * одной транзакцией finish_veto под блокировкой матча. Параллельные вызовы (таймер и ход капитана)
 * безопасны: decider защищён unique(match_id, step), повторное завершение ничего не меняет.
 */
async function completeVeto(m: MatchFull) {
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  if (state.current?.action === "decider") {
    await db().from("veto_actions").insert({
      match_id: m.id,
      step: state.current.step,
      team_id: null,
      action: "decider",
      map_name: state.remaining[0],
      auto: true,
    });
  } else if (!state.complete) {
    return;
  }
  const { error } = await db().rpc("finish_veto", { p_match: m.id });
  if (error) throw new Error("Не удалось завершить вето", { cause: error });
}

// ───────────────────────── результат

/** Пересчитывает счёт серии по картам; если кто-то набрал нужное число карт — завершает матч. */
export async function recomputeSeries(matchId: string) {
  const { data, error } = await db().rpc("recompute_match_series", { p_match: matchId, p_advantage: GRAND_FINAL_ADVANTAGE });
  if (error) throw new Error("Не удалось сохранить результат серии", { cause: error });
  const series = data as SeriesResult | null;
  if (series?.winner) await syncBracket(series.tournament_id);
}

/** Ближайшие и идущие матчи опубликованных турниров: live/вето сверху, дальше по времени начала */
export async function getUpcomingMatches(limit = 6) {
  const { data } = await db()
    .from("matches")
    .select(`${MATCH_SELECT}, tournament:tournaments!inner(id, name, slug, status)`)
    .in("status", ["upcoming", "veto", "ready", "live"])
    .neq("tournament.status", "draft")
    .not("team1_id", "is", null)
    .not("team2_id", "is", null);
  const order = { live: 0, veto: 1, ready: 2, upcoming: 3 } as Record<string, number>;
  return ((data ?? []) as (MatchWithTeams & { tournament: Pick<Tournament, "id" | "name" | "slug" | "status"> })[])
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") ||
        a.number - b.number,
    )
    .slice(0, limit);
}
