import "server-only";
import { audit } from "./audit";
import { db } from "./supabase";

/**
 * Прочтение регламента турнира. Капитан подтверждает его при подаче заявки, остальные игроки поданной команды —
 * в окне при заходе на сайт. Отметка — запись «rules.ack» в журнале (видна в пульте), отдельная таблица не нужна.
 */

export const RULES_ACK = "rules.ack";

export const hasRules = (rules: string | null | undefined) => !!rules?.trim();

/** Отметить, что игрок прочитал регламент турнира (повторно не пишется) */
export async function ackRules(playerId: string, tournamentId: string) {
  const { count } = await db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", RULES_ACK)
    .eq("actor_id", playerId)
    .eq("entity_id", tournamentId);
  if (count) return;
  await audit(playerId, RULES_ACK, { type: "tournament", id: tournamentId });
}

export type PendingRules = { id: string; name: string; slug: string; rules: string };

/** Первый турнир, где команда игрока подала заявку, а он ещё не подтвердил регламент */
export async function pendingRulesAck(playerId: string): Promise<PendingRules | null> {
  const { data: mem } = await db().from("team_members").select("team_id").eq("player_id", playerId).is("left_at", null);
  const teamIds = (mem ?? []).map((m) => m.team_id);
  if (!teamIds.length) return null;
  const { data: regs } = await db()
    .from("tournament_registrations")
    .select("tournament_id")
    .in("team_id", teamIds)
    .in("status", ["pending", "approved"]);
  const ids = [...new Set((regs ?? []).map((r) => r.tournament_id))];
  if (!ids.length) return null;
  const { data: ts } = await db()
    .from("tournaments")
    .select("id, name, slug, rules, starts_at")
    .in("id", ids)
    .not("status", "in", "(finished,cancelled,draft)")
    .order("starts_at", { ascending: true });
  const withRules = (ts ?? []).filter((t) => hasRules(t.rules));
  if (!withRules.length) return null;
  const { data: acks } = await db()
    .from("audit_logs")
    .select("entity_id")
    .eq("action", RULES_ACK)
    .eq("actor_id", playerId)
    .in("entity_id", withRules.map((t) => t.id));
  const done = new Set((acks ?? []).map((a) => a.entity_id));
  const t = withRules.find((x) => !done.has(x.id));
  return t ? { id: t.id, name: t.name, slug: t.slug, rules: t.rules! } : null;
}
