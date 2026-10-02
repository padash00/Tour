import "server-only";
import { randomUUID } from "node:crypto";
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
import type { Match, MatchMap, Player, Team, Tournament, VetoActionRow } from "./types";
import { VETO_STEP_SECONDS, seriesMaps, vetoState } from "./veto";

export type MatchWithTeams = Match & { team1: Team | null; team2: Team | null };

const MATCH_SELECT = "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)";

export async function getTournamentMatches(tournamentId: string): Promise<MatchWithTeams[]> {
  const { data } = await db()
    .from("matches")
    .select(MATCH_SELECT)
    .eq("tournament_id", tournamentId)
    .order("number");
  return (data ?? []) as MatchWithTeams[];
}

export type MatchFull = MatchWithTeams & {
  tournament: Tournament;
  maps: MatchMap[];
  veto: VetoActionRow[];
};

export async function getMatch(id: string): Promise<MatchFull | null> {
  const { data } = await db()
    .from("matches")
    .select(`${MATCH_SELECT}, tournament:tournaments(*), maps:match_maps(*), veto:veto_actions(*)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const m = data as MatchFull;
  m.maps.sort((a, b) => a.map_number - b.map_number);
  m.veto.sort((a, b) => a.step - b.step);
  return m;
}

/** Матчи команды (кроме отменённых и технических без соперника) */
export async function getTeamMatches(teamId: string): Promise<(MatchWithTeams & { tournament: Tournament })[]> {
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
}

/** Состав команды на турнир — кто может действовать в вето и видеть данные сервера */
export async function getMatchRosters(match: Match) {
  const ids = [match.team1_id, match.team2_id].filter(Boolean) as string[];
  if (ids.length === 0) return { team1: [], team2: [] };
  const { data } = await db()
    .from("tournament_roster_players")
    .select("role, player:players(*), registration:tournament_registrations!inner(team_id)")
    .eq("tournament_id", match.tournament_id)
    .in("registration.team_id", ids);
  type Row = { role: "main" | "sub"; player: Player; registration: { team_id: string } };
  const rows = (data ?? []) as unknown as Row[];
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

/** Применяет результаты к сетке плей-офф, затем двигает стадии (следующий раунд швейцарки, создание плей-офф) */
export async function syncBracket(tournamentId: string) {
  const { data } = await db().from("matches").select("*").eq("tournament_id", tournamentId);
  const rows = ((data ?? []) as Match[]).filter((r) => (r.stage ?? "playoff") === "playoff");
  const before = new Map(rows.map((r) => [r.id, r]));
  const bm = rows.map(toBracket);
  const changed = resolveBracket(bm);

  const nowUpcoming: string[] = [];
  for (const m of bm) {
    if (!changed.has(m.key)) continue;
    const prev = before.get(m.key)!;
    if (prev.status !== "upcoming" && m.status === "upcoming") nowUpcoming.push(m.key);
    await db()
      .from("matches")
      .update({
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        status: m.status,
        winner_id: m.winner_id,
        is_walkover: m.is_walkover,
        ...(m.status === "finished" && !prev.finished_at && { finished_at: new Date().toISOString() }),
      })
      .eq("id", m.key);
  }

  if (nowUpcoming.length) await afterMatchesUpcoming(tournamentId, nowUpcoming);
  await progressStages(tournamentId);
}

/** Уведомить капитанов и, если в маппуле одна карта, сразу подготовить матч (вето не нужно) */
async function afterMatchesUpcoming(tournamentId: string, matchIds: string[]) {
  if (matchIds.length === 0) return;
  const [{ data: t }, { data: list }] = await Promise.all([
    db().from("tournaments").select("map_pool").eq("id", tournamentId).single(),
    db().from("matches").select("id, number, team1_id, team2_id, best_of").in("id", matchIds),
  ]);
  const pool = (t?.map_pool ?? []) as string[];
  const teamIds = (list ?? []).flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean) as string[];
  const { data: teams } = teamIds.length
    ? await db().from("teams").select("id, captain_id, name").in("id", teamIds)
    : { data: [] as { id: string; captain_id: string; name: string }[] };
  for (const m of list ?? []) {
    if (pool.length === 1) {
      // одна карта (например aim_map): BO3 — эта карта три раза, MatchZy перезагружает её между играми
      const n = Math.max(1, m.best_of ?? 1);
      await db().from("match_maps").delete().eq("match_id", m.id);
      await db()
        .from("match_maps")
        .insert(Array.from({ length: n }, (_, i) => ({ match_id: m.id, map_number: i + 1, map_name: pool[0] })));
      await db().from("matches").update({ status: "ready" }).eq("id", m.id);
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

async function insertStageMatches(tournament: Tournament, list: NewMatch[]) {
  const { data: last } = await db()
    .from("matches")
    .select("number")
    .eq("tournament_id", tournament.id)
    .order("number", { ascending: false })
    .limit(1);
  let n = last?.[0]?.number ?? 0;
  const rows = list.map((m) => {
    // бай швейцарки: соперника нет — сразу техническая победа
    const bye = m.stage === "swiss" && !!m.team1_id && !m.team2_id;
    return {
      id: randomUUID(),
      tournament_id: tournament.id,
      number: ++n,
      status: m.team1_id && m.team2_id ? "upcoming" : bye ? "finished" : "pending",
      // одинаковый набор колонок у всех строк: при пакетной вставке недостающие поля стали бы NULL
      winner_id: bye ? m.team1_id : null,
      is_walkover: bye,
      finished_at: bye ? new Date().toISOString() : null,
      ...m,
    };
  });
  const { error } = await db().from("matches").insert(rows);
  if (error) throw new Error(error.message);
  await afterMatchesUpcoming(
    tournament.id,
    rows.filter((r) => r.status === "upcoming").map((r) => r.id),
  );
  return rows;
}

/** Создаёт первую стадию турнира по его формату */
export async function createBracket(tournament: Tournament, seededTeamIds: string[]) {
  const kind = tournament.bracket_type as FormatKind;
  const bo = tournament.default_best_of ?? 1;

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
    await insertStageMatches(tournament, list);
  } else if (kind === "swiss" || kind === "swiss_playoff") {
    const pairs = swissFirstRound(seededTeamIds);
    await insertStageMatches(
      tournament,
      pairs.map(([a, b], i) => ({ bracket: "swiss", stage: "swiss", round: 1, position: i, team1_id: a, team2_id: b, best_of: bo })),
    );
  } else {
    await createEliminationStage(tournament, seededTeamIds, kind === "double_elimination", 0);
  }
  await db().from("tournaments").update({ bracket_published_at: new Date().toISOString() }).eq("id", tournament.id);
  await syncBracket(tournament.id);
}

/** Сетка на выбывание (весь турнир или плей-офф после групп/швейцарки) */
async function createEliminationStage(tournament: Tournament, seededTeamIds: string[], double: boolean, numberOffset: number) {
  const generated = generateBracket({
    seeded: seededTeamIds,
    double,
    bestOf: tournament.default_best_of ?? 1,
    finalBestOf: tournament.final_best_of ?? 3,
  });
  const ids = new Map(generated.map((m) => [m.key, randomUUID()]));
  const rows = generated.map((m) => ({
    id: ids.get(m.key)!,
    tournament_id: tournament.id,
    number: m.number + numberOffset,
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
    finished_at: m.status === "finished" ? new Date().toISOString() : null,
    winner_to_match: m.winner_to ? ids.get(m.winner_to.key)! : null,
    winner_to_slot: m.winner_to?.slot ?? null,
    loser_to_match: m.loser_to ? ids.get(m.loser_to.key)! : null,
    loser_to_slot: m.loser_to?.slot ?? null,
  }));
  const { error } = await db().from("matches").insert(rows);
  if (error) throw new Error(error.message);
  // матчи первого раунда создаются сразу «скоро» — уведомить и (при одной карте) подготовить серию,
  // как это делает syncBracket для следующих раундов
  await afterMatchesUpcoming(
    tournament.id,
    rows.filter((r) => r.status === "upcoming" && r.team1_id && r.team2_id).map((r) => r.id),
  );
}

/** Команды стадии (группы/швейцарки) в порядке посева и матчи стадии */
export async function getStageData(tournamentId: string) {
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

/** Таблицы групп / швейцарки */
export async function getStandings(tournament: Tournament) {
  const { seeded, matches } = await getStageData(tournament.id);
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

  const { seeded, matches } = await getStageData(tournament.id);
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
        await insertStageMatches(
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
        );
        // раунд из одного бая играть некому — сразу двигаем стадию дальше
        if (pairs.every(([, b]) => !b)) await progressStages(tournamentId);
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
    const groups = (await getStandings(tournament)).map((g) => g.table.slice(0, tournament.advance_per_group).map((r) => r.teamId));
    // посев плей-офф: все первые места по группам, затем все вторые… → A1–B2, B1–A2
    advancing = [];
    for (let place = 0; place < tournament.advance_per_group; place++) for (const g of groups) if (g[place]) advancing.push(g[place]);
  }
  if (advancing.length < 2) return;
  // отметку ставим до создания — чтобы параллельный вызов не создал плей-офф дважды
  const { data: claimed } = await db()
    .from("tournaments")
    .update({ playoff_created_at: new Date().toISOString() })
    .eq("id", tournament.id)
    .is("playoff_created_at", null)
    .select("id");
  if (!claimed?.length) return;
  const last = Math.max(0, ...matches.map((m) => m.number));
  await createEliminationStage(tournament, advancing, tournament.playoff_type === "double_elimination", last);
  await syncBracket(tournament.id);
}

// ───────────────────────── вето

/** Выполняет авто-баны/пики по истёкшим таймерам. Вызывается при открытии матча и при каждом действии. */
export async function applyVetoTimeouts(matchId: string) {
  for (let i = 0; i < 10; i++) {
    const m = await getMatch(matchId);
    if (!m || m.status !== "veto" || !m.veto_deadline) return;
    const deadline = new Date(m.veto_deadline).getTime();
    if (deadline > Date.now()) return;
    const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
    if (!state.current || state.current.action === "decider") {
      await finishVetoIfComplete(m);
      return;
    }
    const map = state.remaining[Math.floor(Math.random() * state.remaining.length)];
    const teamId = state.current.team === 1 ? m.team1_id : m.team2_id;
    const ok = await insertVetoAction(m, map, teamId, null, true, new Date(deadline + VETO_STEP_SECONDS * 1000));
    if (!ok) return;
  }
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

  const fresh = (await getMatch(m.id))!;
  const next = vetoState(fresh.best_of, fresh.tournament.map_pool, fresh.veto);
  if (next.current?.action === "decider") {
    await db().from("veto_actions").insert({
      match_id: m.id,
      step: next.current.step,
      team_id: null,
      action: "decider",
      map_name: next.remaining[0],
      auto: true,
    });
    await finishVetoIfComplete((await getMatch(m.id))!);
  } else {
    await db().from("matches").update({ veto_deadline: nextDeadline.toISOString() }).eq("id", m.id);
  }
  return true;
}

async function finishVetoIfComplete(m: MatchFull) {
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  if (!state.complete) return;
  const maps = seriesMaps(m.veto);
  await db().from("match_maps").delete().eq("match_id", m.id);
  await db()
    .from("match_maps")
    .insert(maps.map((x, i) => ({ match_id: m.id, map_number: i + 1, map_name: x.map_name, picked_by: x.picked_by })));
  await db().from("matches").update({ status: "ready", veto_deadline: null }).eq("id", m.id).eq("status", "veto");
}

// ───────────────────────── результат

/** Пересчитывает счёт серии по картам; если кто-то набрал нужное число карт — завершает матч. */
export async function recomputeSeries(matchId: string) {
  const m = await getMatch(matchId);
  if (!m) return;
  const need = Math.floor(m.best_of / 2) + 1;
  // фора в гранд-финале Double Elimination: команде из верхней сетки (слот 1) +1 карта
  const advantage = m.bracket === "grand_final" && m.best_of >= 3 ? GRAND_FINAL_ADVANTAGE : 0;
  const s1 = m.maps.filter((x) => x.winner_id && x.winner_id === m.team1_id).length + advantage;
  const s2 = m.maps.filter((x) => x.winner_id && x.winner_id === m.team2_id).length;
  const winner = s1 >= need ? m.team1_id : s2 >= need ? m.team2_id : null;

  await db()
    .from("matches")
    .update({
      team1_score: s1,
      team2_score: s2,
      ...(winner && { status: "finished", winner_id: winner, finished_at: new Date().toISOString() }),
    })
    .eq("id", m.id);

  if (winner && advantage && winner === m.team1_id && m.server_instance) {
    // серию закрыла фора — MatchZy об этом не знает и запустил бы следующую карту
    await db().from("agent_commands").insert({ instance: m.server_instance, type: "end_match", payload: {} });
    await db().from("matches").update({ server_instance: null, server_state: null, server_address: null }).eq("id", m.id);
  }

  if (winner) {
    // несыгранные карты серии больше не нужны
    await db().from("match_maps").delete().eq("match_id", m.id).eq("status", "pending");
    await syncBracket(m.tournament_id);
  }
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
