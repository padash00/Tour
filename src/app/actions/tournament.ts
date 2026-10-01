"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import {
  MAX_MAIN,
  getActiveMembership,
  getRegistration,
  getTeamMembers,
  getTournamentById,
  writeRoster,
} from "@/lib/data";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

async function captainContext(next: string) {
  const player = await requirePlayer(next);
  const membership = await getActiveMembership(player.id);
  if (!membership) return { error: "Сначала создайте команду или вступите в неё" } as const;
  if (membership.team.captain_id !== player.id) return { error: "Это может сделать только капитан" } as const;
  return { player, team: membership.team } as const;
}

export async function registerTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  if (!tournament || tournament.status === "draft") return { error: "Турнир не найден" };

  const ctx = await captainContext(`/tournaments/${tournament.slug}/register`);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;

  if (tournament.status !== "registration") return { error: "Регистрация на турнир закрыта" };

  const members = await getTeamMembers(team.id);
  const mains = members.filter((m) => m.role !== "substitute");
  if (mains.length < MAX_MAIN) {
    return { error: `Нужно минимум ${MAX_MAIN} основных игроков. Сейчас: ${mains.length}.` };
  }
  const banned = members.find((m) => m.player.is_banned);
  if (banned) return { error: `Игрок ${banned.player.nickname} заблокирован на платформе` };

  const existing = await getRegistration(tournament.id, team.id);
  if (existing && (existing.status === "pending" || existing.status === "approved")) {
    return { error: "Команда уже подала заявку" };
  }

  let registrationId: string;
  if (existing) {
    await db()
      .from("tournament_registrations")
      .update({ status: "pending", note: null, decided_by: null, decided_at: null, checked_in_at: null, seed: null })
      .eq("id", existing.id);
    registrationId = existing.id;
  } else {
    const { data, error } = await db()
      .from("tournament_registrations")
      .insert({ tournament_id: tournament.id, team_id: team.id })
      .select("id")
      .single();
    if (error || !data) return { error: "Не удалось подать заявку" };
    registrationId = data.id;
  }

  const rosterError = await writeRoster(registrationId, tournament.id, members);
  if (rosterError) {
    await db().from("tournament_registrations").update({ status: "withdrawn" }).eq("id", registrationId);
    await db().from("tournament_roster_players").delete().eq("registration_id", registrationId);
    return { error: "Кто-то из игроков уже заявлен на этот турнир в составе другой команды" };
  }

  await notify(
    members.filter((m) => m.player_id !== player.id).map((m) => m.player_id),
    `${team.name} подала заявку на «${tournament.name}»`,
    "Заявка ожидает подтверждения администратора.",
    `/tournaments/${tournament.slug}`,
  );
  await audit(player.id, "registration.create", { type: "tournament", id: tournament.id }, { team: team.tag });
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath("/team");
  return { success: "Заявка подана. Ожидайте подтверждения администратора." };
}

export async function withdrawRegistration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return { error: "Турнир не найден" };

  const ctx = await captainContext(`/tournaments/${tournament.slug}`);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;

  const reg = await getRegistration(tournament.id, team.id);
  if (!reg || (reg.status !== "pending" && reg.status !== "approved")) return { error: "Активной заявки нет" };
  if (tournament.status !== "registration") {
    return { error: "Регистрация закрыта — отозвать заявку можно только через администратора" };
  }

  await db().from("tournament_registrations").update({ status: "withdrawn", checked_in_at: null }).eq("id", reg.id);
  await db().from("tournament_roster_players").delete().eq("registration_id", reg.id);
  await audit(player.id, "registration.withdraw", { type: "tournament", id: tournament.id }, { team: team.tag });
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath("/team");
  return { success: "Заявка отозвана" };
}

export async function checkIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const tournamentId = String(formData.get("tournamentId"));
  const tournament = await getTournamentById(tournamentId);
  if (!tournament) return { error: "Турнир не найден" };

  const ctx = await captainContext(`/tournaments/${tournament.slug}/checkin`);
  if ("error" in ctx) return { error: ctx.error };
  const { player, team } = ctx;

  if (tournament.status !== "checkin") return { error: "Check-in сейчас не проводится" };
  const reg = await getRegistration(tournament.id, team.id);
  if (!reg || reg.status !== "approved") return { error: "Заявка команды не одобрена" };
  if (reg.checked_in_at) return { success: "Команда уже прошла check-in" };

  const mains = reg.roster.filter((r) => r.role === "main");
  if (mains.length < MAX_MAIN) return { error: `В составе меньше ${MAX_MAIN} основных игроков` };
  const banned = reg.roster.find((r) => r.player.is_banned);
  if (banned) return { error: `Игрок ${banned.player.nickname} заблокирован` };

  await db()
    .from("tournament_registrations")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: player.id })
    .eq("id", reg.id);
  await audit(player.id, "registration.checkin", { type: "tournament", id: tournament.id }, { team: team.tag });
  revalidatePath(`/tournaments/${tournament.slug}`, "layout");
  return { success: "TEAM READY — команда прошла check-in" };
}
