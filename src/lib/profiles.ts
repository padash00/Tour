import "server-only";
import { audit } from "./audit";
import { dedupeOrganizations, SEED_ORGANIZATIONS } from "./organizations";
import { isProfileComplete } from "./profile";
import { db } from "./supabase";
import type { Json } from "./database.types";
import type { Player, PlayerProfile } from "./types";

/*
 * Анкеты игроков на сервере. Персональные данные читаются только здесь и только для владельца
 * или админа — в публичные страницы и RSC-данные других игроков они не попадают.
 */

export async function getProfile(playerId: string): Promise<PlayerProfile | null> {
  const { data } = await db().from("player_profiles").select("*").eq("player_id", playerId).maybeSingle();
  return (data as PlayerProfile | null) ?? null;
}

export async function getProfiles(playerIds: string[]): Promise<Map<string, PlayerProfile>> {
  if (playerIds.length === 0) return new Map();
  const { data } = await db().from("player_profiles").select("*").in("player_id", [...new Set(playerIds)]);
  return new Map(((data ?? []) as PlayerProfile[]).map((p) => [p.player_id, p]));
}

/**
 * Анкета обязательна для команды и заявок (app_settings.PROFILE_REQUIRED, по умолчанию — да).
 * «0» — выключено: остаётся мягкое напоминание. Официальные турниры требуют анкеты всегда.
 */
export async function isProfileRequired(): Promise<boolean> {
  try {
    const { data } = await db().from("app_settings").select("value").eq("key", "PROFILE_REQUIRED").maybeSingle();
    return data?.value !== "0";
  } catch {
    return true;
  }
}

export const PROFILE_REQUIRED_ERROR = "Сначала заполните анкету игрока — это займёт минуту";

/** null — можно продолжать; иначе текст ошибки для формы (создать/вступить в команду, подать заявку) */
export async function profileGateError(player: Pick<Player, "id">): Promise<string | null> {
  if (!(await isProfileRequired())) return null;
  return isProfileComplete(await getProfile(player.id)) ? null : PROFILE_REQUIRED_ERROR;
}

/** Нужно ли показать игроку стену «заполните анкету» на странице команды/заявки */
export async function needsProfile(playerId: string): Promise<boolean> {
  if (!(await isProfileRequired())) return false;
  return !isProfileComplete(await getProfile(playerId));
}

/**
 * Официальный турнир, который сейчас «замораживает» анкету игрока: игрок в составе заявки (на рассмотрении
 * или одобренной), турнир не завершён и не отменён. Пока так — анкету меняет только администратор.
 */
export async function profileLock(playerId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await db()
    .from("tournament_roster_players")
    .select("registration:tournament_registrations!tournament_roster_players_registration_id_fkey(status), tournament:tournaments(id, name, status, is_official)")
    .eq("player_id", playerId);
  const row = (data ?? []).find(
    (r) =>
      r.tournament?.is_official &&
      !["finished", "cancelled"].includes(r.tournament.status) &&
      (r.registration?.status === "pending" || r.registration?.status === "approved"),
  );
  return row?.tournament ? { id: row.tournament.id, name: row.tournament.name } : null;
}

/** Подсказки организаций: стартовый список + названия, которые уже вводили игроки и капитаны */
export async function getOrganizationSuggestions(): Promise<string[]> {
  const [profiles, apps] = await Promise.all([
    db().from("player_profiles").select("organization").not("organization", "is", null).limit(2000),
    db().from("tournament_applications").select("organization").limit(1000),
  ]);
  return dedupeOrganizations([
    ...SEED_ORGANIZATIONS,
    ...(apps.data ?? []).map((r) => r.organization),
    ...(profiles.data ?? []).map((r) => r.organization),
  ]);
}

/**
 * Запись в журнал о просмотре персональных данных админом. Страницы с живым обновлением перерисовываются
 * часто — пишем не чаще раза в 10 минут на админа и объект.
 */
export async function auditPersonalView(adminId: string, action: string, entity: { type: string; id: string }, payload: { [key: string]: Json | undefined } = {}) {
  try {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data } = await db()
      .from("audit_logs")
      .select("id")
      .eq("actor_id", adminId)
      .eq("action", action)
      .eq("entity_id", entity.id)
      .gte("created_at", since)
      .limit(1);
    if (data?.length) return;
    await audit(adminId, action, entity, payload);
  } catch (e) {
    console.error("personal data view audit failed", e);
  }
}
