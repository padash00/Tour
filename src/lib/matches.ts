import "server-only";
import { randomUUID } from "node:crypto";
import { notify } from "./audit";
import { generateBracket, resolveBracket, type BracketMatch } from "./bracket";
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
    (m) => !(m.is_walkover && (!m.team1_id || !m.team2_id)),
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

/** Применяет результаты к сетке: продвигает команды, обрабатывает баи, уведомляет капитанов */
export async function syncBracket(tournamentId: string) {
  const { data } = await db().from("matches").select("*").eq("tournament_id", tournamentId);
  const rows = (data ?? []) as Match[];
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

  if (nowUpcoming.length) {
    const teamIds = bm.filter((m) => nowUpcoming.includes(m.key)).flatMap((m) => [m.team1_id, m.team2_id]);
    const { data: teams } = await db().from("teams").select("id, captain_id, name").in("id", teamIds as string[]);
    for (const m of bm.filter((x) => nowUpcoming.includes(x.key))) {
      const t1 = teams?.find((t) => t.id === m.team1_id);
      const t2 = teams?.find((t) => t.id === m.team2_id);
      if (!t1 || !t2) continue;
      await notify(
        [t1.captain_id, t2.captain_id],
        `Матч #${m.number}: ${t1.name} vs ${t2.name}`,
        "Соперник определён. Вето карт начнётся по сигналу администратора.",
        `/matches/${m.key}`,
      );
    }
  }
}

export async function createBracket(tournament: Tournament, seededTeamIds: string[]) {
  const generated = generateBracket({
    seeded: seededTeamIds,
    double: tournament.bracket_type === "double_elimination",
    bestOf: tournament.default_best_of ?? 1,
    finalBestOf: tournament.final_best_of ?? 3,
  });
  const ids = new Map(generated.map((m) => [m.key, randomUUID()]));
  const rows = generated.map((m) => ({
    id: ids.get(m.key)!,
    tournament_id: tournament.id,
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
    finished_at: m.status === "finished" ? new Date().toISOString() : null,
    winner_to_match: m.winner_to ? ids.get(m.winner_to.key)! : null,
    winner_to_slot: m.winner_to?.slot ?? null,
    loser_to_match: m.loser_to ? ids.get(m.loser_to.key)! : null,
    loser_to_slot: m.loser_to?.slot ?? null,
  }));
  const { error } = await db().from("matches").insert(rows);
  if (error) throw new Error(error.message);
  await db().from("tournaments").update({ bracket_published_at: new Date().toISOString() }).eq("id", tournament.id);
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
  const s1 = m.maps.filter((x) => x.winner_id && x.winner_id === m.team1_id).length;
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
