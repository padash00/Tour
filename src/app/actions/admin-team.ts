"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { cancelTeamApplications } from "@/lib/applications";
import { getTeamById, getTeamMembers, getTeamRegistrations, isActiveRegistration, syncOpenRosters } from "@/lib/data";
import { cancelTeamInvites } from "@/lib/invites";
import { registrationError } from "@/lib/registration-errors";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

/*
 * Команды из F16 Control: администратор исключает игрока, назначает капитана, распускает команду.
 * Те же шаги, что у капитана (src/app/actions/team.ts), но без проверки «я капитан».
 */

/** Турнир уже идёт (check-in / live) — команду в нём трогать нельзя, сначала снять с турнира */
const PLAYING = ["checkin", "live"];

function revalidateTeam(teamId: string, tag: string) {
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/teams/${encodeURIComponent(tag)}`);
  revalidatePath("/team");
}

export async function adminKickMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === String(formData.get("memberId")));
  if (!target) return { error: "Игрок уже не в команде — обновите страницу" };
  if (target.player_id === team.captain_id) return { error: "Это капитан. Сначала назначьте капитаном другого игрока или распустите команду." };

  const { error } = await db().from("team_members").update({ left_at: new Date().toISOString() }).eq("id", target.id).is("left_at", null);
  if (error) return { error: "Не удалось исключить игрока" };
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Администратор исключил вас из ${team.name}`);
  await notify([team.captain_id], `Администратор исключил ${target.player.nickname} из ${team.name}`, undefined, "/team");
  await audit(admin.id, "admin.team.kick", { type: "team", id: team.id }, { player: target.player.steam_id });
  revalidateTeam(team.id, team.tag);
  return { success: `${target.player.nickname} исключён из команды` };
}

export async function adminMakeCaptain(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === String(formData.get("memberId")));
  if (!target) return { error: "Игрок уже не в команде — обновите страницу" };
  if (target.player_id === team.captain_id) return { success: `${target.player.nickname} уже капитан` };

  // та же транзакция, что у капитана: роли обоих игроков и captain_id команды меняются вместе
  const { error } = await db().rpc("transfer_team_captain", { p_team: team.id, p_actor: team.captain_id, p_member: target.id });
  if (error) return { error: "Не удалось назначить капитана — обновите страницу" };
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Администратор назначил вас капитаном ${team.name}`, undefined, "/team");
  await notify([team.captain_id], `Капитан ${team.name} теперь ${target.player.nickname} (решение администратора)`, undefined, "/team");
  await audit(admin.id, "admin.team.captain", { type: "team", id: team.id }, { to: target.player.steam_id });
  revalidateTeam(team.id, team.tag);
  return { success: `Капитан — ${target.player.nickname}` };
}

export async function adminDisbandTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда уже распущена" };

  const regs = (await getTeamRegistrations(team.id)).filter((r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status));
  const playing = regs.find((r) => PLAYING.includes(r.tournament.status));
  if (playing) return { error: `Команда участвует в «${playing.tournament.name}» (идёт check-in или игры). Сначала снимите её с турнира на странице турнира.` };
  // заявки на турниры, которые ещё не начались, снимаем — иначе в сетку попала бы несуществующая команда
  for (const r of regs) {
    const { error } = await db().rpc("change_registration", { p_registration: r.id, p_actor: admin.id, p_status: "withdrawn", p_note: "Команда распущена администратором", p_admin: true });
    if (error) return { error: `Не удалось снять заявку на «${r.tournament.name}»: ${registrationError(error)}` };
    await audit(admin.id, "registration.withdrawn", { type: "registration", id: r.id }, { team: team.tag, note: "team disbanded" });
    revalidatePath(`/tournaments/${r.tournament.slug}`);
  }

  const now = new Date().toISOString();
  const members = await getTeamMembers(team.id);
  await db().from("team_members").update({ left_at: now }).eq("team_id", team.id).is("left_at", null);
  await db().from("teams").update({ disbanded_at: now }).eq("id", team.id);
  await cancelTeamApplications(team.id);
  await cancelTeamInvites(team.id);
  await notify(members.map((m) => m.player_id), `Команда ${team.name} распущена администратором`);
  await audit(admin.id, "admin.team.disband", { type: "team", id: team.id }, { withdrawn: regs.length });
  revalidateTeam(team.id, team.tag);
  redirect("/admin/teams");
}
