"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getTournamentById } from "@/lib/data";
import { NOMINATIONS } from "@/lib/nominations-core";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: FormDataEntryValue | null, max: number) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};

function refresh(t: { id: string; slug: string }) {
  revalidatePath(`/admin/tournaments/${t.id}`);
  revalidatePath(`/admin/tournaments/${t.id}/diplomas`);
  revalidatePath(`/tournaments/${t.slug}`);
  revalidatePath(`/tournaments/${t.slug}/recap`);
}

/**
 * Решение судей по номинации (Положение 5.5): игрок турнира и/или имя текстом (тренер — не пользователь сайта),
 * команда (по умолчанию — команда выбранного игрока на турнире), примечание.
 */
export async function setNomination(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await getTournamentById(String(formData.get("tournamentId")));
  if (!t) return { error: "Турнир не найден" };
  const key = String(formData.get("key") ?? "");
  const def = NOMINATIONS.find((n) => n.key === key);
  if (!def) return { error: "Неизвестная номинация" };

  const rawPlayer = String(formData.get("playerId") ?? "");
  const playerId = UUID.test(rawPlayer) ? rawPlayer : null;
  const name = text(formData.get("name"), 120);
  const note = text(formData.get("note"), 300);
  const rawTeam = String(formData.get("teamId") ?? "");
  let teamId = UUID.test(rawTeam) ? rawTeam : null;
  if (!playerId && !name) return { error: def.freeText ? "Выберите игрока или впишите ФИО" : "Выберите игрока" };

  // игрок и команда — только участники этого турнира
  const { data: roster } = await db()
    .from("tournament_roster_players")
    .select("player_id, registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(team_id, status)")
    .eq("tournament_id", t.id)
    .eq("registration.status", "approved");
  const rows = roster ?? [];
  if (playerId) {
    const entry = rows.find((r) => r.player_id === playerId);
    if (!entry) return { error: "Игрок не заявлен на этот турнир" };
    teamId ??= entry.registration.team_id;
  }
  if (teamId && !rows.some((r) => r.registration.team_id === teamId)) return { error: "Команда не участвует в турнире" };

  const { error } = await db()
    .from("tournament_nominations")
    .upsert(
      { tournament_id: t.id, key, player_id: playerId, name, team_id: teamId, note, decided_by: admin.id, decided_at: new Date().toISOString() },
      { onConflict: "tournament_id,key" },
    );
  if (error) return { error: "Не удалось сохранить решение" };
  await audit(admin.id, "nomination.set", { type: "tournament", id: t.id }, { key, playerId, name, teamId, note });
  refresh(t);
  return { success: `«${def.title}»: решение судей сохранено` };
}

/** Снять решение судей — снова действует кандидат по статистике (или номинация пуста) */
export async function clearNomination(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await getTournamentById(String(formData.get("tournamentId")));
  if (!t) return { error: "Турнир не найден" };
  const key = String(formData.get("key") ?? "");
  const def = NOMINATIONS.find((n) => n.key === key);
  if (!def) return { error: "Неизвестная номинация" };
  await db().from("tournament_nominations").delete().eq("tournament_id", t.id).eq("key", key);
  await audit(admin.id, "nomination.clear", { type: "tournament", id: t.id }, { key });
  refresh(t);
  return { success: `«${def.title}»: решение судей снято` };
}
