import "server-only";
import { db } from "./supabase";
import type { VetoActionRow } from "./types";
import { checkinWindowError } from "./data";
import { vetoState } from "./veto";
import { getGame, getLobby, getMembers, lobbyVetoState, playerLobby } from "./lobby";

/**
 * Глобальная активность шапки — ОДНО самое срочное действие игрока прямо сейчас (не центр уведомлений).
 * Пассивное («заявка на рассмотрении», «турнир через 4 дня», «ход соперника») сюда не попадает —
 * оно живёт в «Моей игре» и уведомлениях.
 *
 * Приоритет — по тому, сколько времени есть на действие:
 *   1. Ваш ход: вето турнира, вето лобби, драфт лобби   — секунды (таймер хода 30–60 с)
 *   2. Проверка готовности лобби (вы не подтвердили)    — 30 секунд
 *   3. Сервер готов (вы в составе, турнир или лобби)    — минуты на подключение
 *   4. Check-in открыт (вы капитан, команда не прошла)  — десятки минут
 *   5. Ваш матч идёт (турнир или лобби)                 — вы уже должны быть в игре
 * При равенстве — у кого раньше дедлайн.
 */
export type ActivityKind = "veto_turn" | "lobby_veto_turn" | "lobby_draft_turn" | "lobby_ready_check" | "server_ready" | "lobby_server_ready" | "checkin" | "live" | "lobby_live";

export type Activity = {
  kind: ActivityKind;
  priority: 1 | 2 | 3 | 4 | 5;
  /** коротко для шапки: «Ваш ход · вето» */
  label: string;
  /** подробнее: «Матч #12 против Next Level» */
  detail: string;
  href: string;
  /** до какого времени действие актуально (таймер в шапке) */
  deadline: string | null;
  tone: "accent" | "warn" | "ok" | "live";
  /** адрес сервера — только при «сервер готов» и только участнику */
  connect: string | null;
  /** стабильный ключ: звук и мигание вкладки — один раз на событие */
  key: string;
};

export type ActivityState = { top: Activity | null; more: number };

export async function getPlayerActivity(playerId: string): Promise<ActivityState> {
  const [tournament, lobby] = await Promise.all([tournamentActivity(playerId).catch(() => []), lobbyActivity(playerId).catch(() => [])]);
  const all = [...tournament, ...lobby].sort(
    (a, b) => a.priority - b.priority || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
  );
  return { top: all[0] ?? null, more: Math.max(0, all.length - 1) };
}

async function tournamentActivity(playerId: string): Promise<Activity[]> {
  // команды игрока в одобренных составах турниров
  const { data: rows } = await db()
    .from("tournament_roster_players")
    .select("tournament_id, registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(id, team_id, status, checked_in_at)")
    .eq("player_id", playerId)
    .eq("registration.status", "approved");
  const regs = rows ?? [];
  if (!regs.length) return [];
  const teamIds = [...new Set(regs.map((r) => r.registration.team_id))];
  const tIds = [...new Set(regs.map((r) => r.tournament_id))];

  const [{ data: teams }, { data: tours }, { data: ms }] = await Promise.all([
    db().from("teams").select("id, name, captain_id").in("id", teamIds),
    db().from("tournaments").select("id, name, slug, status, map_pool, checkin_opens_at, checkin_closes_at").in("id", tIds),
    db()
      .from("matches")
      .select("id, number, status, tournament_id, best_of, team1_id, team2_id, veto_deadline, server_state, server_address, server_password, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name)")
      .in("status", ["veto", "ready", "live"])
      .in("tournament_id", tIds)
      .or(`team1_id.in.(${teamIds.join(",")}),team2_id.in.(${teamIds.join(",")})`),
  ]);
  const captainOf = new Map((teams ?? []).map((t) => [t.id, t.captain_id]));
  const tour = new Map((tours ?? []).map((t) => [t.id, t]));
  const out: Activity[] = [];

  const matches = (ms ?? []).filter((m) =>
    regs.some((r) => r.tournament_id === m.tournament_id && (r.registration.team_id === m.team1_id || r.registration.team_id === m.team2_id)),
  );
  const vetoIds = matches.filter((m) => m.status === "veto").map((m) => m.id);
  const { data: vetoRows } = vetoIds.length
    ? await db()
        .from("veto_actions")
        .select("match_id, step, team_id, action, map_name")
        .in("match_id", vetoIds)
        .overrideTypes<Pick<VetoActionRow, "action">[]>()
    : { data: [] as Pick<VetoActionRow, "match_id" | "step" | "team_id" | "action" | "map_name">[] };

  for (const m of matches) {
    const mine = regs.find((r) => r.tournament_id === m.tournament_id && (r.registration.team_id === m.team1_id || r.registration.team_id === m.team2_id))!;
    const myTeam = mine.registration.team_id;
    const opponent = (myTeam === m.team1_id ? m.team2?.name : m.team1?.name) ?? "соперник";
    const href = `/matches/${m.id}`;
    if (m.status === "veto") {
      const t = tour.get(m.tournament_id);
      const st = vetoState(m.best_of, t?.map_pool ?? [], (vetoRows ?? []).filter((v) => v.match_id === m.id));
      const turnTeam = st.current?.team === 1 ? m.team1_id : st.current?.team === 2 ? m.team2_id : null;
      if (turnTeam === myTeam && captainOf.get(myTeam) === playerId && st.current?.action !== "decider") {
        out.push({
          kind: "veto_turn",
          priority: 1,
          label: st.current?.action === "pick" ? "Ваш ход · пик карты" : "Ваш ход · бан карты",
          detail: `Вето матча #${m.number} против ${opponent}`,
          href,
          deadline: m.veto_deadline,
          tone: "accent",
          connect: null,
          key: `veto:${m.id}:${(vetoRows ?? []).filter((v) => v.match_id === m.id).length}`,
        });
      }
    } else if (m.status === "ready" && m.server_state === "ready" && m.server_address) {
      out.push({
        kind: "server_ready",
        priority: 3,
        label: "Сервер готов",
        detail: `Матч #${m.number} против ${opponent}`,
        href,
        deadline: null,
        tone: "ok",
        connect: m.server_password ? `${m.server_address}/${m.server_password}` : m.server_address,
        key: `ready:${m.id}`,
      });
    } else if (m.status === "live") {
      out.push({ kind: "live", priority: 5, label: "Ваш матч идёт", detail: `Матч #${m.number} против ${opponent}`, href, deadline: null, tone: "live", connect: null, key: `live:${m.id}` });
    }
  }

  // check-in: капитан, заявка одобрена, check-in ещё не пройден, окно открыто
  for (const r of regs) {
    const t = tour.get(r.tournament_id);
    if (!t || t.status !== "checkin" || r.registration.checked_in_at) continue;
    if (captainOf.get(r.registration.team_id) !== playerId) continue;
    if (checkinWindowError(t)) continue;
    if (out.some((a) => a.key === `checkin:${t.id}`)) continue;
    out.push({
      kind: "checkin",
      priority: 4,
      label: "Check-in открыт",
      detail: `${t.name} — подтвердите участие команды`,
      href: `/tournaments/${t.slug}/checkin`,
      deadline: t.checkin_closes_at,
      tone: "warn",
      connect: null,
      key: `checkin:${t.id}`,
    });
  }
  return out;
}

