"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import {
  BANNED_ERROR,
  MAX_MAIN,
  MAX_SUBS,
  getActiveMembership,
  getLockingTournament,
  getTeamByInvite,
  getTeamMembers,
  getTeamRegistrations,
  isActiveRegistration,
  isRateLimited,
  syncOpenRosters,
} from "@/lib/data";
import { cancelPlayerApplications, cancelTeamApplications } from "@/lib/applications";
import { cancelPlayerInvites, cancelTeamInvites } from "@/lib/invites";
import { profileGateError } from "@/lib/profiles";
import { db } from "@/lib/supabase";
import { uploadTeamLogo as uploadLogo } from "@/lib/team-logo";
import type { ActionResult } from "@/components/forms";
import { tr, type T } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";

function inviteCode(tag: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${tag.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "F16"}-${suffix}`;
}

const teamSchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, t("Название — минимум 2 символа"))
      .max(32, t("Название — максимум 32 символа")),
    tag: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{2,6}$/, t("Тег — 2–6 латинских букв или цифр")),
    region: z.string().trim().max(48).optional().default(""),
    description: z.string().trim().max(400, t("Описание — максимум 400 символов")).optional().default(""),
  });

function uniqueViolation(error: { code?: string; message?: string } | null, t: T) {
  if (error?.code !== "23505") return null;
  if (error.message?.includes("tag")) return t("Команда с таким тегом уже существует");
  if (error.message?.includes("name")) return t("Команда с таким названием уже существует");
  return t("Такая запись уже существует");
}

export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const player = await requirePlayer("/team/create");
  if (player.is_banned) return { error: t(BANNED_ERROR) };
  if (await getActiveMembership(player.id)) return { error: t("Вы уже состоите в команде") };
  // анкета игрока обязательна для команды (настройка PROFILE_REQUIRED)
  const gate = await profileGateError(player);
  if (gate) return { error: gate };
  if (await isRateLimited(player.id, "team.create", 30)) return { error: t("Слишком часто — попробуйте через несколько секунд") };

  const parsed = teamSchema(t).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, tag, region, description } = parsed.data;

  const { data: team, error } = await db()
    .from("teams")
    .insert({
      name,
      tag: tag.toUpperCase(),
      region: region || null,
      description: description || null,
      captain_id: player.id,
      invite_code: inviteCode(tag),
    })
    .select("*")
    .single();
  if (error || !team) return { error: uniqueViolation(error, t) ?? t("Не удалось создать команду") };

  const { error: memberError } = await db()
    .from("team_members")
    .insert({ team_id: team.id, player_id: player.id, role: "captain" });
  if (memberError) {
    await db().from("teams").delete().eq("id", team.id);
    return { error: t("Вы уже состоите в команде") };
  }

  const logo = await uploadLogo(team.id, formData.get("logo") as File | null, t);
  if (typeof logo === "string") await db().from("teams").update({ logo_url: logo }).eq("id", team.id);
  // если логотип не подошёл — команда всё равно создана, логотип можно загрузить в настройках

  await cancelPlayerApplications(player.id);
  await cancelPlayerInvites(player.id);
  await audit(player.id, "team.create", { type: "team", id: team.id }, { name, tag });
  // экран успеха в штабе: «Команда создана — пригласите игроков»
  redirect("/team?created=1");
}

const NOT_CAPTAIN = tr("Только капитан может это сделать");

async function requireCaptain() {
  const player = await requirePlayer("/team");
  if (player.is_banned) return null; // заблокированный капитан не управляет командой
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return null;
  return { player, team: membership.team };
}

async function lockedError(teamId: string, t: T) {
  const locked = await getLockingTournament(teamId);
  return locked ? t("Команда подала заявку на «{name}» — состав, название и тег теперь меняет только организатор. Напишите ему.", { name: locked.name }) : null;
}

/** Моя команда и её публичная страница (под одним или несколькими тегами) */
function revalidateTeamPages(...tags: string[]) {
  revalidatePath("/team");
  revalidatePath("/teams");
  for (const tag of new Set(tags)) revalidatePath(`/teams/${encodeURIComponent(tag)}`);
}

export async function updateTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  if (await isRateLimited(player.id, "team.update", 5)) return { error: t("Слишком часто — попробуйте через несколько секунд") };
  const parsed = teamSchema(t).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, tag, region, description } = parsed.data;
  // заявка на турнир фиксирует название и тег; логотип, регион и описание капитан меняет всегда
  if (name !== team.name || tag.toUpperCase() !== team.tag) {
    const lockedUpdate = await lockedError(team.id, t);
    if (lockedUpdate) return { error: lockedUpdate };
  }

  const logo = await uploadLogo(team.id, formData.get("logo") as File | null, t);
  if (logo && typeof logo === "object") return logo;

  const { error } = await db()
    .from("teams")
    .update({
      name,
      tag: tag.toUpperCase(),
      region: region || null,
      description: description || null,
      ...(typeof logo === "string" && { logo_url: logo }),
    })
    .eq("id", team.id);
  if (error) return { error: uniqueViolation(error, t) ?? t("Не удалось сохранить") };

  await audit(player.id, "team.update", { type: "team", id: team.id }, { name, tag });
  // публичная страница под старым и новым тегом (старый теперь перенаправляет), списки и сетки с названием команды
  revalidateTeamPages(team.tag, tag.toUpperCase());
  revalidatePath("/teams");
  revalidatePath("/tournaments/[slug]", "page");
  return { success: t("Сохранено") };
}

export async function regenerateInvite(): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  if (await isRateLimited(player.id, "team.invite_regenerate", 10)) return { error: t("Слишком часто — попробуйте через несколько секунд") };
  await db().from("teams").update({ invite_code: inviteCode(team.tag) }).eq("id", team.id);
  await audit(player.id, "team.invite_regenerate", { type: "team", id: team.id });
  revalidatePath("/team");
  return { success: t("Новая ссылка создана, старая больше не работает") };
}

export async function joinTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const code = String(formData.get("code") ?? "");
  const player = await requirePlayer(`/join/${code}`);
  if (player.is_banned) return { error: t(BANNED_ERROR) };
  const gate = await profileGateError(player);
  if (gate) return { error: gate };
  if (await isRateLimited(player.id, "team.join", 5)) return { error: t("Слишком часто — попробуйте через пару секунд") };

  const team = await getTeamByInvite(code);
  if (!team) return { error: t("Ссылка недействительна") };
  if (await getActiveMembership(player.id)) return { error: t("Вы уже состоите в команде. Сначала покиньте её.") };
  if (team.coach_id === player.id) return { error: t("Вы тренер этой команды — игроком быть нельзя. Сначала уйдите с поста тренера.") };

  const locked = await lockedError(team.id, t);
  if (locked) return { error: locked };

  // места считаются и игрок добавляется под блокировкой команды — одновременные вступления не переполнят состав
  const { data: role, error } = await db().rpc("join_team", {
    p_team: team.id,
    p_player: player.id,
    p_max_main: MAX_MAIN,
    p_max_subs: MAX_SUBS,
  });
  if (error?.message.includes("team_full")) return { error: t("В команде нет свободных мест") };
  if (error?.message.includes("team_missing")) return { error: t("Ссылка недействительна") };
  if (error || !role) return { error: t("Не удалось вступить — возможно, вы уже в другой команде") };

  await syncOpenRosters(team.id);
  await cancelPlayerApplications(player.id);
  await cancelPlayerInvites(player.id);
  await notify([team.captain_id], `${player.nickname} вступил в ${team.name}`, undefined, "/team");
  await audit(player.id, "team.join", { type: "team", id: team.id }, { role });
  redirect("/team");
}

export async function leaveTeam(): Promise<ActionResult> {
  const t = await getT();
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);
  if (!membership) return { error: t("Вы не состоите в команде") };
  if (membership.team.captain_id === player.id) {
    return { error: t("Капитан не может покинуть команду. Передайте капитанство или распустите команду.") };
  }
  const locked = await lockedError(membership.team.id, t);
  if (locked) return { error: locked };

  await db().from("team_members").update({ left_at: new Date().toISOString() }).eq("id", membership.member.id);
  await syncOpenRosters(membership.team.id);
  await notify([membership.team.captain_id], `${player.nickname} покинул ${membership.team.name}`, undefined, "/team");
  await audit(player.id, "team.leave", { type: "team", id: membership.team.id });
  revalidateTeamPages(membership.team.tag);
  redirect("/me");
}

export async function kickMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  const locked = await lockedError(team.id, t);
  if (locked) return { error: locked };

  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  if (!target) return { error: t("Игрок не найден") };
  if (target.player_id === player.id) return { error: t("Нельзя исключить себя") };

  // проверка капитана и исключение — под блокировкой команды (параллельная передача капитанства не проскочит)
  const { error } = await db().rpc("kick_team_member", { p_team: team.id, p_actor: player.id, p_member: target.id });
  if (error?.message.includes("captain_required")) return { error: t(NOT_CAPTAIN) };
  if (error) return { error: t("Игрок уже не в команде — обновите страницу") };
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Вас исключили из ${team.name}`);
  await audit(player.id, "team.kick", { type: "team", id: team.id }, { player: target.player.steam_id });
  revalidateTeamPages(team.tag);
  return { success: t("{name} исключён", { name: target.player.nickname }) };
}

