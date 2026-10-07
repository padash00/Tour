import "server-only";
import { cache } from "react";
import { parseDrawRecord, type DrawRecord } from "./draw";
import { db } from "./supabase";

/**
 * Последняя жеребьёвка турнира из audit_logs (action = 'bracket.draw').
 * Если после неё сетку создали другим посевом или удалили — жеребьёвка уже не действует: null.
 */
export const getLastDraw = cache(async (tournamentId: string): Promise<(DrawRecord & { at: string }) | null> => {
  const { data } = await db()
    .from("audit_logs")
    .select("action, payload, created_at")
    .eq("entity_id", tournamentId)
    .in("action", ["bracket.draw", "bracket.generate", "bracket.delete"])
    .order("created_at", { ascending: false })
    .limit(3);
  const rows = data ?? [];
  // жеребьёвка пишет сразу две записи: bracket.generate (seeding = draw) и bracket.draw
  const latest = rows[0];
  if (!latest) return null;
  const draw = rows.find((r) => r.action === "bracket.draw");
  if (!draw) return null;
  const later = rows.filter((r) => r.created_at > draw.created_at);
  const superseded = later.some(
    (r) => r.action === "bracket.delete" || (r.action === "bracket.generate" && (r.payload as { seeding?: string } | null)?.seeding !== "draw"),
  );
  if (superseded) return null;
  const record = parseDrawRecord(draw.payload);
  return record ? { ...record, at: draw.created_at } : null;
});
