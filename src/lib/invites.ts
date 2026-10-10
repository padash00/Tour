import "server-only";
import { db } from "./supabase";
import type { Player, Team } from "./types";

/** Личные приглашения в команду (по нику) и тренер команды */
export const INVITE_TTL_DAYS = 7;

export type InviteRole = "player" | "coach";
type Row = { id: string; team_id: string; player_id: string; role: InviteRole; status: string; created_at: string };
export type TeamInvite = Row & { player: Player };
export type PlayerInvite = Row & { team: Team };

function freshSince() {
  return new Date(Date.now() - INVITE_TTL_DAYS * 86_400_000).toISOString();
}

/** Ожидающие ответа приглашения команды — капитану */
export async function getTeamInvites(teamId: string): Promise<TeamInvite[]> {
  const { data } = await db()
    .from("team_invites")
    .select("*, player:players!team_invites_player_id_fkey(*)")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .gt("created_at", freshSince())
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as TeamInvite[];
}

/** Приглашения игроку — он может принять или отклонить */
export async function getPlayerInvites(playerId: string): Promise<PlayerInvite[]> {
  const { data } = await db()
    .from("team_invites")
    .select("*, team:teams(*)")
    .eq("player_id", playerId)
    .eq("status", "pending")
    .gt("created_at", freshSince())
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as PlayerInvite[]).filter((i) => !i.team.disbanded_at);
}

/** Команды, которые игрок тренирует */
export async function getCoachedTeams(playerId: string): Promise<Team[]> {
  const { data } = await db().from("teams").select("*").eq("coach_id", playerId).is("disbanded_at", null).order("name");
  return (data ?? []) as Team[];
}

export async function getCoach(team: Pick<Team, "coach_id">): Promise<Player | null> {
  if (!team.coach_id) return null;
  const { data } = await db().from("players").select("*").eq("id", team.coach_id).maybeSingle();
  return data as Player | null;
}

/** Отменить ожидающие приглашения команды — команда распущена */
export async function cancelTeamInvites(teamId: string) {
  await db()
    .from("team_invites")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("status", "pending");
}

/** Отменить приглашения игроку в команды — он вступил в команду сам (по ссылке или создал свою) */
export async function cancelPlayerInvites(playerId: string) {
  await db()
    .from("team_invites")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .eq("role", "player")
    .eq("status", "pending");
}
