"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { cancelPlayerApplications, cancelTeamApplications } from "@/lib/applications";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getTeamById, getTeamMembers, getTeamRegistrations, isActiveRegistration, rebuildRostersFromTeam, syncOpenRosters } from "@/lib/data";
import { cancelPlayerInvites, cancelTeamInvites } from "@/lib/invites";
import { registrationError } from "@/lib/registration-errors";
import { db } from "@/lib/supabase";
import { uploadTeamLogo } from "@/lib/team-logo";
import { makeT } from "@/lib/i18n/core";
import type { ActionResult } from "@/components/forms";

/*
 * Команды из F16 Control: администратор исключает игрока, назначает капитана, распускает команду.
 * Те же шаги, что у капитана (src/app/actions/team.ts), но без проверки «я капитан».
 */

/** Турнир уже идёт (check-in / live) — команду в нём трогать нельзя, сначала снять с турнира */
const PLAYING = ["checkin", "live"];

function revalidateTeam(teamId: string, tag: string) {
  revalidatePath("/admin/teams");
  revalidatePath("/teams");
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
  await rebuildRostersFromTeam(team.id);
  await notify([target.player_id], `Администратор исключил вас из ${team.name}`);
  await notify([team.captain_id], `Администратор исключил ${target.player.nickname} из ${team.name}`, undefined, "/team");
  await audit(admin.id, "admin.team.kick", { type: "team", id: team.id }, { player: target.player.steam_id });
  revalidateTeam(team.id, team.tag);
  return { success: `${target.player.nickname} исключён из команды` };
}

/** Админ: название и тег команды (в любой момент, в том числе когда капитану изменения закрыты) */
export async function adminRenameTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  const name = String(formData.get("name") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 32) return { error: "Название — от 2 до 32 символов" };
  if (!/^[A-Z0-9]{2,6}$/.test(tag)) return { error: "Тег — 2–6 латинских букв или цифр" };
  if (name === team.name && tag === team.tag) return { success: "Без изменений" };
  const { error } = await db().from("teams").update({ name, tag }).eq("id", team.id);
  if (error) return { error: error.code === "23505" ? "Такой тег или название уже заняты другой командой" : "Не удалось сохранить" };
  await audit(admin.id, "admin.team.rename", { type: "team", id: team.id }, { from: `${team.name} [${team.tag}]`, to: `${name} [${tag}]` });
  revalidateTeam(team.id, team.tag);
  revalidatePath(`/teams/${encodeURIComponent(tag)}`);
  return { success: `Сохранено: ${name} [${tag}]` };
}

/** Логотип команды из пульта — меняется в любое время, и при заявке на официальный турнир */
export async function adminSetTeamLogo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  if (formData.get("remove") === "1") {
    await db().from("teams").update({ logo_url: null }).eq("id", team.id);
    await audit(admin.id, "admin.team.logo", { type: "team", id: team.id }, { removed: true });
    revalidateTeam(team.id, team.tag);
    return { success: "Логотип убран" };
  }
  const logo = await uploadTeamLogo(team.id, formData.get("logo") as File | null, makeT("ru"));
  if (!logo) return { error: "Выберите файл логотипа" };
  if (typeof logo === "object") return logo;
  const { error } = await db().from("teams").update({ logo_url: logo }).eq("id", team.id);
  if (error) return { error: "Не удалось сохранить логотип" };
  await audit(admin.id, "admin.team.logo", { type: "team", id: team.id });
  revalidateTeam(team.id, team.tag);
  return { success: "Логотип обновлён" };
}

/** Игрок по нику, SteamID (17 цифр) или ссылке на профиль Steam */
async function findPlayer(raw: string): Promise<{ id: string; nickname: string } | { error: string }> {
  const q = raw.trim();
  if (!q) return { error: "Введите ник или SteamID игрока" };
  const steam = /(\d{17})/.exec(q)?.[1];
  if (steam) {
    const { data } = await db().from("players").select("id, nickname").eq("steam_id", steam).maybeSingle();
    return data ?? { error: "Игрок с таким SteamID ещё не входил на сайт через Steam" };
  }
  const { data } = await db().from("players").select("id, nickname").ilike("nickname", q.replace(/[%_]/g, "\\$&")).limit(5);
  if (!data?.length) return { error: `Игрок «${q}» не найден. Он должен хотя бы раз войти на сайт через Steam. Можно ввести SteamID.` };
  if (data.length > 1) return { error: `Ников «${q}» несколько — введите SteamID игрока` };
  return data[0];
}

