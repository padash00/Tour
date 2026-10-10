"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BANNED_ERROR, getActiveMembership, isRateLimited } from "@/lib/data";
import { sendInvite } from "./invites";
import { FINDER_MODES, FINDER_ROLES, FINDER_TTL_DAYS, closeExpired } from "@/lib/finder";
import type { Tables } from "@/lib/database.types";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const ROLE_KEYS = FINDER_ROLES.map((r) => r.key) as string[];

function clean(v: FormDataEntryValue | null, max: number) {
  const s = String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

type PostFields = Pick<Tables<"finder_posts">, "roles" | "modes" | "availability" | "note">;

function parsePost(formData: FormData): { error: string } | PostFields {
  const roles = [...new Set(formData.getAll("roles").map(String))].filter((r) => ROLE_KEYS.includes(r));
  const modes = [...new Set(formData.getAll("modes").map(String))].filter((m) => (FINDER_MODES as readonly string[]).includes(m));
  if (roles.length === 0) return { error: "Отметьте хотя бы одну роль" };
  if (modes.length === 0) return { error: "Отметьте режим: 5×5 или 2×2" };
  return {
    roles,
    modes,
    availability: clean(formData.get("availability"), 80),
    note: clean(formData.get("note"), 300),
  };
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
  if (await isRateLimited(player.id, `finder.invite:${post.player_id}`, 3600)) return { error: "Вы уже приглашали этого игрока — подождите ответа" };

  // то же личное приглашение, что и по нику: игрок увидит его в «Моя команда» и подтвердит
  const fd = new FormData();
  fd.set("playerId", post.player_id);
  fd.set("role", "player");
  const r = await sendInvite(null, fd);
  if (r?.error) return r;
  await audit(player.id, `finder.invite:${post.player_id}`, { type: "team", id: team.id }, { to: post.player_id });
  return { success: "Приглашение отправлено — игрок получит уведомление" };
}

