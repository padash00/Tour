"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { getTournamentById } from "@/lib/data";
import { loadOfficial } from "@/lib/official-data";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

/*
 * Официальный турнир в F16 Control: отметки о бумажных документах, напоминание капитанам,
 * удаление данных заявок после турнира. Только администратор; всё пишется в журнал.
 */

const UUID = /^[0-9a-f-]{36}$/i;

/** «Документы сданы» у игрока (playerId) или тренера заявки (registrationId) */
export async function setDocuments(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const on = formData.get("on");
  if (on !== "0" && on !== "1") return { error: "Не удалось определить новое состояние" };
  if (!UUID.test(tournamentId)) return { error: "Турнир не найден" };

  if (playerId) {
    if (!UUID.test(playerId)) return { error: "Игрок не найден" };
    // только участник заявки этого турнира
    const { data: roster } = await db().from("tournament_roster_players").select("id").eq("tournament_id", tournamentId).eq("player_id", playerId).maybeSingle();
    if (!roster) return { error: "Игрок не заявлен на этот турнир" };
    const { error } =
      on === "1"
        ? await db().from("tournament_participant_documents").upsert({ tournament_id: tournamentId, player_id: playerId, marked_by: admin.id })
        : await db().from("tournament_participant_documents").delete().eq("tournament_id", tournamentId).eq("player_id", playerId);
    if (error) return { error: "Не удалось сохранить отметку" };
  } else {
    if (!UUID.test(registrationId)) return { error: "Заявка не найдена" };
    const { data, error } = await db()
      .from("tournament_applications")
      .update(on === "1" ? { coach_documents_at: new Date().toISOString(), coach_documents_by: admin.id } : { coach_documents_at: null, coach_documents_by: null })
      .eq("registration_id", registrationId)
      .eq("tournament_id", tournamentId)
      .select("registration_id");
    if (error || !data?.length) return { error: "Заявка не найдена" };
  }
  await audit(admin.id, "official.documents", { type: "tournament", id: tournamentId }, { player: playerId || undefined, coach: registrationId || undefined, on: on === "1" });
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return null;
}

/** Уведомить капитанов команд, у которых не хватает данных или документов */
export async function remindCaptains(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await getTournamentById(String(formData.get("tournamentId") ?? ""));
  if (!t || !t.is_official) return { error: "Турнир не найден" };
  const { teams } = await loadOfficial(t);
  let sent = 0;
  for (const team of teams) {
    const problems: string[] = [];
    const issues = team.participants.filter((p) => p.issues.length);
    if (issues.length) problems.push(`анкеты: ${issues.map((p) => p.nickname ?? "тренер").join(", ")}`);
    if (team.applicationIssues.length) problems.push(`заявка: ${team.applicationIssues.join(", ")}`);
    if (team.missingDocs) problems.push(`не сданы документы: ${team.missingDocs} из ${team.participants.length}`);
    if (!problems.length) continue;
    await notify(
      [team.registration.team.captain_id],
      `Заявка ${team.registration.team.name} на «${t.name}»: не хватает данных`,
      `${problems.join("; ")}. Без полного комплекта документов команда не допускается.`,
      `/tournaments/${t.slug}/register`,
    );
    sent++;
  }
  await audit(admin.id, "official.remind", { type: "tournament", id: t.id }, { sent });
  return { success: sent ? `Напоминание отправлено капитанам: ${sent}` : "У всех команд всё заполнено — напоминать некому" };
}

/** После турнира: удалить данные заявок (организация, ответственное лицо, тренер) и отметки документов */
export async function purgeApplicationData(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { data, error } = await db().rpc("purge_official_application_data", { p_tournament: tournamentId });
  if (error) return { error: error.message.includes("tournament_not_finished") ? "Данные заявок удаляются только после завершения турнира" : "Не удалось удалить данные" };
  const counts = data as { applications: number; documents: number };
  await audit(admin.id, "official.purge", { type: "tournament", id: tournamentId }, counts);
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  return { success: `Удалено заявок: ${counts.applications}, отметок о документах: ${counts.documents}` };
}
