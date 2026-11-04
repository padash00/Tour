import "server-only";
import { db } from "./supabase";

/*
 * Обязательное подтверждение Telegram для участников турниров: игрок в составе одобренной команды
 * на турнире, который ещё не закончился, должен подтвердить Telegram через бота — иначе в день турнира
 * бот не отметит его в рассадке и не напишет о вызове на матч.
 */

const OPEN = ["registration", "checkin", "live"];

type RosterRow = {
  player_id: string;
  role: string;
  registration: { status: string; team: { id: string; name: string; tag: string; captain_id: string | null } | null; tournament: { name: string; status: string } | null } | null;
  player: { nickname: string } | null;
};

async function approvedRosters(playerId?: string) {
  let q = db()
    .from("tournament_roster_players")
    .select(
      "player_id, role, player:players(nickname), registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(status, team:teams(id, name, tag, captain_id), tournament:tournaments!inner(name, status))",
    )
    .eq("registration.status", "approved")
    .in("registration.tournament.status", OPEN);
  if (playerId) q = q.eq("player_id", playerId);
  const { data } = await q.limit(2000);
  return (data ?? []) as unknown as RosterRow[];
}

/** Нужно ли игроку подтвердить Telegram: название турнира или null */
export async function telegramLinkRequired(playerId: string): Promise<string | null> {
  const rows = await approvedRosters(playerId);
  const row = rows.find((r) => r.registration?.tournament);
  if (!row) return null;
  const { data: prof } = await db().from("player_profiles").select("telegram_chat_id").eq("player_id", playerId).maybeSingle();
  return prof?.telegram_chat_id ? null : row.registration!.tournament!.name;
}

export type UnlinkedTeam = { team: string; tag: string; tournament: string; total: number; missing: { nickname: string; captain: boolean; sub: boolean }[] };

/** Для пульта: по командам — кто из состава ещё не подтвердил Telegram */
export async function unlinkedParticipants(): Promise<UnlinkedTeam[]> {
  const rows = await approvedRosters();
  if (!rows.length) return [];
  const { data: profs } = await db()
    .from("player_profiles")
    .select("player_id, telegram_chat_id")
    .in("player_id", [...new Set(rows.map((r) => r.player_id))]);
  const linked = new Set((profs ?? []).filter((p) => p.telegram_chat_id).map((p) => p.player_id));
  const byTeam = new Map<string, UnlinkedTeam>();
  for (const r of rows) {
    const team = r.registration?.team;
    if (!team) continue;
    const key = `${team.id}:${r.registration?.tournament?.name}`;
    const t = byTeam.get(key) ?? { team: team.name, tag: team.tag, tournament: r.registration?.tournament?.name ?? "", total: 0, missing: [] };
    t.total++;
    if (!linked.has(r.player_id)) t.missing.push({ nickname: r.player?.nickname ?? "?", captain: team.captain_id === r.player_id, sub: r.role === "substitute" });
    byTeam.set(key, t);
  }
  return [...byTeam.values()].sort((a, b) => b.missing.length - a.missing.length || a.team.localeCompare(b.team));
}
