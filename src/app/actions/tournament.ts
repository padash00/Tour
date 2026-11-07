"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import {
  BANNED_ERROR,
  checkinWindowError,
  getActiveMembership,
  getRegistration,
  getSoloTeam,
  getTeamMembers,
  getTournamentById,
  isRateLimited,
} from "@/lib/data";
import { registrationError } from "@/lib/registration-errors";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { checkPlayer, officialRoster, parseApplication, type ApplicationInput } from "@/lib/official";
import { fullName, isProfileComplete, positionOf, tournamentDay, workplaceOf } from "@/lib/profile";
import { getProfile, getProfiles, profileGateError } from "@/lib/profiles";
import { db } from "@/lib/supabase";
import { ackRules, hasRules } from "@/lib/rules-ack";
import type { SaveRegistrationResult, Tournament } from "@/lib/types";
import type { ActionResult } from "@/components/forms";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

async function captainContext(t: T, next: string, tournament?: Tournament, createSolo = false) {
  const player = await requirePlayer(next);
  if (player.is_banned) return { error: t(BANNED_ERROR) } as const;
  if (tournament && modeOf(tournament.format).size === 1) {
    const solo = await getSoloTeam(player, createSolo);
    if (!solo) return { error: t("Вы ещё не участвуете в этом турнире") } as const;
    return { player, team: solo } as const;
  }
  const membership = await getActiveMembership(player.id);
  if (!membership) return { error: t("Сначала создайте команду или вступите в неё") } as const;
  if (membership.team.captain_id !== player.id) return { error: t("Это может сделать только капитан") } as const;
  return { player, team: membership.team } as const;
}

export async function registerTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  // закрытый турнир: участие только по приглашению, пары составляет организатор
  if (!tournament || tournament.status === "draft" || tournament.is_private) return { error: t("Турнир не найден") };
  if (tournament.status !== "registration") return { error: t("Регистрация на турнир закрыта") };
  if (tournament.registration_closes_at && Date.now() > new Date(tournament.registration_closes_at).getTime()) {
    return { error: t("Регистрация на турнир закрыта") };
  }

  const ctx = await captainContext(t, `/tournaments/${tournament.slug}/register`, tournament, true);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;
  // официальный турнир: после подачи заявку меняет только организатор (решение владельца 02.11.2026)
  if (tournament.is_official) {
    const existing = await getRegistration(tournament.id, team.id);
    if (existing && (existing.status === "pending" || existing.status === "approved")) {
      return { error: t("Заявка уже подана — состав и данные теперь меняет только организатор. Напишите ему, что нужно изменить.") };
    }
  }
  // новая заявка — только после прочтения регламента (галочка на странице заявки); правка состава — без этого
  const rulesRequired = hasRules(tournament.rules);
  if (rulesRequired && formData.get("rules_ack") !== "1") {
    const existing = await getRegistration(tournament.id, team.id);
    if (!existing || (existing.status !== "pending" && existing.status !== "approved")) {
      return { error: t("Прочитайте регламент турнира до конца и поставьте галочку «Я прочитал регламент»") };
    }
  }
  // анкета капитана (настройка PROFILE_REQUIRED); в официальном турнире ниже проверяются анкеты всех игроков
  const gate = await profileGateError(player);
  if (gate) return { error: gate };
  if (await isRateLimited(player.id, "registration.create", 5)) return { error: t("Слишком часто — попробуйте через пару секунд") };

  // состав на турнир выбирает капитан: основа ровно под режим, запасные — до лимита режима
  const mode = modeOf(tournament.format);
  const members = await getTeamMembers(team.id);
  let mainIds = formData.getAll("main").map(String);
  let subIds = formData.getAll("sub").map(String);
  if (mainIds.length === 0) {
    const ordered = [...members.filter((m) => m.role !== "substitute"), ...members.filter((m) => m.role === "substitute")];
    mainIds = ordered.slice(0, mode.size).map((m) => m.player_id);
    subIds = ordered.slice(mode.size, mode.size + mode.subs).map((m) => m.player_id);
  }
  const memberIds = new Set(members.map((m) => m.player_id));
  if ([...mainIds, ...subIds].some((id) => !memberIds.has(id))) return { error: t("В составе есть игрок не из вашей команды") };
  if (new Set([...mainIds, ...subIds]).size !== mainIds.length + subIds.length) return { error: t("Игрок выбран дважды") };
  if (mainIds.length !== mode.size) {
    return { error: t("{mode}: в основе должно быть {players}. Выбрано: {n}.", { mode: t(mode.title), players: mainPlayersLabel(mode.size, t), n: mainIds.length }) };
  }
  if (subIds.length > mode.subs) return { error: t("Запасных можно не больше {n}", { n: mode.subs }) };
  const chosen = [...mainIds, ...subIds].map((id) => members.find((m) => m.player_id === id)!);
  const banned = chosen.find((m) => m.player.is_banned);
  if (banned) return { error: t("Игрок {name} заблокирован на платформе", { name: banned.player.nickname }) };

  let application: ApplicationInput | null = null;
  if (tournament.is_official) {
    // официальный турнир: без запасных (если не разрешены), анкеты и возраст каждого игрока, данные организации и тренера
    const { subs: maxSubs } = officialRoster(tournament);
    if (subIds.length > maxSubs) return { error: maxSubs ? t("Запасных можно не больше {n}", { n: maxSubs }) : t("В этом турнире запасные не допускаются — состав в заявке окончательный") };
    const profiles = await getProfiles(chosen.map((m) => m.player_id));
    const day = tournamentDay(tournament);
    const issues = chosen.flatMap((m) => checkPlayer({ id: m.player_id, nickname: m.player.nickname }, profiles.get(m.player_id) ?? null, tournament, day, t).issues);
    if (issues.length) return { error: issues.join(". ") };
    // тренер команды на сайте: его данные берутся из анкеты на сервере (капитан их не видит и не вводит)
    let coach: Record<string, string> | null = null;
    if (tournament.require_coach && formData.get("coach_from_team") === "1") {
      const profile = team.coach_id ? await getProfile(team.coach_id) : null;
      if (!profile || !isProfileComplete(profile)) return { error: t("У тренера команды не заполнена анкета — обновите страницу и впишите данные тренера вручную") };
      coach = {
        coach_name: fullName(profile),
        coach_birth_date: profile.birth_date ?? "",
        coach_workplace: workplaceOf(profile),
        coach_position: positionOf(profile),
      };
    }
    const parsed = parseApplication((k) => coach?.[k] ?? formData.get(k), tournament.require_coach, t);
    const firstError = Object.values(parsed.errors)[0];
    if (firstError) return { error: firstError };
    application = parsed.value;
  }

  const { data: saved, error } = application
    ? await db().rpc("save_official_registration", {
        p_tournament: tournament.id, p_team: team.id, p_actor: player.id, p_main: mainIds, p_sub: subIds, p_application: application,
      })
    : await db().rpc("save_registration", {
        p_tournament: tournament.id, p_team: team.id, p_actor: player.id, p_main: mainIds, p_sub: subIds,
      });
  if (error) return { error: registrationError(error, t) };
  const { updated: isUpdate, approved: auto } = saved as SaveRegistrationResult;

  if (isUpdate) {
    await audit(player.id, "registration.roster", { type: "tournament", id: tournament.id }, { team: team.tag });
    revalidatePath(`/tournaments/${tournament.slug}`, "layout");
    return { success: t("Состав заявки обновлён") };
  }

  await notify(
    chosen.filter((m) => m.player_id !== player.id).map((m) => m.player_id),
    auto ? `${team.name} участвует в «${tournament.name}»` : `${team.name} подала заявку на «${tournament.name}»`,
    auto ? "Заявка одобрена автоматически." : "Заявка ожидает подтверждения администратора.",
    `/tournaments/${tournament.slug}`,
  );
  await audit(player.id, auto ? "registration.auto_approved" : "registration.create", { type: "tournament", id: tournament.id }, { team: team.tag });
  if (rulesRequired) await ackRules(player.id, tournament.id);
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath("/team");
  return {
    success: auto ? t("Заявка одобрена — вы в турнире! Не забудьте пройти check-in.") : t("Заявка подана. Ожидайте подтверждения администратора."),
  };
}

