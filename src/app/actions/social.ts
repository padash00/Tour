"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { BANNED_ERROR, getActiveMembership, getTeamMembers, isRateLimited } from "@/lib/data";
import { FINDER_MODES, FINDER_ROLES, FINDER_TTL_DAYS, closeExpired } from "@/lib/finder";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const ROLE_KEYS = FINDER_ROLES.map((r) => r.key) as string[];

function clean(v: FormDataEntryValue | null, max: number) {
  const s = String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

function parsePost(formData: FormData) {
  const roles = [...new Set(formData.getAll("roles").map(String))].filter((r) => ROLE_KEYS.includes(r));
  const modes = [...new Set(formData.getAll("modes").map(String))].filter((m) => (FINDER_MODES as readonly string[]).includes(m));
  if (roles.length === 0) return { error: "Отметьте хотя бы одну роль" } as const;
  if (modes.length === 0) return { error: "Отметьте режим: 5×5 или 2×2" } as const;
  return {
    roles,
    modes,
    availability: clean(formData.get("availability"), 80),
    note: clean(formData.get("note"), 300),
  } as const;
}

const expires = () => new Date(Date.now() + FINDER_TTL_DAYS * 24 * 3600 * 1000).toISOString();

/** Игрок: «Ищу команду» — создать или обновить своё объявление */
export async function savePlayerPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/find");
  if (player.is_banned) return { error: BANNED_ERROR };
  const parsed = parsePost(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (await isRateLimited(player.id, "finder.post", 10)) return { error: "Слишком часто — попробуйте через несколько секунд" };

  await closeExpired("player", player.id);
  const { data: existing } = await db()
    .from("finder_posts")
    .select("id")
    .eq("kind", "player")
    .eq("player_id", player.id)
    .eq("active", true)
    .maybeSingle();
  const patch = { ...parsed, expires_at: expires(), updated_at: new Date().toISOString() };
  const { error } = existing
    ? await db().from("finder_posts").update(patch).eq("id", existing.id)
    : await db().from("finder_posts").insert({ kind: "player", player_id: player.id, ...patch });
  if (error) return { error: "Не удалось сохранить объявление" };
  await audit(player.id, "finder.post", undefined, { kind: "player" });
  revalidatePath("/find");
  return { success: existing ? "Объявление обновлено — продлено на 14 дней" : "Объявление опубликовано на 14 дней" };
}

/** Капитан: «Ищем игрока» для своей команды */
export async function saveTeamPost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/find?tab=teams");
  if (player.is_banned) return { error: BANNED_ERROR };
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return { error: "Объявление от команды публикует капитан" };
  const parsed = parsePost(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (await isRateLimited(player.id, "finder.post", 10)) return { error: "Слишком часто — попробуйте через несколько секунд" };

  const team = membership.team;
  await closeExpired("team", team.id);
  const { data: existing } = await db()
    .from("finder_posts")
    .select("id")
    .eq("kind", "team")
    .eq("team_id", team.id)
    .eq("active", true)
    .maybeSingle();
  const patch = { ...parsed, player_id: player.id, expires_at: expires(), updated_at: new Date().toISOString() };
  const { error } = existing
    ? await db().from("finder_posts").update(patch).eq("id", existing.id)
    : await db().from("finder_posts").insert({ kind: "team", team_id: team.id, ...patch });
  if (error) return { error: "Не удалось сохранить объявление" };
  await audit(player.id, "finder.post", { type: "team", id: team.id }, { kind: "team" });
  revalidatePath("/find");
  return { success: existing ? "Объявление команды обновлено" : "Команда ищет игроков — объявление опубликовано" };
}

/** Снять своё объявление (игрока или команды, где вы капитан) */
export async function closePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/find");
  const id = String(formData.get("postId") ?? "");
  const { data: post } = await db().from("finder_posts").select("id, kind, player_id, team_id").eq("id", id).maybeSingle();
  if (!post) return { error: "Объявление не найдено" };
  let allowed = post.kind === "player" && post.player_id === player.id;
  if (post.kind === "team") {
    const membership = await getActiveMembership(player.id);
    allowed = !!membership && membership.team.id === post.team_id && membership.team.captain_id === player.id;
  }
  if (!allowed) return { error: "Это не ваше объявление" };
  await db().from("finder_posts").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
  await audit(player.id, "finder.close", undefined, { kind: post.kind });
  revalidatePath("/find");
  return { success: "Объявление снято" };
}

/** Капитан приглашает игрока из объявления «ищу команду» — уведомление со ссылкой-приглашением */
export async function invitePlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/find");
  if (player.is_banned) return { error: BANNED_ERROR };
  const membership = await getActiveMembership(player.id);
  if (!membership || membership.team.captain_id !== player.id) return { error: "Приглашать может капитан команды" };
  const team = membership.team;
  const id = String(formData.get("postId") ?? "");
  const { data: post } = await db()
    .from("finder_posts")
    .select("id, player_id, modes, active, expires_at")
    .eq("id", id)
    .eq("kind", "player")
    .maybeSingle();
  if (!post || !post.active || new Date(post.expires_at).getTime() < Date.now()) return { error: "Объявление уже неактуально" };
  if (post.player_id === player.id) return { error: "Это ваше объявление" };
  const members = await getTeamMembers(team.id);
  if (members.some((m) => m.player_id === post.player_id)) return { error: "Игрок уже в вашей команде" };
  if (await isRateLimited(player.id, `finder.invite:${post.player_id}`, 3600)) return { error: "Вы уже приглашали этого игрока — подождите ответа" };

  await notify(
    [post.player_id],
    `${team.name} приглашает вас в команду`,
    `Капитан ${player.nickname} увидел ваше объявление. Нажмите, чтобы вступить в [${team.tag}].`,
    `/join/${team.invite_code}`,
  );
  await audit(player.id, `finder.invite:${post.player_id}`, { type: "team", id: team.id }, { to: post.player_id });
  return { success: "Приглашение отправлено — игрок получит уведомление" };
}

/** Игрок откликается на «ищем игрока» — уведомление капитану со ссылкой на профиль */
export async function respondToTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer("/find?tab=teams");
  if (player.is_banned) return { error: BANNED_ERROR };
  const id = String(formData.get("postId") ?? "");
  const { data: post } = await db()
    .from("finder_posts")
    .select("id, team_id, active, expires_at, team:teams(id, name, captain_id)")
    .eq("id", id)
    .eq("kind", "team")
    .maybeSingle();
  const team = (post as unknown as { team: { id: string; name: string; captain_id: string } | null } | null)?.team;
  if (!post || !team || !post.active || new Date(post.expires_at).getTime() < Date.now()) return { error: "Объявление уже неактуально" };
  const membership = await getActiveMembership(player.id);
  if (membership?.team.id === team.id) return { error: "Вы уже в этой команде" };
  if (await isRateLimited(player.id, `finder.respond:${team.id}`, 3600)) return { error: "Вы уже откликались — капитан увидит уведомление" };
  const note = clean(formData.get("message"), 200);

  await notify(
    [team.captain_id],
    `${player.nickname} откликнулся на объявление ${team.name}`,
    `${note ? `«${note}» · ` : ""}FACEIT ${player.faceit_level ?? "—"} · ${player.faceit_elo ?? "—"} ELO. Откройте профиль игрока.`,
    `/players/${player.steam_id}`,
  );
  await audit(player.id, `finder.respond:${team.id}`, { type: "team", id: team.id });
  return { success: "Отклик отправлен капитану" };
}

