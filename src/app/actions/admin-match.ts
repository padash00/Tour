"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { getTournamentById, getTournamentRegistrations } from "@/lib/data";
import { formatDateTime, fromLocalInput } from "@/lib/format";
import { createBracket, getMatch, recomputeSeries, syncBracket } from "@/lib/matches";
import { enqueueCommand } from "@/lib/server-control";
import { db } from "@/lib/supabase";
import { VETO_STEP_SECONDS } from "@/lib/veto";
import type { ActionResult } from "@/components/forms";

function revalidateMatch(matchId: string, tournamentSlug?: string) {
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath("/admin/matches");
  if (tournamentSlug) revalidatePath(`/tournaments/${tournamentSlug}`);
}

// ───────────────────────── сетка

export async function generateBracketAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId"));
  const onlyCheckedIn = formData.get("onlyCheckedIn") === "on";
  const seeding = String(formData.get("seeding") ?? "elo");

  const t = await getTournamentById(tournamentId);
  if (!t) return { error: "Турнир не найден" };
  if (t.bracket_published_at) return { error: "Сетка уже создана. Сначала удалите её." };

  const regs = (await getTournamentRegistrations(t.id)).filter(
    (r) => r.status === "approved" && (!onlyCheckedIn || r.checked_in_at),
  );
  if (regs.length < 2) return { error: `Недостаточно участников: ${regs.length}` };
  if ((t.bracket_type === "swiss" || t.bracket_type === "swiss_playoff") && regs.length % 2) {
    return { error: `Швейцарская система требует чётного числа участников (сейчас ${regs.length})` };
  }
  if (regs.length > t.max_teams) return { error: `Команд больше лимита (${regs.length} > ${t.max_teams})` };

  const avgElo = (r: (typeof regs)[number]) => {
    const elos = r.roster.filter((p) => p.role === "main").map((p) => p.player.faceit_elo ?? 0);
    return elos.length ? elos.reduce((a, b) => a + b, 0) / elos.length : 0;
  };
  const shuffled = [...regs].sort(() => Math.random() - 0.5);
  const ordered =
    seeding === "random"
      ? shuffled
      : shuffled.sort((a, b) => {
          // ручной seed админа — в приоритете, остальные по среднему FACEIT ELO
          if (a.seed != null && b.seed != null) return a.seed - b.seed;
          if (a.seed != null) return -1;
          if (b.seed != null) return 1;
          return avgElo(b) - avgElo(a);
        });

  for (const [i, r] of ordered.entries()) {
    await db().from("tournament_registrations").update({ seed: i + 1 }).eq("id", r.id);
  }
  try {
    await createBracket(t, ordered.map((r) => r.team_id));
  } catch (e) {
    return { error: `Не удалось создать сетку: ${(e as Error).message}` };
  }
  await audit(admin.id, "bracket.generate", { type: "tournament", id: t.id }, { teams: ordered.length, seeding, onlyCheckedIn });
  revalidatePath(`/admin/tournaments/${t.id}`);
  revalidatePath(`/tournaments/${t.slug}`);
  return { success: `Сетка создана: ${ordered.length} команд` };
}

export async function deleteBracketAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId"));
  const t = await getTournamentById(tournamentId);
  if (!t) return { error: "Турнир не найден" };

  const { count } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", t.id)
    .in("status", ["veto", "ready", "live"]);
  const { count: played } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", t.id)
    .eq("status", "finished")
    .eq("is_walkover", false);
  if ((count ?? 0) > 0 || (played ?? 0) > 0) {
    return { error: "В сетке уже есть начатые или сыгранные матчи — удалить нельзя" };
  }

  await db().from("matches").update({ winner_to_match: null, loser_to_match: null }).eq("tournament_id", t.id);
  await db().from("matches").delete().eq("tournament_id", t.id);
  await db().from("tournaments").update({ bracket_published_at: null, playoff_created_at: null }).eq("id", t.id);
  await audit(admin.id, "bracket.delete", { type: "tournament", id: t.id });
  revalidatePath(`/admin/tournaments/${t.id}`);
  revalidatePath(`/tournaments/${t.slug}`);
  return { success: "Сетка удалена" };
}

// ───────────────────────── матч

async function loadForAdmin(formData: FormData) {
  const admin = await requireAdmin();
  const m = await getMatch(String(formData.get("matchId")));
  return { admin, m };
}

export async function setBestOf(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  const bo = Number(formData.get("bestOf"));
  if (![1, 3, 5].includes(bo)) return { error: "BO1, BO3 или BO5" };
  if (!["pending", "upcoming"].includes(m.status)) return { error: "Формат меняется только до начала вето" };
  await db().from("matches").update({ best_of: bo }).eq("id", m.id);
  await audit(admin.id, "match.best_of", { type: "match", id: m.id }, { bo });
  revalidateMatch(m.id, m.tournament.slug);
  return null;
}

