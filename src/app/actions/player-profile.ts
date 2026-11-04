"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requirePlayer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRateLimited } from "@/lib/data";
import { PRIVACY_VERSION, parseProfileForm } from "@/lib/profile";
import { getProfile, profileLock } from "@/lib/profiles";
import { safeNext } from "@/lib/redirect";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";
import { getT } from "@/lib/i18n/server";

/** Ответ формы анкеты: общая ошибка или ошибки по полям (показываются под полями) */
export type ProfileActionResult = (ActionResult & { fields?: Record<string, string> }) | null;

/** Поля анкеты, которые стираются при удалении (prompted_at остаётся — повторно после входа не спрашиваем) */
const CLEARED = {
  last_name: null,
  first_name: null,
  patronymic: null,
  birth_date: null,
  phone: null,
  city: null,
  occupation: null,
  organization: null,
  position: null,
  course: null,
  study_group: null,
  consent_at: null,
  consent_version: null,
};

const lockedText = (t: Awaited<ReturnType<typeof getT>>, name: string) =>
  t("Вы заявлены на официальный турнир «{name}» — анкета зафиксирована до его окончания. Исправить данные может администратор.", { name });

export async function saveProfile(_prev: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const t = await getT();
  const player = await requirePlayer("/me/profile");
  if (await isRateLimited(player.id, "profile.save", 3)) return { error: t("Слишком часто — попробуйте через пару секунд") };
  const lock = await profileLock(player.id);
  if (lock) return { error: lockedText(t, lock.name) };

  const { value, errors } = parseProfileForm((k) => formData.get(k));
  const before = await getProfile(player.id);
  // согласие обязательно; уже данное согласие той же версии повторно не требуется
  const consent = formData.get("consent") === "on";
  const consented = before?.consent_at && before.consent_version === PRIVACY_VERSION;
  if (!consent && !consented) return { error: t("Нужно согласие на обработку персональных данных"), fields: { ...errors, consent: "Отметьте согласие" } };
  if (Object.keys(errors).length) return { error: t("Проверьте поля анкеты"), fields: errors };

  const now = new Date().toISOString();
  const { error } = await db()
    .from("player_profiles")
    .upsert({
      player_id: player.id,
      ...value,
      ...(consent && !consented ? { consent_at: now, consent_version: PRIVACY_VERSION } : {}),
      updated_at: now,
      updated_by: player.id,
    });
  if (error) return { error: t("Не удалось сохранить анкету. Попробуйте ещё раз.") };
  // в журнал — только факт изменения, без самих данных
  await audit(player.id, before ? "profile.update" : "profile.create", { type: "player", id: player.id });
  revalidatePath("/me/profile");
  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(safeNext(next, "/me"));
  return { success: t("Анкета сохранена") };
}

/** Игрок удаляет свою анкету (данные стираются; аккаунт, команда и статистика остаются) */
export async function deleteOwnProfile(): Promise<ActionResult> {
  const t = await getT();
  const player = await requirePlayer("/me/profile");
  const lock = await profileLock(player.id);
  if (lock) return { error: lockedText(t, lock.name) };
  const { error } = await db().from("player_profiles").update({ ...CLEARED, updated_at: new Date().toISOString(), updated_by: player.id }).eq("player_id", player.id);
  if (error) return { error: t("Не удалось удалить анкету") };
  await audit(player.id, "profile.delete", { type: "player", id: player.id });
  revalidatePath("/me/profile");
  return { success: t("Анкета удалена") };
}

// ───────────────────────── администратор

