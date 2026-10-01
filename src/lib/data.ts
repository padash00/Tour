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
    .select("*, team_members(left_at, player:players(faceit_elo))")
    .is("disbanded_at", null)
    .eq("is_solo", false)
    .order("created_at", { ascending: false });
  type Row = Team & { team_members: { left_at: string | null; player: { faceit_elo: number | null } }[] };
  return ((data ?? []) as Row[]).map(({ team_members, ...team }) => {
    const active = team_members.filter((m) => !m.left_at);
    const elos = active.map((m) => m.player.faceit_elo).filter((e): e is number => e != null);
    return {
      ...team,
      member_count: active.length,
      avg_elo: elos.length ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : null,
    };
  });
}

export type PlayerListItem = Player & { team: Pick<Team, "name" | "tag"> | null };

export async function listPlayers(): Promise<PlayerListItem[]> {
  const { data } = await db()
    .from("players")
    .select("*, team_members(left_at, team:teams(name, tag))")
    .order("faceit_elo", { ascending: false, nullsFirst: false })
    .limit(500);
  type Row = Player & { team_members: { left_at: string | null; team: Pick<Team, "name" | "tag"> }[] };
  return ((data ?? []) as Row[]).map(({ team_members, ...p }) => ({
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
    .select("*, team:teams(*), roster:tournament_roster_players(*, player:players(*))")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });
  return (data ?? []) as RegistrationWithTeam[];
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
    .select("*, roster:tournament_roster_players(*, player:players(*))")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId)
    .maybeSingle();
  return data as (Registration & { roster: RosterEntry[] }) | null;
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

export async function writeRoster(
  registrationId: string,
  tournamentId: string,
  members: Pick<TeamMemberWithPlayer, "player_id" | "role">[],
) {
  await db().from("tournament_roster_players").delete().eq("registration_id", registrationId);
  if (members.length === 0) return null;
  const { error } = await db()
    .from("tournament_roster_players")
    .insert(
      members.map((m) => ({
        registration_id: registrationId,
        tournament_id: tournamentId,
        player_id: m.player_id,
        role: m.role === "substitute" ? "sub" : "main",
      })),
    );
  return error;
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
    if (data.name !== player.nickname) {
      await db().from("teams").update({ name: player.nickname }).eq("id", data.id);
      data.name = player.nickname;
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