export async function withdrawRegistration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  if (!tournament || tournament.is_private) return { error: t("Турнир не найден") };

  const ctx = await captainContext(t, `/tournaments/${tournament.slug}`, tournament);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;

  if (await isRateLimited(player.id, "registration.withdraw", 5)) return { error: t("Слишком часто — попробуйте через несколько секунд") };
  const reg = await getRegistration(tournament.id, team.id);
  if (!reg || (reg.status !== "pending" && reg.status !== "approved")) return { error: t("Активной заявки нет") };
  if (tournament.status !== "registration") {
    return { error: t("Регистрация закрыта — отозвать заявку можно только через администратора") };
  }

  const { error } = await db().rpc("change_registration", { p_registration: reg.id, p_actor: player.id, p_status: "withdrawn" });
  if (error) return { error: registrationError(error, t) };
  await audit(player.id, "registration.withdraw", { type: "tournament", id: tournament.id }, { team: team.tag });
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath("/team");
  return { success: t("Заявка отозвана") };
}

export async function checkIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  if (!tournament || tournament.is_private) return { error: t("Турнир не найден") };

  const ctx = await captainContext(t, `/tournaments/${tournament.slug}/checkin`, tournament);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;

  if (await isRateLimited(player.id, "registration.checkin", 3)) return { error: t("Слишком часто — попробуйте через несколько секунд") };
  if (tournament.status !== "checkin") return { error: t("Check-in сейчас не проводится") };
  const windowError = checkinWindowError(tournament);
  if (windowError) return { error: t(windowError) };
  const reg = await getRegistration(tournament.id, team.id);
  if (!reg || reg.status !== "approved") return { error: t("Заявка команды не одобрена") };
  if (reg.checked_in_at) return { success: t("Команда уже прошла check-in") };

  const mode = modeOf(tournament.format);
  const mains = reg.roster.filter((r) => r.role === "main");
  if (mains.length !== mode.size) return { error: t("В основе должно быть {players}, сейчас {n}", { players: mainPlayersLabel(mode.size, t), n: mains.length }) };
  const banned = reg.roster.find((r) => r.player.is_banned);
  if (banned) return { error: t("Игрок {name} заблокирован", { name: banned.player.nickname }) };
  const invalidSteam = reg.roster.find((r) => !/^\d{17}$/.test(r.player.steam_id));
  if (invalidSteam) return { error: t("У игрока {name} неверный SteamID", { name: invalidSteam.player.nickname }) };

  const { error } = await db().rpc("check_in_registration", { p_registration: reg.id, p_actor: player.id });
  if (error) return { error: registrationError(error, t) };
  await audit(player.id, "registration.checkin", { type: "tournament", id: tournament.id }, { team: team.tag });
  revalidatePath(`/tournaments/${tournament.slug}`, "layout");
  return { success: t("TEAM READY — команда прошла check-in") };
}