export async function startVeto(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "upcoming") return { error: "Вето можно начать, когда обе команды известны" };
  if (m.tournament.map_pool.length < m.best_of) return { error: "Маппул меньше числа карт серии" };

  await db()
    .from("matches")
    .update({ status: "veto", veto_deadline: new Date(Date.now() + VETO_STEP_SECONDS * 1000).toISOString() })
    .eq("id", m.id);
  const captains = [m.team1?.captain_id, m.team2?.captain_id].filter(Boolean) as string[];
  await notify(captains, `Вето матча #${m.number} началось`, `На каждый шаг — ${VETO_STEP_SECONDS} секунд.`, `/matches/${m.id}`);
  await audit(admin.id, "match.veto_start", { type: "match", id: m.id });
  revalidateMatch(m.id, m.tournament.slug);
  return null;
}

export async function resetVeto(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (!["veto", "ready"].includes(m.status)) return { error: "Сбросить вето можно до старта матча" };
  await db().from("veto_actions").delete().eq("match_id", m.id);
  await db().from("match_maps").delete().eq("match_id", m.id);
  await db().from("matches").update({ status: "upcoming", veto_deadline: null }).eq("id", m.id);
  await audit(admin.id, "match.veto_reset", { type: "match", id: m.id });
  revalidateMatch(m.id, m.tournament.slug);
  return { success: "Вето сброшено" };
}

export async function setServerInfo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  const address = String(formData.get("address") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "").trim() || null;
  if (address && !/^[\w.-]+:\d{2,5}$/.test(address)) return { error: "Адрес в формате ip:port" };
  await db().from("matches").update({ server_address: address, server_password: password }).eq("id", m.id);
  await audit(admin.id, "match.server", { type: "match", id: m.id }, { address });
  revalidateMatch(m.id, m.tournament.slug);
  return { success: "Сервер сохранён" };
}

export async function setMatchLive(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "ready") return { error: "Сначала завершите вето" };
  await db().from("matches").update({ status: "live", started_at: new Date().toISOString() }).eq("id", m.id);
  const firstPending = m.maps.find((x) => x.status === "pending");
  if (firstPending) await db().from("match_maps").update({ status: "live" }).eq("id", firstPending.id);
  await audit(admin.id, "match.live", { type: "match", id: m.id });
  revalidateMatch(m.id, m.tournament.slug);
  return null;
}

export async function saveMapScore(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "live") return { error: "Матч не в статусе LIVE" };
  const mapId = String(formData.get("mapId"));
  const map = m.maps.find((x) => x.id === mapId);
  if (!map) return { error: "Карта не найдена" };

  const s1 = Number(formData.get("score1"));
  const s2 = Number(formData.get("score2"));
  if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0 || s1 > 99 || s2 > 99) {
    return { error: "Счёт — целые числа от 0 до 99" };
  }
  const finish = formData.get("finish") === "1";
  if (finish && s1 === s2) return { error: "Карта не может закончиться ничьей" };

  await db()
    .from("match_maps")
    .update({
      team1_score: s1,
      team2_score: s2,
      status: finish ? "finished" : "live",
      winner_id: finish ? (s1 > s2 ? m.team1_id : m.team2_id) : null,
    })
    .eq("id", map.id);

  if (finish) {
    const next = m.maps.find((x) => x.map_number > map.map_number && x.status === "pending");
    if (next) await db().from("match_maps").update({ status: "live" }).eq("id", next.id);
    await recomputeSeries(m.id);
  }
  await audit(admin.id, finish ? "match.map_finish" : "match.map_score", { type: "match", id: m.id }, { map: map.map_name, s1, s2 });
  revalidateMatch(m.id, m.tournament.slug);
  return null;
}

export async function forceResult(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (!m.team1_id || !m.team2_id) return { error: "Обе команды должны быть известны" };
  if (m.status === "finished") return { error: "Матч уже завершён" };
  const winnerSlot = String(formData.get("winner"));
  const winner = winnerSlot === "1" ? m.team1_id : winnerSlot === "2" ? m.team2_id : null;
  if (!winner) return { error: "Выберите победителя" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Укажите причину — она попадёт в журнал" };

  await db()
    .from("matches")
    .update({
      status: "finished",
      winner_id: winner,
      is_walkover: true,
      finished_at: new Date().toISOString(),
      veto_deadline: null,
    })
    .eq("id", m.id);
  await syncBracket(m.tournament_id);
  await audit(admin.id, "match.force_result", { type: "match", id: m.id }, { winner, reason });
  revalidateMatch(m.id, m.tournament.slug);
  return { success: "Результат зафиксирован" };
}

/** Отмена результата — только пока следующие матчи не начались */
export async function reopenMatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "finished" || !m.team1_id || !m.team2_id) return { error: "Можно отменить только сыгранный матч" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Укажите причину — она попадёт в журнал" };

  const nextIds = [m.winner_to_match, m.loser_to_match].filter(Boolean) as string[];
  const { data: next } = await db().from("matches").select("id, status").in("id", nextIds.length ? nextIds : ["00000000-0000-0000-0000-000000000000"]);
  if ((next ?? []).some((n) => !["pending", "upcoming"].includes(n.status))) {
    return { error: "Следующий матч уже начался — отменить результат нельзя" };
  }
  const clear = async (id: string | null, slot: number | null) => {
    if (!id || !slot) return;
    await db()
      .from("matches")
      .update({ [slot === 1 ? "team1_id" : "team2_id"]: null, status: "pending" })
      .eq("id", id);
  };
  await clear(m.winner_to_match, m.winner_to_slot);
  await clear(m.loser_to_match, m.loser_to_slot);
  await db()
    .from("matches")
    .update({ status: m.maps.length ? "live" : "upcoming", winner_id: null, is_walkover: false, finished_at: null, team1_score: 0, team2_score: 0 })
    .eq("id", m.id);
  await db().from("match_maps").update({ status: "pending", winner_id: null }).eq("match_id", m.id).neq("status", "pending");
  if (m.maps[0]) await db().from("match_maps").update({ status: "live" }).eq("id", m.maps[0].id);
  await audit(admin.id, "match.reopen", { type: "match", id: m.id }, { reason, previous_winner: m.winner_id });
  await syncBracket(m.tournament_id);
  revalidateMatch(m.id, m.tournament.slug);
  return { success: "Результат отменён" };
}