export async function setMemberRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  const role = formData.get("role") === "substitute" ? "substitute" : "player";
  const locked = await lockedError(team.id, t);
  if (locked) return { error: locked };

  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  if (!target || target.role === "captain") return { error: t("Нельзя изменить роль") };

  // места в основе/запасе считаются под блокировкой команды — два быстрых нажатия не переполнят основу
  const { error } = await db().rpc("set_team_member_role", {
    p_team: team.id,
    p_actor: player.id,
    p_member: target.id,
    p_role: role,
    p_max_main: MAX_MAIN,
    p_max_subs: MAX_SUBS,
  });
  if (error?.message.includes("main_full")) return { error: t("В основе уже {n} игроков", { n: MAX_MAIN }) };
  if (error?.message.includes("subs_full")) return { error: t("Уже {n} запасных", { n: MAX_SUBS }) };
  if (error?.message.includes("captain_required")) return { error: t(NOT_CAPTAIN) };
  if (error) return { error: t("Не удалось изменить роль — обновите страницу") };
  await syncOpenRosters(team.id);
  await audit(player.id, "team.role", { type: "team", id: team.id }, { player: target.player.steam_id, role });
  revalidateTeamPages(team.tag);
  return null;
}

export async function transferCaptain(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  // капитан управляет check-in и заявками — пока состав заблокирован турниром, менять его нельзя
  const locked = await lockedError(team.id, t);
  if (locked) return { error: locked };
  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  const me = members.find((m) => m.player_id === player.id);
  if (!target || !me || target.id === me.id) return { error: t("Игрок не найден") };

  // роли обоих игроков и captain_id команды меняются одной транзакцией
  const { error } = await db().rpc("transfer_team_captain", { p_team: team.id, p_actor: player.id, p_member: target.id });
  if (error?.message.includes("captain_required")) return { error: t(NOT_CAPTAIN) };
  if (error) return { error: t("Не удалось передать капитанство — обновите страницу") };
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Вы стали капитаном ${team.name}`, undefined, "/team");
  await audit(player.id, "team.transfer_captain", { type: "team", id: team.id }, { to: target.player.steam_id });
  revalidatePath("/team");
  return { success: t("Капитан — {name}", { name: target.player.nickname }) };
}

export async function disbandTeam(): Promise<ActionResult> {
  const t = await getT();
  const ctx = await requireCaptain();
  if (!ctx) return { error: t(NOT_CAPTAIN) };
  const { player, team } = ctx;
  const regs = await getTeamRegistrations(team.id);
  const active = regs.find(
    (r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status),
  );
  if (active) return { error: t("Команда заявлена на «{name}». Сначала отзовите заявку.", { name: active.tournament.name }) };

  const now = new Date().toISOString();
  const members = await getTeamMembers(team.id);
  await db().from("team_members").update({ left_at: now }).eq("team_id", team.id).is("left_at", null);
  await db().from("teams").update({ disbanded_at: now }).eq("id", team.id);
  await cancelTeamApplications(team.id);
  await cancelTeamInvites(team.id);
  await notify(
    members.filter((m) => m.player_id !== player.id).map((m) => m.player_id),
    `Команда ${team.name} распущена`,
  );
  await audit(player.id, "team.disband", { type: "team", id: team.id });
  revalidateTeamPages(team.tag);
  redirect("/me");
}

/**
 * Свободен ли тег — для подсказки в форме (живая проверка при вводе). Только чтение.
 * Главная проверка остаётся при сохранении (уникальный индекс в базе).
 */
export async function checkTagAvailable(raw: string, exceptTeamId?: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await getT();
  const tag = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(tag)) return { ok: false, reason: t("Тег — 2–6 латинских букв или цифр") };
  let q = db().from("teams").select("id").eq("tag", tag).is("disbanded_at", null).limit(1);
  if (exceptTeamId) q = q.neq("id", exceptTeamId);
  const { data } = await q;
  return data?.length ? { ok: false, reason: t("Тег уже используется") } : { ok: true };
}
