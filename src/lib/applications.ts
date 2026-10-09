import "server-only";
import { db } from "./supabase";
import type { Player, Team } from "./types";

/** Заявки на вступление в команду: сколько одновременно, сколько живут, пауза после отказа */
export const APPLICATION_LIMIT = 3;
export const APPLICATION_TTL_DAYS = 7;
export const APPLICATION_COOLDOWN_HOURS = 24;

export type ApplicationStatus = "pending" | "accepted" | "declined" | "withdrawn" | "cancelled";

type Row = { id: string; team_id: string; player_id: string; message: string | null; status: ApplicationStatus; created_at: string; decided_at: string | null };
export type TeamApplication = Row & { player: Player };
export type PlayerApplication = Row & { team: Team };

/** Заявка старше срока считается просроченной — её не показывают и не учитывают */
export function freshSince() {
  return new Date(Date.now() - APPLICATION_TTL_DAYS * 86_400_000).toISOString();
}

/** Ожидающие решения заявки в команду — для капитана */
export async function getTeamApplications(teamId: string): Promise<TeamApplication[]> {
  const { data } = await db()
    .from("team_applications")
    .select("*, player:players!team_applications_player_id_fkey(*)")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .gt("created_at", freshSince())
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as TeamApplication[];
}

export async function countTeamApplications(teamId: string): Promise<number> {
  const { count } = await db()
    .from("team_applications")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("status", "pending")
    .gt("created_at", freshSince());
  return count ?? 0;
}

/** Заявки игрока: ожидающие и решения за последние дни (чтобы был виден отказ) */
export async function getPlayerApplications(playerId: string): Promise<PlayerApplication[]> {
  const { data } = await db()
    .from("team_applications")
    .select("*, team:teams(*)")
    .eq("player_id", playerId)
    .in("status", ["pending", "declined"])
    .gt("created_at", freshSince())
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as PlayerApplication[]).filter((a) => !a.team.disbanded_at);
}

/** Своя заявка игрока в конкретную команду (последняя) */
export async function getOwnApplication(teamId: string, playerId: string): Promise<PlayerApplication | null> {
  const { data } = await db()
    .from("team_applications")
    .select("*, team:teams(*)")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as PlayerApplication | null;
}

/** Отменить ожидающие заявки игрока — он вступил в команду или создал свою */
export async function cancelPlayerApplications(playerId: string) {
  await db()
    .from("team_applications")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .eq("status", "pending");
}

/** Отменить заявки в команду — команда распущена */
export async function cancelTeamApplications(teamId: string) {
  await db()
    .from("team_applications")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("status", "pending");
}
