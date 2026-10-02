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
  sniffImage,
  syncOpenRosters,
} from "@/lib/data";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

function inviteCode(tag: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${tag.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "F16"}-${suffix}`;
}

const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Название — минимум 2 символа")
    .max(32, "Название — максимум 32 символа"),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,6}$/, "Тег — 2–6 латинских букв или цифр"),
  region: z.string().trim().max(48).optional().default(""),
  description: z.string().trim().max(400, "Описание — максимум 400 символов").optional().default(""),
});

async function uploadLogo(teamId: string, file: File | null): Promise<string | null | { error: string }> {
  if (!file || file.size === 0) return null;
  if (file.size > 1024 * 1024) return { error: "Логотип — не больше 1 МБ" };
  // тип определяем по содержимому файла, а не по заявленному браузером
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: "Логотип — PNG, JPG или WEBP" };
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${teamId}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from("team-logos").upload(path, bytes, { contentType: type, upsert: true });
  if (error) return { error: "Не удалось загрузить логотип" };
  return db().storage.from("team-logos").getPublicUrl(path).data.publicUrl;
}

function uniqueViolation(error: { code?: string; message?: string } | null) {
  if (error?.code !== "23505") return null;
  if (error.message?.includes("tag")) return "Команда с таким тегом уже существует";
  if (error.message?.includes("name")) return "Команда с таким названием уже существует";
  return "Такая запись уже существует";
}

export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/team/create");
  if (player.is_banned) return { error: BANNED_ERROR };
  if (await getActiveMembership(player.id)) return { error: "Вы уже состоите в команде" };
  if (await isRateLimited(player.id, "team.create", 30)) return { error: "Слишком часто — попробуйте через несколько секунд" };

  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
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
  if (error || !team) return { error: uniqueViolation(error) ?? "Не удалось создать команду" };

  const { error: memberError } = await db()
    .from("team_members")
    .insert({ team_id: team.id, player_id: player.id, role: "captain" });
  if (memberError) {
    await db().from("teams").delete().eq("id", team.id);
    return { error: "Вы уже состоите в команде" };
  }

  const logo = await uploadLogo(team.id, formData.get("logo") as File | null);
  if (typeof logo === "string") await db().from("teams").update({ logo_url: logo }).eq("id", team.id);
  // если логотип не подошёл — команда всё равно создана, логотип можно загрузить в настройках

  await audit(player.id, "team.create", { type: "team", id: team.id }, { name, tag });
  redirect("/team");
}

const NOT_CAPTAIN = "Только капитан может это сделать";

async function requireCaptain() {
  const player = await requirePlayer("/team");
  if (player.is_banned) return null; // заблокированный капитан не управляет командой
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return null;
  return { player, team: membership.team };
}

async function lockedError(teamId: string) {
  const locked = await getLockingTournament(teamId);
  return locked
    ? `Состав заблокирован турниром «${locked.name}». Изменения — только через администратора.`
    : null;
}

export async function updateTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  if (await isRateLimited(player.id, "team.update", 5)) return { error: "Слишком часто — попробуйте через несколько секунд" };
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, tag, region, description } = parsed.data;

  const logo = await uploadLogo(team.id, formData.get("logo") as File | null);
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
  if (error) return { error: uniqueViolation(error) ?? "Не удалось сохранить" };

  await audit(player.id, "team.update", { type: "team", id: team.id }, { name, tag });
  revalidatePath("/team");
  return { success: "Сохранено" };
}

export async function regenerateInvite(): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  if (await isRateLimited(player.id, "team.invite_regenerate", 10)) return { error: "Слишком часто — попробуйте через несколько секунд" };
  await db().from("teams").update({ invite_code: inviteCode(team.tag) }).eq("id", team.id);
  await audit(player.id, "team.invite_regenerate", { type: "team", id: team.id });
  revalidatePath("/team");
  return { success: "Новая ссылка создана, старая больше не работает" };
}

export async function joinTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "");
  const player = await requirePlayer(`/join/${code}`);
  if (player.is_banned) return { error: BANNED_ERROR };
  if (await isRateLimited(player.id, "team.join", 5)) return { error: "Слишком часто — попробуйте через пару секунд" };

  const team = await getTeamByInvite(code);
  if (!team) return { error: "Ссылка недействительна" };
  if (await getActiveMembership(player.id)) return { error: "Вы уже состоите в команде. Сначала покиньте её." };

  const locked = await lockedError(team.id);
  if (locked) return { error: locked };

  const members = await getTeamMembers(team.id);
  const mains = members.filter((m) => m.role !== "substitute").length;
  const subs = members.length - mains;
  const role = mains < MAX_MAIN ? "player" : subs < MAX_SUBS ? "substitute" : null;
  if (!role) return { error: "В команде нет свободных мест" };

  const { error } = await db().from("team_members").insert({ team_id: team.id, player_id: player.id, role });
  if (error) return { error: "Не удалось вступить — возможно, вы уже в другой команде" };

  await syncOpenRosters(team.id);
  await notify([team.captain_id], `${player.nickname} вступил в ${team.name}`, undefined, "/team");
  await audit(player.id, "team.join", { type: "team", id: team.id }, { role });
  redirect("/team");
}

export async function leaveTeam(): Promise<ActionResult> {
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);
  if (!membership) return { error: "Вы не состоите в команде" };
  if (membership.team.captain_id === player.id) {
    return { error: "Капитан не может покинуть команду. Передайте капитанство или распустите команду." };
  }
  const locked = await lockedError(membership.team.id);
  if (locked) return { error: locked };

  await db().from("team_members").update({ left_at: new Date().toISOString() }).eq("id", membership.member.id);
  await syncOpenRosters(membership.team.id);
  await notify([membership.team.captain_id], `${player.nickname} покинул ${membership.team.name}`, undefined, "/team");
  await audit(player.id, "team.leave", { type: "team", id: membership.team.id });
  redirect("/me");
}

export async function kickMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  const locked = await lockedError(team.id);
  if (locked) return { error: locked };

  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  if (!target) return { error: "Игрок не найден" };
  if (target.player_id === player.id) return { error: "Нельзя исключить себя" };

  await db().from("team_members").update({ left_at: new Date().toISOString() }).eq("id", target.id);
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Вас исключили из ${team.name}`);
  await audit(player.id, "team.kick", { type: "team", id: team.id }, { player: target.player.steam_id });
  revalidatePath("/team");
  return { success: `${target.player.nickname} исключён` };
}

