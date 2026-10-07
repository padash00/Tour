import "server-only";
import { db } from "./supabase";
import type {
  Player,
  Registration,
  RosterPlayer,
  Team,
  TeamMember,
  TeamMemberWithPlayer,
  Tournament,
  TournamentStatus,
} from "./types";

export const MAX_MAIN = 5;
export const MAX_SUBS = 2;

/** Статусы турнира, при которых составы заблокированы */
export const LOCKED_STATUSES: TournamentStatus[] = ["registration_closed", "checkin", "live"];

const roleOrder = { captain: 0, player: 1, substitute: 2 } as const;

export async function getActiveMembership(playerId: string) {
  const { data } = await db()
    .from("team_members")
    .select("*, team:teams(*)")
    .eq("player_id", playerId)
    .is("left_at", null)
    .eq("is_solo", false)
    .maybeSingle();
  if (!data) return null;
  const { team, ...member } = data as TeamMember & { team: Team };
  return { member: member as TeamMember, team };
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberWithPlayer[]> {
  const { data } = await db()
    .from("team_members")
    .select("*, player:players(*)")
    .eq("team_id", teamId)
    .is("left_at", null);
  return ((data ?? []) as TeamMemberWithPlayer[]).sort(
    (a, b) => roleOrder[a.role] - roleOrder[b.role] || a.joined_at.localeCompare(b.joined_at),
  );
}

export async function getTeamById(id: string): Promise<Team | null> {
  const { data } = await db().from("teams").select("*").eq("id", id).maybeSingle();
  return data as Team | null;
}

export async function getTeamByTag(tag: string): Promise<Team | null> {
  const { data } = await db()
    .from("teams")
    .select("*")
    .eq("tag", tag)
    .is("disbanded_at", null)
    .eq("is_solo", false)
    .maybeSingle();
  return data as Team | null;
}

export async function getTeamByInvite(code: string): Promise<Team | null> {
  const { data } = await db()
    .from("teams")
    .select("*")
    .eq("invite_code", code)
    .is("disbanded_at", null)
    .maybeSingle();
  return data as Team | null;
}

export type TeamListItem = Team & { member_count: number; avg_elo: number | null };

export async function listTeams(): Promise<TeamListItem[]> {
  const { data } = await db()
    .from("teams")
    .select("*, team_members(left_at, role, player:players(faceit_elo))")
    .is("disbanded_at", null)
    .eq("is_solo", false)
    .order("created_at", { ascending: false });
  type Row = Team & { team_members: { left_at: string | null; role: string; player: { faceit_elo: number | null } }[] };
  return ((data ?? []) as Row[]).map(({ team_members, ...team }) => {
    const active = team_members.filter((m) => !m.left_at);
    // средний ELO основы: капитан и игроки, без запасных
    const elos = active.filter((m) => m.role !== "substitute").map((m) => m.player.faceit_elo).filter((e): e is number => e != null);
    return {
      ...team,
      member_count: active.length,
      avg_elo: elos.length ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : null,
    };
  });
}

export type PlayerListItem = Player & { team: Pick<Team, "name" | "tag"> | null };

const PLAYERS_PAGE = 1000; // максимум строк за запрос у PostgREST по умолчанию

/** Все игроки (постранично — без молчаливой обрезки списка) */
export async function listPlayers(): Promise<PlayerListItem[]> {
  type Row = Player & { team_members: { left_at: string | null; team: Pick<Team, "name" | "tag"> }[] };
  const rows: Row[] = [];
  for (let from = 0; ; from += PLAYERS_PAGE) {
    const { data, error } = await db()
      .from("players")
      .select("*, team_members(left_at, team:teams(name, tag))")
      .order("faceit_elo", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + PLAYERS_PAGE - 1);
    if (error) throw new Error("Не удалось загрузить игроков", { cause: error });
    rows.push(...((data ?? []) as Row[]));
    if ((data?.length ?? 0) < PLAYERS_PAGE) break;
  }
  return rows.map(({ team_members, ...p }) => ({
    ...p,
    team: team_members.find((m) => !m.left_at)?.team ?? null,
  }));
}

export async function getPlayerBySteamId(steamId: string): Promise<Player | null> {
  const { data } = await db().from("players").select("*").eq("steam_id", steamId).maybeSingle();
  return data as Player | null;
}

export function averageElo(members: { player: Player }[]) {
  const elos = members.map((m) => m.player.faceit_elo).filter((e): e is number => e != null);
  return elos.length ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : null;
}

// ───────────────────────── tournaments

export async function listPublicTournaments(): Promise<Tournament[]> {
  const { data } = await db()
    .from("tournaments")
    .select("*")
    .neq("status", "draft")
    .order("starts_at", { ascending: true, nullsFirst: false });
  return (data ?? []) as Tournament[];
}

const featuredPriority: Record<TournamentStatus, number> = {
  live: 0,
  checkin: 1,
  registration: 2,
  registration_closed: 3,
  finished: 5,
  cancelled: 6,
  draft: 9,
};

export async function getFeaturedTournament(): Promise<Tournament | null> {
  const all = await listPublicTournaments();
  return all.sort((a, b) => featuredPriority[a.status] - featuredPriority[b.status])[0] ?? null;
}

export async function getTournamentBySlug(slug: string, includeDraft = false): Promise<Tournament | null> {
  let q = db().from("tournaments").select("*").eq("slug", slug);
  if (!includeDraft) q = q.neq("status", "draft");
  const { data } = await q.maybeSingle();
  return data as Tournament | null;
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const { data } = await db().from("tournaments").select("*").eq("id", id).maybeSingle();
  return data as Tournament | null;
}

export type RosterEntry = RosterPlayer & { player: Player };

export type RegistrationWithTeam = Registration & {
  team: Team;
  roster: RosterEntry[];
};

export async function getTournamentRegistrations(tournamentId: string): Promise<RegistrationWithTeam[]> {
  const { data } = await db()
    .from("tournament_registrations")
    .select("*, team:teams(*), roster:tournament_roster_players!tournament_roster_players_registration_id_fkey(*, player:players(*))")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function countApproved(tournamentId: string) {
  const { count } = await db()
    .from("tournament_registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "approved");
  return count ?? 0;
}

export async function approvedCounts(tournamentIds: string[]): Promise<Record<string, number>> {
  if (tournamentIds.length === 0) return {};
  const { data } = await db()
    .from("tournament_registrations")
    .select("tournament_id")
    .in("tournament_id", tournamentIds)
    .eq("status", "approved");
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.tournament_id] = (counts[r.tournament_id] ?? 0) + 1;
  return counts;
}

export type TeamRegistration =Registration & { tournament: Tournament };

export async function getTeamRegistrations(teamId: string): Promise<TeamRegistration[]> {
  const { data } = await db()
    .from("tournament_registrations")
    .select("*, tournament:tournaments(*)")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  return (data ?? []) as TeamRegistration[];
}

export async function getRegistration(tournamentId: string, teamId: string) {
  const { data } = await db()
    .from("tournament_registrations")
    .select("*, roster:tournament_roster_players!tournament_roster_players_registration_id_fkey(*, player:players(*))")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId)
    .maybeSingle();
  return data satisfies (Registration & { roster: RosterEntry[] }) | null;
}

export function isActiveRegistration(r: { status: string }) {
  return r.status === "pending" || r.status === "approved";
}

/** Турнир, который сейчас блокирует состав команды (регистрация закрыта / check-in / live) */
export async function getLockingTournament(teamId: string): Promise<Tournament | null> {
  const regs = await getTeamRegistrations(teamId);
  const locked = regs.find((r) => isActiveRegistration(r) && LOCKED_STATUSES.includes(r.tournament.status));
  return locked?.tournament ?? null;
}

/**
 * Состав заявки выбирает капитан. Пока регистрация открыта, из заявки
 * автоматически убираются игроки, покинувшие команду.
 */
export async function syncOpenRosters(teamId: string) {
  const regs = await getTeamRegistrations(teamId);
  const open = regs.filter((r) => isActiveRegistration(r) && r.tournament.status === "registration");
  if (open.length === 0) return;
  const members = new Set((await getTeamMembers(teamId)).map((m) => m.player_id));
  for (const reg of open) {
    const { data } = await db().from("tournament_roster_players").select("id, player_id").eq("registration_id", reg.id);
    const gone = (data ?? []).filter((r) => !members.has(r.player_id)).map((r) => r.id);
    if (gone.length) await db().from("tournament_roster_players").delete().in("id", gone);
  }
}

export async function getUnreadCount(playerId: string) {
  const { count } = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .is("read_at", null);
  return count ?? 0;
}

/** Соло-команда игрока для турниров 1×1 (скрытая, по одной на игрока). create — создать, если нет. */
export async function getSoloTeam(player: Player, create = false): Promise<Team | null> {
  const { data } = await db().from("teams").select("*").eq("captain_id", player.id).eq("is_solo", true).maybeSingle();
  if (data) {
    if (data.name !== player.nickname || data.logo_url !== player.avatar_url) {
      await db().from("teams").update({ name: player.nickname, logo_url: player.avatar_url }).eq("id", data.id);
      data.name = player.nickname;
      data.logo_url = player.avatar_url;
    }
    return data as Team;
  }
  if (!create) return null;
  const tag = (player.nickname.replace(/[^A-Za-z0-9]/g, "").slice(0, 5) || "P").toUpperCase();
  const { data: team, error } = await db()
    .from("teams")
    .insert({
      name: player.nickname,
      tag,
      captain_id: player.id,
      invite_code: `SOLO-${player.steam_id}`,
      logo_url: player.avatar_url,
      is_solo: true,
    })
    .select("*")
    .single();
  if (error || !team) return null;
  await db().from("team_members").insert({ team_id: team.id, player_id: player.id, role: "captain", is_solo: true });
  return team as Team;
}

/** Команда игрока в контексте турнира: для 1×1 — его соло-команда, иначе обычная команда */
export async function getEntrantTeam(player: Player, tournament: Pick<Tournament, "format">): Promise<Team | null> {
  if (tournament.format === "1v1") return getSoloTeam(player, false);
  return (await getActiveMembership(player.id))?.team ?? null;
}

// ───────────────────────── защита действий игроков

export const BANNED_ERROR = "Ваш аккаунт заблокирован";

/**
 * Ограничение частоты: было ли такое же действие этого игрока за последние `seconds` секунд
 * (по журналу audit_logs — действие должно записываться через audit()).
 * Проверка и отметка попытки атомарны (RPC rate_limit_claim): из двух одновременных запросов
 * (двойной клик) проходит один.
 */
export async function isRateLimited(playerId: string, action: string, seconds: number) {
  const { data, error } = await db().rpc("rate_limit_claim", { p_actor: playerId, p_action: action, p_seconds: seconds });
  if (error) throw new Error("Не удалось проверить частоту действий", { cause: error });
  return data === true;
}

/** Тип картинки по первым байтам файла (не по заявленному браузером типу) */
export function sniffImage(buf: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

/** Окно check-in: null — можно, иначе текст ошибки */
export function checkinWindowError(t: Pick<Tournament, "checkin_opens_at" | "checkin_closes_at">, now = Date.now()) {
  if (t.checkin_opens_at && now < new Date(t.checkin_opens_at).getTime()) return "Check-in ещё не открылся";
  if (t.checkin_closes_at && now > new Date(t.checkin_closes_at).getTime()) return "Check-in закрыт — обратитесь к администратору";
  return null;
}