/** Админ правит анкету любого игрока (в том числе зафиксированную официальным турниром) */
export async function adminSaveProfile(_prev: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const admin = await requireAdmin();
  const playerId = String(formData.get("playerId") ?? "");
  const { data: target } = await db().from("players").select("id").eq("id", playerId).maybeSingle();
  if (!target) return { error: "Игрок не найден" };
  const { value, errors } = parseProfileForm((k) => formData.get(k), undefined, false);
  if (Object.keys(errors).length) return { error: "Проверьте поля анкеты", fields: errors };
  const before = await getProfile(playerId);
  const now = new Date().toISOString();
  // согласие, полученное на бумаге, админ отмечает сам; уже данное согласие не трогаем
  const paper = formData.get("paper_consent") === "on" && !before?.consent_at;
  const { error } = await db()
    .from("player_profiles")
    .upsert({ player_id: playerId, ...value, ...(paper ? { consent_at: now, consent_version: "paper" } : {}), updated_at: now, updated_by: admin.id });
  if (error) return { error: "Не удалось сохранить анкету" };
  await audit(admin.id, "profile.admin_update", { type: "player", id: playerId }, { paper_consent: paper || undefined });
  revalidatePath("/admin", "layout");
  return { success: "Анкета сохранена" };
}

export async function adminDeleteProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const playerId = String(formData.get("playerId") ?? "");
  const { error } = await db().from("player_profiles").update({ ...CLEARED, updated_at: new Date().toISOString(), updated_by: admin.id }).eq("player_id", playerId);
  if (error) return { error: "Не удалось удалить анкету" };
  await audit(admin.id, "profile.admin_delete", { type: "player", id: playerId });
  revalidatePath("/admin", "layout");
  return { success: "Персональные данные игрока удалены" };
}

/** Ссылка на бота для подтверждения Telegram: t.me/<бот>?start=<одноразовый токен на 30 минут> */
export async function startTelegramLink(): Promise<{ url?: string; error?: string }> {
  const t = await getT();
  const player = await requirePlayer("/me/profile");
  const { telegramConfig } = await import("@/lib/telegram");
  const cfg = await telegramConfig();
  if (!cfg.username || !cfg.token) return { error: t("Бот пока не подключён — напишите организатору") };
  // свежая ссылка уже есть — отдаём её же: повторный клик не должен «ломать» уже открытый в Telegram старт
  const { data: fresh } = await db()
    .from("telegram_link_tokens")
    .select("token, created_at")
    .eq("player_id", player.id)
    .gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fresh?.token) return { url: `https://t.me/${cfg.username}?start=${fresh.token}` };
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(12).toString("base64url");
  await db().from("telegram_link_tokens").delete().eq("player_id", player.id);
  const { error } = await db().from("telegram_link_tokens").insert({ token, player_id: player.id });
  if (error) return { error: t("Не удалось создать ссылку — попробуйте ещё раз") };
  return { url: `https://t.me/${cfg.username}?start=${token}` };
}

/** Контакт для связи (WhatsApp / Telegram) — игрок меняет всегда, даже когда анкета зафиксирована официальным турниром */
export async function saveContact(_prev: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const t = await getT();
  const player = await requirePlayer("/me/profile");
  if (await isRateLimited(player.id, "profile.contact", 3)) return { error: t("Слишком часто — попробуйте через пару секунд") };
  const { normalizeTelegram } = await import("@/lib/profile");
  const rawTg = String(formData.get("telegram") ?? "").trim();
  const telegram = normalizeTelegram(rawTg);
  const whatsapp = formData.get("whatsapp") === "on";
  if (rawTg && !telegram) return { error: t("Ник Telegram: латиница, цифры и «_», от 5 символов"), fields: { telegram: "Например @dimon_kz" } };
  const before = await getProfile(player.id);
  if (!telegram && !whatsapp && !before?.telegram_chat_id) {
    return { error: t("Укажите Telegram или отметьте WhatsApp"), fields: { telegram: "Укажите Telegram или отметьте WhatsApp" } };
  }
  const now = new Date().toISOString();
  const { error } = before
    ? await db().from("player_profiles").update({ telegram, whatsapp, updated_at: now, updated_by: player.id }).eq("player_id", player.id)
    : await db().from("player_profiles").insert({ player_id: player.id, telegram, whatsapp, updated_by: player.id });
  if (error) return { error: t("Не удалось сохранить — попробуйте ещё раз") };
  await audit(player.id, "profile.contact", { type: "player", id: player.id });
  revalidatePath("/me/profile");
  return { success: t("Контакт сохранён") };
}
