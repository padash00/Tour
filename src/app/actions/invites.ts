"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { BANNED_ERROR, MAX_MAIN, MAX_SUBS, getActiveMembership, getLockingTournament, isRateLimited, syncOpenRosters } from "@/lib/data";
import { INVITE_TTL_DAYS, type InviteRole } from "@/lib/invites";
import { profileGateError } from "@/lib/profiles";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const NOT_CAPTAIN = "Только капитан может это сделать";

async function requireCaptain() {
  const player = await requirePlayer("/team?tab=roster");
  if (player.is_banned) return null;
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return null;
  return { player, team: membership.team };
}

function revalidateTeam(tag: string) {
  revalidatePath("/team");
  revalidatePath(`/teams/${encodeURIComponent(tag)}`, "layout");
}

export type InviteCandidate = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  steam_id: string;
  faceit_level: number | null;
  /** уже в другой команде — игроком позвать нельзя, тренером можно */
  team: string | null;
};

/** Поиск игроков по нику (или SteamID64) для приглашения — только капитану */
export async function searchInvitees(query: string): Promise<InviteCandidate[]> {
  const ctx = await requireCaptain();
  if (!ctx) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const base = db().from("players").select("id, nickname, avatar_url, steam_id, faceit_level").eq("is_banned", false).neq("id", ctx.player.id).limit(8);
  const { data } = /^\d{17}$/.test(q) ? await base.eq("steam_id", q) : await base.ilike("nickname", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`).order("nickname");
  const players = data ?? [];
  if (!players.length) return [];
  const { data: memberships } = await db()
    .from("team_members")
    .select("player_id, team:teams(name, is_solo)")
    .in("player_id", players.map((p) => p.id))
    .is("left_at", null);
  const teamOf = new Map((memberships ?? []).filter((m) => !m.team.is_solo).map((m) => [m.player_id, m.team.name]));
  return players.map((p) => ({ ...p, team: teamOf.get(p.id) ?? null }));
}

/** Капитан приглашает игрока (в состав) или тренера — тот получает уведомление и подтверждает */
export async function sendInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const role: InviteRole = formData.get("role") === "coach" ? "coach" : "player";
  const target = String(formData.get("playerId") ?? "");
  if (role === "player") {
    const locked = await getLockingTournament(team.id);
    if (locked) return { error: `Состав заблокирован турниром «${locked.name}». Новых игроков добавляет только администратор.` };
  }
  if (await isRateLimited(player.id, "team.invite", 2)) return { error: "Слишком часто — попробуйте через пару секунд" };

  const { data: invitee } = await db().from("players").select("id, nickname, steam_id, is_banned").eq("id", target).maybeSingle();
  if (!invitee || invitee.is_banned) return { error: "Игрок не найден" };

  const { error } = await db().rpc("create_team_invite", {
    p_team: team.id,
    p_actor: player.id,
    p_player: invitee.id,
    p_role: role,
    p_max_total: MAX_MAIN + MAX_SUBS,
    p_ttl_days: INVITE_TTL_DAYS,
  });
  if (error) {
    const m = error.message;
    if (m.includes("already_in_team")) return { error: `${invitee.nickname} уже в вашей команде` };
    if (m.includes("already_invited")) return { error: `${invitee.nickname} уже приглашён — ждём ответа` };
    if (m.includes("already_member")) return { error: `${invitee.nickname} уже в другой команде` };
    if (m.includes("no_slots")) return { error: "Свободных мест нет — с учётом отправленных приглашений состав заполнен" };
    if (m.includes("coach_taken")) return { error: "У команды уже есть тренер" };
    if (m.includes("coach_invited")) return { error: "Тренер уже приглашён — дождитесь ответа или отмените приглашение" };
    if (m.includes("self")) return { error: "Нельзя пригласить себя" };
    if (m.includes("captain_required")) return { error: NOT_CAPTAIN };
    return { error: "Не удалось отправить приглашение" };
  }

  await notify(
    [invitee.id],
    role === "coach" ? `${team.name} приглашает вас тренером` : `${team.name} приглашает вас в команду`,
    `Капитан ${player.nickname} ждёт ответа. Принять или отклонить — в разделе «Моя команда».`,
    "/team",
  );
  await audit(player.id, "team.invite_send", { type: "team", id: team.id }, { player: invitee.steam_id, role });
  revalidatePath("/team");
  return { success: `Приглашение отправлено: ${invitee.nickname}` };
}

/** Капитан отменяет отправленное приглашение */
export async function cancelInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const id = String(formData.get("inviteId") ?? "");
  const { data } = await db()
    .from("team_invites")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("team_id", ctx.team.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!data) return { error: "Приглашение уже неактуально — обновите страницу" };
  await audit(ctx.player.id, "team.invite_cancel", { type: "team", id: ctx.team.id });
  revalidatePath("/team");
  return { success: "Приглашение отменено" };
}

/** Игрок принимает приглашение: вступает в состав или становится тренером */
export async function acceptInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/team");
  if (player.is_banned) return { error: BANNED_ERROR };
  const id = String(formData.get("inviteId") ?? "");
  const { data: inv } = await db()
    .from("team_invites")
    .select("id, role, team:teams(id, name, tag, captain_id)")
    .eq("id", id)
    .eq("player_id", player.id)
    .maybeSingle();
  if (!inv) return { error: "Приглашение не найдено" };
  if (inv.role === "player") {
    const gate = await profileGateError(player);
    if (gate) return { error: gate };
    const locked = await getLockingTournament(inv.team.id);
    if (locked) return { error: `Состав команды заблокирован турниром «${locked.name}» — вступить можно после турнира` };
  }

  const { data: role, error } = await db().rpc("accept_team_invite", {
    p_invite: inv.id,
    p_player: player.id,
    p_max_main: MAX_MAIN,
    p_max_subs: MAX_SUBS,
    p_ttl_days: INVITE_TTL_DAYS,
  });
  if (error) {
    const m = error.message;
    if (m.includes("already_member")) return { error: "Вы уже состоите в команде. Сначала покиньте её." };
    if (m.includes("team_full")) return { error: "В команде уже нет свободных мест" };
    if (m.includes("coach_taken")) return { error: "У команды уже есть тренер" };
    if (m.includes("already_in_team")) return { error: "Вы игрок этой команды — тренером быть нельзя" };
    if (m.includes("is_coach")) return { error: "Вы тренер этой команды — игроком быть нельзя" };
    if (m.includes("invite_missing") || m.includes("team_missing")) return { error: "Приглашение уже неактуально" };
    return { error: "Не удалось принять приглашение" };
  }

  if (role !== "coach") await syncOpenRosters(inv.team.id);
  await notify(
    [inv.team.captain_id],
    role === "coach" ? `${player.nickname} теперь тренер ${inv.team.name}` : `${player.nickname} вступил в ${inv.team.name}`,
    undefined,
    "/team?tab=roster",
  );
  await audit(player.id, "team.invite_accept", { type: "team", id: inv.team.id }, { role });
  revalidateTeam(inv.team.tag);
  return { success: role === "coach" ? `Вы тренер ${inv.team.name}` : `Вы в команде ${inv.team.name}` };
}

/** Игрок отклоняет приглашение — капитан получает уведомление */
export async function declineInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/team");
  const id = String(formData.get("inviteId") ?? "");
  const { data } = await db()
    .from("team_invites")
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("player_id", player.id)
    .eq("status", "pending")
    .select("role, team:teams(id, name, captain_id)")
    .maybeSingle();
  if (!data) return { error: "Приглашение уже неактуально — обновите страницу" };
  await notify([data.team.captain_id], `${player.nickname} отклонил приглашение${data.role === "coach" ? " тренером" : ""} в ${data.team.name}`, undefined, "/team?tab=roster");
  await audit(player.id, "team.invite_decline", { type: "team", id: data.team.id });
  revalidatePath("/team");
  return { success: "Приглашение отклонено" };
}

/** Капитан убирает тренера из команды */
export async function removeCoach(): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  if (!team.coach_id) return { error: "У команды нет тренера" };
  await db().from("teams").update({ coach_id: null }).eq("id", team.id);
  await notify([team.coach_id], `Вы больше не тренер ${team.name}`);
  await audit(player.id, "team.coach_remove", { type: "team", id: team.id });
  revalidateTeam(team.tag);
  return { success: "Тренер убран" };
}

/** Тренер сам уходит из команды */
export async function leaveCoaching(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/team");
  const teamId = String(formData.get("teamId") ?? "");
  const { data } = await db()
    .from("teams")
    .update({ coach_id: null })
    .eq("id", teamId)
    .eq("coach_id", player.id)
    .select("id, name, tag, captain_id")
    .maybeSingle();
  if (!data) return { error: "Вы уже не тренер этой команды" };
  await notify([data.captain_id], `${player.nickname} больше не тренер ${data.name}`, undefined, "/team?tab=roster");
  await audit(player.id, "team.coach_leave", { type: "team", id: data.id });
  revalidateTeam(data.tag);
  return { success: `Вы больше не тренер ${data.name}` };
}