export async function setMemberRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  const role = formData.get("role") === "substitute" ? "substitute" : "player";
  const locked = await lockedError(team.id);
  if (locked) return { error: locked };

  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  if (!target || target.role === "captain") return { error: "Нельзя изменить роль" };

  const mains = members.filter((m) => m.role !== "substitute").length;
  const subs = members.length - mains;
  if (role === "player" && target.role === "substitute" && mains >= MAX_MAIN) {
    return { error: `В основе уже ${MAX_MAIN} игроков` };
  }
  if (role === "substitute" && target.role === "player" && subs >= MAX_SUBS) {
    return { error: `Уже ${MAX_SUBS} запасных` };
  }

  await db().from("team_members").update({ role }).eq("id", target.id);
  await syncOpenRosters(team.id);
  await audit(player.id, "team.role", { type: "team", id: team.id }, { player: target.player.steam_id, role });
  revalidatePath("/team");
  return null;
}

export async function transferCaptain(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const memberId = String(formData.get("memberId"));
  const members = await getTeamMembers(team.id);
  const target = members.find((m) => m.id === memberId);
  const me = members.find((m) => m.player_id === player.id);
  if (!target || !me || target.id === me.id) return { error: "Игрок не найден" };

  await db().from("team_members").update({ role: target.role === "substitute" ? "substitute" : "player" }).eq("id", me.id);
  await db().from("team_members").update({ role: "captain" }).eq("id", target.id);
  await db().from("teams").update({ captain_id: target.player_id }).eq("id", team.id);
  await syncOpenRosters(team.id);
  await notify([target.player_id], `Вы стали капитаном ${team.name}`, undefined, "/team");
  await audit(player.id, "team.transfer_captain", { type: "team", id: team.id }, { to: target.player.steam_id });
  revalidatePath("/team");
  return { success: `Капитан — ${target.player.nickname}` };
}

export async function disbandTeam(): Promise<ActionResult> {
  const ctx = await requireCaptain();
  if (!ctx) return { error: NOT_CAPTAIN };
  const { player, team } = ctx;
  const regs = await getTeamRegistrations(team.id);
  const active = regs.find(
    (r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status),
  );
  if (active) return { error: `Команда заявлена на «${active.tournament.name}». Сначала отзовите заявку.` };

  const now = new Date().toISOString();
  const members = await getTeamMembers(team.id);
  await db().from("team_members").update({ left_at: now }).eq("team_id", team.id).is("left_at", null);
  await db().from("teams").update({ disbanded_at: now }).eq("id", team.id);
  await notify(
    members.filter((m) => m.player_id !== player.id).map((m) => m.player_id),
    `Команда ${team.name} распущена`,
  );
  await audit(player.id, "team.disband", { type: "team", id: team.id });
  redirect("/me");
}
