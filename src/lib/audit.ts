import "server-only";
import type { Json } from "./database.types";
import { db } from "./supabase";

export async function audit(
  actorId: string | null,
  action: string,
  entity?: { type: string; id: string },
  payload: { [key: string]: Json | undefined } = {},
) {
  await db().from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    payload,
  });
}

export async function notify(playerIds: string[], title: string, body?: string, link?: string) {
  if (playerIds.length === 0) return;
  await db()
    .from("notifications")
    .insert(playerIds.map((player_id) => ({ player_id, title, body: body ?? null, link: link ?? null })));
}
