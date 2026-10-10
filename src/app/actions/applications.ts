"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { APPLICATION_COOLDOWN_HOURS, APPLICATION_LIMIT, APPLICATION_TTL_DAYS } from "@/lib/applications";
import { BANNED_ERROR, MAX_MAIN, MAX_SUBS, getActiveMembership, getLockingTournament, getTeamById, isRateLimited, syncOpenRosters } from "@/lib/data";
import { profileGateError } from "@/lib/profiles";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const NOT_CAPTAIN = "Только капитан может это сделать";
const INBOX = "/team?tab=applications";

async function requireCaptain() {
  const player = await requirePlayer(INBOX);
  if (player.is_banned) return null;
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return null;
  return { player, team: membership.team };
}

function revalidateTeam(tag: string) {
  revalidatePath("/team");
  revalidatePath(`/teams/${encodeURIComponent(tag)}`, "layout");
}

/** Игрок подаёт заявку в команду — капитан получает уведомление */
export async function applyToTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const teamId = String(formData.get("teamId") ?? "");
  const team = await getTeamById(teamId);
  const player = await requirePlayer(team ? `/teams/${encodeURIComponent(team.tag)}/apply` : "/teams");
  if (!team || team.disbanded_at || team.is_solo) return { error: "Команда не найдена" };
  if (player.is_banned) return { error: BANNED_ERROR };
  const membership = await getActiveMembership(player.id);
  if (membership) return { error: membership.team.id === team.id ? "Вы уже в этой команде" : "Вы уже состоите в команде. Сначала покиньте её." };
  if (team.coach_id === player.id) return { error: "Вы тренер этой команды — игроком быть нельзя" };
  const gate = await profileGateError(player);
  if (gate) return { error: gate };
  if (await isRateLimited(player.id, "team.apply", 5)) return { error: "Слишком часто — попробуйте через пару секунд" };

  const message = String(formData.get("message") ?? "").trim().slice(0, 200);
  const { error } = await db().rpc("apply_to_team", {
    p_team: team.id,
    p_player: player.id,
    p_message: message,
    p_limit: APPLICATION_LIMIT,
    p_ttl_days: APPLICATION_TTL_DAYS,
    p_cooldown_hours: APPLICATION_COOLDOWN_HOURS,
  });
  if (error) {
    const m = error.message;
    if (m.includes("applications_closed")) return { error: "Команда сейчас не принимает заявки" };
    if (m.includes("already_member")) return { error: "Вы уже состоите в команде. Сначала покиньте её." };
    if (m.includes("already_applied")) return { error: "Вы уже подали заявку в эту команду — ждите решения капитана" };
    if (m.includes("cooldown")) return { error: `Капитан недавно отклонил вашу заявку. Повторить можно через ${APPLICATION_COOLDOWN_HOURS} ч.` };
    if (m.includes("limit")) return { error: `Одновременно можно ждать ответа не больше чем от ${APPLICATION_LIMIT} команд. Отзовите одну из заявок.` };
    if (m.includes("team_missing")) return { error: "Команда не найдена" };
    return { error: "Не удалось подать заявку" };
  }

  await notify(
    [team.captain_id],
    `${player.nickname} хочет вступить в ${team.name}`,
    `${message ? `«${message}» · ` : ""}FACEIT ${player.faceit_level ?? "—"} · ${player.faceit_elo ?? "—"} ELO. Примите или отклоните заявку.`,
    INBOX,
  );
  await audit(player.id, "team.apply", { type: "team", id: team.id });
  revalidateTeam(team.tag);
  return { success: "Заявка отправлена — капитан получит уведомление" };
}

/** Игрок отзывает свою заявку */
export async function withdrawApplication(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/team");
  const id = String(formData.get("applicationId") ?? "");
  const { data } = await db()
    .from("team_applications")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("player_id", player.id)
    .eq("status", "pending")
    .select("team:teams(tag)")
    .maybeSingle();
  if (!data) return { error: "Заявка уже неактуальна — обновите страницу" };
  await audit(player.id, "team.apply_withdraw", { type: "team_application", id });
  revalidateTeam(data.team.tag);
  return { success: "Заявка отозвана" };
}

/** Капитан принимает заявку — игрок вступает в команду (те же лимиты, что по ссылке-приглашению) */
export async function acceptApplication(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const locked = await getLockingTournament(team.id);
  if (locked) return { error: `Состав заблокирован турниром «${locked.name}». Новых игроков добавляет только администратор.` };

  const id = String(formData.get("applicationId") ?? "");
  const { data: app } = await db()
    .from("team_applications")
    .select("id, player:players!team_applications_player_id_fkey(id, nickname, steam_id, is_banned)")
    .eq("id", id)
    .eq("team_id", team.id)
    .maybeSingle();
  if (!app) return { error: "Заявка не найдена" };
  if (app.player.is_banned) return { error: `Игрок ${app.player.nickname} заблокирован на платформе` };

  const { data: role, error } = await db().rpc("accept_team_application", {
    p_application: app.id,
    p_actor: player.id,
    p_max_main: MAX_MAIN,
    p_max_subs: MAX_SUBS,
    p_ttl_days: APPLICATION_TTL_DAYS,
  });
  if (error) {
    const m = error.message;
    if (m.includes("team_full")) return { error: "В команде нет свободных мест" };
    if (m.includes("already_member")) return { error: `${app.player.nickname} уже вступил в другую команду` };
    if (m.includes("captain_required")) return { error: NOT_CAPTAIN };
    if (m.includes("application_missing")) return { error: "Заявка уже неактуальна — обновите страницу" };
    return { error: "Не удалось принять заявку" };
  }

  await syncOpenRosters(team.id);
  await notify([app.player.id], `Вас приняли в ${team.name}`, role === "substitute" ? "Вы в запасе команды." : "Вы в основном составе.", "/team");
  await audit(player.id, "team.apply_accept", { type: "team", id: team.id }, { player: app.player.steam_id, role });
  revalidateTeam(team.tag);
  return { success: `${app.player.nickname} теперь в команде` };
}

/** Капитан отклоняет заявку — игрок получает уведомление */
export async function declineApplication(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const id = String(formData.get("applicationId") ?? "");
  const { data } = await db()
    .from("team_applications")
    .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: player.id })
    .eq("id", id)
    .eq("team_id", team.id)
    .eq("status", "pending")
    .select("player:players!team_applications_player_id_fkey(id, nickname, steam_id)")
    .maybeSingle();
  if (!data) return { error: "Заявка уже неактуальна — обновите страницу" };
  await notify([data.player.id], `Заявку в ${team.name} отклонили`, "Можно поискать другую команду в разделе «Поиск команды».", "/find?tab=teams");
  await audit(player.id, "team.apply_decline", { type: "team", id: team.id }, { player: data.player.steam_id });
  revalidateTeam(team.tag);
  return { success: `Заявка ${data.player.nickname} отклонена` };
}

/** Капитан открывает или закрывает приём заявок */
export async function setAcceptsApplications(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const accepts = formData.get("accepts") === "1";
  await db().from("teams").update({ accepts_applications: accepts }).eq("id", team.id);
  await audit(player.id, "team.applications_toggle", { type: "team", id: team.id }, { accepts });
  revalidateTeam(team.tag);
  revalidatePath("/team/settings");
  return { success: accepts ? "Приём заявок открыт" : "Приём заявок закрыт" };
}