export async function setSchedule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  const raw = String(formData.get("scheduledAt") ?? "");
  const scheduledAt = raw ? fromLocalInput(raw) : null;
  await db().from("matches").update({ scheduled_at: scheduledAt }).eq("id", m.id);
  if (scheduledAt && m.team1 && m.team2) {
    await notify(
      [m.team1.captain_id, m.team2.captain_id],
      `Матч #${m.number}: ${m.team1.name} vs ${m.team2.name}`,
      `Время матча: ${formatDateTime(scheduledAt)}`,
      `/matches/${m.id}`,
    );
  }
  await audit(admin.id, "match.schedule", { type: "match", id: m.id }, { scheduled_at: scheduledAt });
  revalidateMatch(m.id, m.tournament.slug);
  revalidatePath("/");
  return { success: scheduledAt ? "Время сохранено, капитаны уведомлены" : "Время убрано" };
}

/** Замена игрока в турнирном составе прямо по ходу турнира; если матч на сервере — сразу и в MatchZy */
export async function replaceRosterPlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { admin, m } = await loadForAdmin(formData);
  if (!m) return { error: "Матч не найден" };
  const outId = String(formData.get("outPlayerId"));
  const inSteam = String(formData.get("inSteamId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^\d{17}$/.test(inSteam)) return { error: "SteamID64 нового игрока — 17 цифр" };
  if (!reason) return { error: "Укажите причину замены" };

  const { data: outRow } = await db()
    .from("tournament_roster_players")
    .select("*, registration:tournament_registrations!inner(team_id), player:players(steam_id, nickname)")
    .eq("tournament_id", m.tournament_id)
    .eq("player_id", outId)
    .maybeSingle();
  if (!outRow) return { error: "Игрок не найден в составе" };
  const teamId = outRow.registration.team_id as string;
  if (teamId !== m.team1_id && teamId !== m.team2_id) return { error: "Игрок не из этого матча" };

  const { data: inPlayer } = await db().from("players").select("id, nickname, steam_id, is_banned").eq("steam_id", inSteam).maybeSingle();
  if (!inPlayer) return { error: "Новый игрок ещё не входил на платформу через Steam" };
  if (inPlayer.is_banned) return { error: "Новый игрок заблокирован" };

  const { error } = await db()
    .from("tournament_roster_players")
    .insert({ registration_id: outRow.registration_id, tournament_id: m.tournament_id, player_id: inPlayer.id, role: outRow.role });
  if (error) return { error: "Новый игрок уже заявлен на этот турнир" };
  await db().from("tournament_roster_players").delete().eq("id", outRow.id);
  await db().from("roster_changes").insert({
    tournament_id: m.tournament_id,
    team_id: teamId,
    match_id: m.id,
    player_out: outId,
    player_in: inPlayer.id,
    reason,
    changed_by: admin.id,
  });

  // матч уже загружен в MatchZy — меняем игрока и там
  let onServer = "";
  if (m.server_instance && ["ready", "live"].includes(m.status)) {
    const side = teamId === m.team1_id ? "team1" : "team2";
    const nick = inPlayer.nickname.replace(/"/g, "");
    await enqueueCommand(m.server_instance, "rcon", { command: `matchzy_removeplayer ${outRow.player.steam_id}` }, admin.id);
    await enqueueCommand(m.server_instance, "rcon", { command: `matchzy_addplayer ${inSteam} ${side} "${nick}"` }, admin.id);
    onServer = ` и на сервере ${m.server_instance}`;
  }
  await audit(admin.id, "roster.replace", { type: "match", id: m.id }, { out: outRow.player.steam_id, in: inSteam, reason });
  revalidateMatch(m.id, m.tournament.slug);
  return { success: `${outRow.player.nickname} → ${inPlayer.nickname}: замена в составе${onServer}` };
}
