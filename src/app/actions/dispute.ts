"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireAdmin, requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { BANNED_ERROR, isRateLimited } from "@/lib/data";
import { env } from "@/lib/env";
import { getMatch } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const snapshot = (m: { status: string; winner_id: string | null; team1_score: number; team2_score: number; is_walkover: boolean }) => ({
  status: m.status,
  winner_id: m.winner_id,
  team1_score: m.team1_score,
  team2_score: m.team2_score,
  is_walkover: m.is_walkover,
});

/** Администраторы: флаг is_admin или SteamID из ADMIN_STEAM_IDS — фильтр в SQL, без чтения всех игроков */
async function adminIds() {
  const steamIds = env.adminSteamIds.filter((id) => /^\d{17}$/.test(id));
  const { data } = await db()
    .from("players")
    .select("id")
    .or(steamIds.length ? `is_admin.eq.true,steam_id.in.(${steamIds.join(",")})` : "is_admin.eq.true");
  return (data ?? []).map((p) => p.id as string);
}

/** Открыть спор по матчу: капитан одной из команд или админ */
export async function openDispute(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const matchId = String(formData.get("matchId"));
  const player = await requirePlayer(`/matches/${matchId}`);
  if (player.is_banned && !isAdmin(player)) return { error: BANNED_ERROR };
  if (await isRateLimited(player.id, "dispute.open", 30)) return { error: "Спор уже отправлен — подождите немного" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) return { error: "Опишите проблему подробнее (минимум 10 символов)" };
  if (reason.length > 1000) return { error: "Слишком длинное описание" };

  const m = await getMatch(matchId);
  if (!m) return { error: "Матч не найден" };
  if (!["ready", "live", "finished"].includes(m.status)) return { error: "Спор можно открыть после начала матча" };

  const admin = isAdmin(player);
  const team = m.team1?.captain_id === player.id ? m.team1 : m.team2?.captain_id === player.id ? m.team2 : null;
  const isCaptain = !!team;
  if (!isCaptain && !admin) return { error: "Спор может открыть капитан команды этого матча" };

  if (isCaptain) {
    const { count } = await db()
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .eq("match_id", m.id)
      .eq("team_id", team!.id)
      .eq("status", "open");
    if ((count ?? 0) > 0) return { error: "У вашей команды уже есть открытый спор по этому матчу" };
  }

  const { data: d, error } = await db()
    .from("disputes")
    .insert({
      match_id: m.id,
      opened_by: player.id,
      team_id: isCaptain ? team!.id : null,
      reason,
      result_before: snapshot(m),
    })
    .select("id")
    .single();
  if (error || !d) return { error: "Не удалось открыть спор" };
  await db().from("matches").update({ under_review: true }).eq("id", m.id);

  const captains = [m.team1?.captain_id, m.team2?.captain_id].filter((id): id is string => !!id && id !== player.id);
  await notify(
    [...new Set([...captains, ...(await adminIds())])].filter((id) => id !== player.id),
    `Матч #${m.number} на рассмотрении`,
    `${isCaptain ? team!.name : "Администратор"}: ${reason.slice(0, 120)}`,
    `/matches/${m.id}`,
  );
  await audit(player.id, "dispute.open", { type: "match", id: m.id }, { dispute: d.id, reason });
  revalidatePath(`/matches/${m.id}`);
  revalidatePath(`/admin/matches/${m.id}`);
  return { success: "Спор открыт. Матч помечен «На рассмотрении», администратор получит уведомление." };
}

/** Решение по спору. Если результат нужно изменить — сначала «Отменить результат» / «Тех. победа», потом закрыть спор. */
export async function resolveDispute(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("disputeId"));
  const outcome = formData.get("outcome") === "rejected" ? "rejected" : "resolved";
  const decision = String(formData.get("decision") ?? "").trim();
  if (decision.length < 5) return { error: "Опишите решение — оно будет видно командам" };

  const { data: d } = await db().from("disputes").select("*").eq("id", id).single();
  if (!d || d.status !== "open") return { error: "Спор уже закрыт" };
  const m = await getMatch(d.match_id);
  if (!m) return { error: "Матч не найден" };

  const after = snapshot(m);
  const changed = JSON.stringify(after) !== JSON.stringify(d.result_before);
  await db()
    .from("disputes")
    .update({
      status: outcome,
      decision,
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
      result_after: changed ? after : null,
    })
    .eq("id", id);

  const { count } = await db()
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .eq("match_id", m.id)
    .eq("status", "open");
  if (!count) await db().from("matches").update({ under_review: false }).eq("id", m.id);

  const captains = [m.team1?.captain_id, m.team2?.captain_id].filter(Boolean) as string[];
  await notify(
    captains,
    `Решение по спору матча #${m.number}: ${outcome === "resolved" ? "принято" : "отклонено"}`,
    decision.slice(0, 200),
    `/matches/${m.id}`,
  );
  await audit(admin.id, `dispute.${outcome}`, { type: "match", id: m.id }, { dispute: id, decision, result_changed: changed });
  revalidatePath(`/matches/${m.id}`);
  revalidatePath(`/admin/matches/${m.id}`);
  return { success: "Решение сохранено" };
}