async function lobbyActivity(playerId: string): Promise<Activity[]> {
  const ref = await playerLobby(playerId);
  if (!ref) return [];
  const lobby = await getLobby(ref.id);
  if (!lobby || lobby.status === "closed") return [];
  const href = `/lobby/${lobby.code}`;
  const out: Activity[] = [];
  const members = await getMembers(lobby.id);
  const me = members.find((m) => m.player_id === playerId);

  if (lobby.draft && lobby.draft.captains[lobby.draft.turn - 1] === playerId) {
    out.push({ kind: "lobby_draft_turn", priority: 1, label: "Ваш ход · драфт", detail: `Лобби #${lobby.code} — выберите игрока`, href, deadline: lobby.draft.deadline, tone: "accent", connect: null, key: `draft:${lobby.id}:${lobby.draft.deadline}` });
  }
  if (lobby.ready_check_until && me && (me.slot === "team1" || me.slot === "team2") && !me.ready) {
    out.push({ kind: "lobby_ready_check", priority: 2, label: "Проверка готовности", detail: `Лобби #${lobby.code} — подтвердите, что вы на месте`, href, deadline: lobby.ready_check_until, tone: "warn", connect: null, key: `ready-check:${lobby.id}:${lobby.ready_check_until}` });
  }

  const game = lobby.current_game_id ? await getGame(lobby.current_game_id) : null;
  if (game && ["veto", "waiting", "live"].includes(game.status)) {
    const inGame = [...game.team1.players, ...game.team2.players].some((p) => p.id === playerId);
    if (game.status === "veto") {
      const st = lobbyVetoState(game);
      const team = st.current?.team === 1 ? game.team1 : st.current?.team === 2 ? game.team2 : null;
      const captain = team ? (team.players[0]?.id ?? lobby.host_id) : null;
      if (captain === playerId && st.current?.action !== "decider") {
        out.push({ kind: "lobby_veto_turn", priority: 1, label: st.current?.action === "pick" ? "Ваш ход · пик карты" : "Ваш ход · бан карты", detail: `Вето в лобби #${lobby.code}`, href, deadline: game.veto_deadline, tone: "accent", connect: null, key: `lobby-veto:${game.id}:${game.veto.length}` });
      }
    } else if (inGame && game.status === "waiting" && game.server_state === "ready" && game.server_address) {
      out.push({ kind: "lobby_server_ready", priority: 3, label: "Сервер готов", detail: `Лобби #${lobby.code}`, href, deadline: null, tone: "ok", connect: game.server_address, key: `lobby-ready:${game.id}` });
    } else if (inGame && game.status === "live") {
      out.push({ kind: "lobby_live", priority: 5, label: "Ваш матч идёт", detail: `Лобби #${lobby.code}`, href, deadline: null, tone: "live", connect: null, key: `lobby-live:${game.id}` });
    }
  }
  return out;
}