export async function adminAddMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  const found = await findPlayer(String(formData.get("player") ?? ""));
  if ("error" in found) return { error: found.error };
  const want = formData.get("role") === "substitute" ? "substitute" : "player";

  const other = await getActiveMembership(found.id);
  if (other && other.team.id === team.id) return { error: `${found.nickname} уже в этой команде` };
  if (other) {
    // «Забрать из текущей команды»: админ переводит игрока сам — уходит из старой команды и её заявок
    if (formData.get("move") !== "on") return { error: `${found.nickname} уже в команде ${other.team.name}. Отметьте «Забрать из его текущей команды» или исключите его там.` };
    if (other.team.captain_id === found.id) return { error: `${found.nickname} — капитан ${other.team.name}. Сначала назначьте там капитаном другого игрока.` };
    const { error: leaveError } = await db().from("team_members").update({ left_at: new Date().toISOString() }).eq("id", other.member.id).is("left_at", null);
    if (leaveError) return { error: `Не удалось забрать ${found.nickname} из ${other.team.name}` };
    await syncOpenRosters(other.team.id);
    await rebuildRostersFromTeam(other.team.id);
    await notify([other.team.captain_id], `Администратор перевёл ${found.nickname} из ${other.team.name} в ${team.name}`, undefined, "/team");
    await audit(admin.id, "admin.team.move", { type: "team", id: other.team.id }, { player: found.id, to: team.id });
    revalidateTeam(other.team.id, other.team.tag);
  }
  if (team.coach_id === found.id) return { error: `${found.nickname} — тренер этой команды, игроком быть не может` };

  // те же проверки, что при вступлении по ссылке: под блокировкой команды, с лимитом основы и запаса
  const { data: role, error } = await db().rpc("join_team", { p_team: team.id, p_player: found.id, p_max_main: MAX_MAIN, p_max_subs: MAX_SUBS });
  if (error?.message.includes("team_full")) return { error: `В команде нет мест: основа ${MAX_MAIN}, запас ${MAX_SUBS}` };
  if (error?.message.includes("already_member")) return { error: `${found.nickname} уже в другой команде` };
  if (error || !role) return { error: "Не удалось добавить игрока — обновите страницу" };

  let finalRole = role as string;
  if (finalRole !== want) {
    const members = await getTeamMembers(team.id);
    const m = members.find((x) => x.player_id === found.id);
    const r = m
      ? await db().rpc("set_team_member_role", { p_team: team.id, p_actor: team.captain_id, p_member: m.id, p_role: want, p_max_main: MAX_MAIN, p_max_subs: MAX_SUBS })
      : null;
    if (r && !r.error) finalRole = want;
  }
  await cancelPlayerApplications(found.id);
  await cancelPlayerInvites(found.id);
  const label = finalRole === "substitute" ? "в запас" : "в основу";
  await notify([found.id], `Администратор добавил вас в команду ${team.name} (${label})`, undefined, "/team");
  await notify([team.captain_id], `Администратор добавил ${found.nickname} в ${team.name} (${label})`, undefined, "/team");
  const notAdded = await rebuildRostersFromTeam(team.id);
  if (notAdded.length) await notify([admin.id], `${notAdded.join(", ")}: не перенесён в заявку ${team.name} — уже заявлен за другую команду`, undefined, `/admin/teams/${team.id}`);
  await audit(admin.id, "admin.team.add", { type: "team", id: team.id }, { player: found.id, role: finalRole });
  revalidateTeam(team.id, team.tag);
  if (finalRole !== want) return { success: `${found.nickname} добавлен ${label}: в «${want === "substitute" ? "запасе" : "основе"}» нет места` };
  return { success: `${found.nickname} добавлен ${label}` };
}

export async function adminSetRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const team = await getTeamById(String(formData.get("teamId")));
  if (!team || team.disbanded_at) return { error: "Команда не найдена" };
  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === String(formData.get("memberId")));
  if (!target) return { error: "Игрок уже не в команде — обновите страницу" };
  if (target.player_id === team.captain_id) return { error: "Капитан всегда в основе" };
  const role = formData.get("role") === "substitute" ? "substitute" : "player";
  const { error } = await db().rpc("set_team_member_role", { p_team: team.id, p_actor: team.captain_id, p_member: target.id, p_role: role, p_max_main: MAX_MAIN, p_max_subs: MAX_SUBS });
  if (error?.message.includes("main_full")) return { error: `В основе уже ${MAX_MAIN} игроков — сначала переведите кого-то в запас` };
  if (error?.message.includes("subs_full")) return { error: `В запасе уже ${MAX_SUBS} игрока` };
  if (error) return { error: "Не удалось изменить роль — обновите страницу" };
  await syncOpenRosters(team.id);
  await rebuildRostersFromTeam(team.id);
  await audit(admin.id, "admin.team.role", { type: "team", id: team.id }, { player: target.player.steam_id, role });
  revalidateTeam(team.id, team.tag);
  return { success: `${target.player.nickname} — ${role === "substitute" ? "в запасе" : "в основе"}` };
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
  await rebuildRostersFromTeam(team.id);
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
