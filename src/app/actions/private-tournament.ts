"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requirePlayer } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { checkinWindowError, getTournamentById } from "@/lib/data";
import { getAccess } from "@/lib/private-tournament";
import { makePairs, pairName, swapPlayers, type PairMode, type PairPlan, type PairPlayer } from "@/lib/private-pairs";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import type { ActionResult } from "@/components/forms";

/*
 * Закрытый турнир 2×2: приглашения, ответ игрока, личный check-in, пары.
 * Порядок: приглашение → игрок принимает → check-in (статус турнира «check-in») → «Составить пары» в пульте →
 * обычная кнопка «Создать сетку» (посев — по жеребьёвке или по ELO пар) → автопилот, как в открытом турнире.
 */

function refresh(t: Pick<Tournament, "id" | "slug">) {
  revalidatePath(`/tournaments/${t.slug}`);
  revalidatePath(`/admin/tournaments/${t.id}`);
}

async function privateTournament(formData: FormData) {
  const t = await getTournamentById(String(formData.get("tournamentId") ?? ""));
  return t?.is_private ? t : null;
}

// ───────────────────────── пульт: приглашения

export async function invitePrivatePlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await privateTournament(formData);
  if (!t) return { error: "Закрытый турнир не найден" };
  if (["finished", "cancelled"].includes(t.status)) return { error: "Турнир уже завершён" };
  const steamId = String(formData.get("steamId") ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) return { error: "Выберите игрока из подсказок (ник или SteamID)" };
  const { data: p } = await db().from("players").select("id, nickname, is_banned").eq("steam_id", steamId).maybeSingle();
  if (!p) return { error: "Игрок с таким SteamID на сайте не зарегистрирован" };
  if (p.is_banned) return { error: `${p.nickname} заблокирован` };
  const cur = await getAccess(t.id, p.id);
  if (cur?.status === "accepted") return { success: `${p.nickname} уже участвует` };
  if (cur?.status === "invited") return { success: `${p.nickname} уже приглашён — ждём ответа` };
  const { error } = await db()
    .from("tournament_access")
    .upsert({ tournament_id: t.id, player_id: p.id, status: "invited", invited_by: admin.id, invited_at: new Date().toISOString(), decided_at: null, checked_in_at: null, is_reserve: false });
  if (error) return { error: "Не удалось пригласить" };
  await audit(admin.id, "private.invite", { type: "tournament", id: t.id }, { player: p.id });
  await notify([p.id], `Приглашение в закрытый турнир «${t.name}»`, "Турнир 2×2 только для приглашённых. Откройте страницу турнира и примите приглашение.", `/tournaments/${t.slug}`).catch(() => {});
  refresh(t);
  return { success: `${p.nickname} приглашён — уведомление ушло на сайт и в Telegram` };
}

export async function revokePrivatePlayer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await privateTournament(formData);
  if (!t) return { error: "Закрытый турнир не найден" };
  const playerId = String(formData.get("playerId") ?? "");
  if (await inPair(t.id, playerId)) return { error: "Игрок уже в паре — сначала пересоставьте пары без него (снимите check-in) или удалите сетку" };
  await db().from("tournament_access").delete().eq("tournament_id", t.id).eq("player_id", playerId);
  await audit(admin.id, "private.revoke", { type: "tournament", id: t.id }, { player: playerId });
  refresh(t);
  return { success: "Доступ закрыт" };
}

/** Пульт: отметить check-in за игрока (или снять). Заодно засчитывает приглашение принятым — игрок пришёл в клуб без телефона */
export async function adminPrivateCheckIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await privateTournament(formData);
  if (!t) return { error: "Закрытый турнир не найден" };
  const playerId = String(formData.get("playerId") ?? "");
  const undo = formData.get("undo") === "1";
  if (undo && (await inPair(t.id, playerId))) return { error: "Игрок уже в паре — снять check-in можно после пересоставления пар" };
  const now = new Date().toISOString();
  const { error } = await db()
    .from("tournament_access")
    .update(undo ? { checked_in_at: null, is_reserve: false } : { status: "accepted", decided_at: now, checked_in_at: now })
    .eq("tournament_id", t.id)
    .eq("player_id", playerId);
  if (error) return { error: "Не удалось сохранить" };
  await audit(admin.id, undo ? "private.checkin_undo" : "private.checkin_admin", { type: "tournament", id: t.id }, { player: playerId });
  refresh(t);
  return null;
}

// ───────────────────────── игрок: ответ на приглашение и check-in

export async function respondPrivateInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer();
  const t = await privateTournament(formData);
  if (!t) return { error: "Турнир не найден" };
  if (player.is_banned) return { error: "Ваш аккаунт заблокирован" };
  const cur = await getAccess(t.id, player.id);
  if (!cur || cur.status === "declined") return { error: "Приглашения нет" };
  const accept = formData.get("decision") === "accept";
  if (!accept && (await inPair(t.id, player.id))) return { error: "Пары уже составлены — чтобы отказаться, напишите организатору" };
  if (["finished", "cancelled", "live"].includes(t.status) && accept && cur.status !== "accepted") return { error: "Турнир уже идёт — приглашение больше не действует" };
  await db()
    .from("tournament_access")
    .update(accept ? { status: "accepted", decided_at: new Date().toISOString() } : { status: "declined", decided_at: new Date().toISOString(), checked_in_at: null, is_reserve: false })
    .eq("tournament_id", t.id)
    .eq("player_id", player.id);
  await audit(player.id, accept ? "private.accept" : "private.decline", { type: "tournament", id: t.id });
  refresh(t);
  return { success: accept ? "Вы в турнире! Перед стартом пройдите check-in на этой странице." : "Вы отказались от участия" };
}

export async function privateCheckIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const player = await requirePlayer();
  const t = await privateTournament(formData);
  if (!t) return { error: "Турнир не найден" };
  const cur = await getAccess(t.id, player.id);
  if (cur?.status !== "accepted") return { error: "Сначала примите приглашение" };
  if (cur.checked_in_at) return { success: "Вы уже отметились" };
  if (t.status !== "checkin") return { error: "Check-in сейчас не проводится" };
  const windowError = checkinWindowError(t);
  if (windowError) return { error: windowError };
  await db().from("tournament_access").update({ checked_in_at: new Date().toISOString() }).eq("tournament_id", t.id).eq("player_id", player.id);
  await audit(player.id, "private.checkin", { type: "tournament", id: t.id });
  refresh(t);
  return { success: "Отметились! Пары составит организатор после check-in." };
}

// ───────────────────────── пульт: пары

async function inPair(tournamentId: string, playerId: string) {
  const { data } = await db().from("tournament_roster_players").select("id").eq("tournament_id", tournamentId).eq("player_id", playerId).limit(1);
  return !!data?.length;
}

/** Прошедшие check-in (принявшие приглашение) — кандидаты в пары */
async function checkedInPlayers(tournamentId: string): Promise<PairPlayer[]> {
  const { data } = await db()
    .from("tournament_access")
    .select("player:players!tournament_access_player_id_fkey(id, nickname, faceit_elo, is_banned)")
    .eq("tournament_id", tournamentId)
    .eq("status", "accepted")
    .not("checked_in_at", "is", null);
  return (data ?? [])
    .map((r) => r.player)
    .filter((p) => p && !p.is_banned)
    .map((p) => ({ id: p.id, nickname: p.nickname, elo: p.faceit_elo }));
}

/** Текущие пары из базы (капитан первым) и запасные */
async function currentPlan(tournamentId: string): Promise<PairPlan> {
  const [{ data: teams }, { data: reserve }] = await Promise.all([
    db()
      .from("teams")
      .select("id, created_at, team_members(role, player:players(id, nickname, faceit_elo))")
      .eq("private_tournament_id", tournamentId)
      .order("created_at"),
    db()
      .from("tournament_access")
      .select("player:players!tournament_access_player_id_fkey(id, nickname, faceit_elo)")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", true),
  ]);
  const toP = (p: { id: string; nickname: string; faceit_elo: number | null }): PairPlayer => ({ id: p.id, nickname: p.nickname, elo: p.faceit_elo });
  const pairs = (teams ?? [])
    .map((tm) => [...tm.team_members].sort((a, b) => (a.role === "captain" ? -1 : b.role === "captain" ? 1 : 0)).map((m) => toP(m.player)))
    .filter((x): x is [PairPlayer, PairPlayer] => x.length === 2);
  return { pairs, reserve: (reserve ?? []).map((r) => toP(r.player)) };
}

async function savePlan(t: Tournament, actorId: string, plan: PairPlan) {
  const payload = plan.pairs.map((pair, i) => ({ name: pairName(pair), tag: `DUO${i + 1}`, players: pair.map((p) => p.id) }));
  const { data, error } = await db().rpc("create_private_pairs", {
    p_tournament: t.id,
    p_actor: actorId,
    p_pairs: payload,
    p_reserve: plan.reserve.map((p) => p.id),
  });
  if (error) {
    const m = error.message;
    if (m.includes("bracket_exists")) return { error: "Сетка уже создана — чтобы пересоставить пары, сначала удалите её во вкладке «Сетка»" };
    if (m.includes("player_not_checked_in")) return { error: "Кто-то из игроков не прошёл check-in — обновите страницу" };
    if (m.includes("tournament_full")) return { error: "Пар больше, чем мест в турнире — увеличьте «Команд максимум» в настройках" };
    return { error: `Не удалось сохранить пары: ${m}` };
  }
  return { n: data as number };
}

export async function buildPrivatePairs(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await privateTournament(formData);
  if (!t) return { error: "Закрытый турнир не найден" };
  if (t.bracket_published_at) return { error: "Сетка уже создана — чтобы пересоставить пары, сначала удалите её во вкладке «Сетка»" };
  const mode: PairMode = formData.get("mode") === "random" ? "random" : "elo";
  const players = await checkedInPlayers(t.id);
  if (players.length < 4) return { error: `Для двух пар нужно минимум 4 игрока с check-in (сейчас ${players.length})` };
  const plan = makePairs(players, mode);
  const saved = await savePlan(t, admin.id, plan);
  if ("error" in saved) return { error: saved.error };
  await audit(admin.id, "private.pairs", { type: "tournament", id: t.id }, {
    mode,
    pairs: plan.pairs.map((p) => p.map((x) => x.nickname).join(" + ")),
    reserve: plan.reserve.map((p) => p.nickname),
  });
  refresh(t);
  const extra = plan.reserve.length ? `, запасной: ${plan.reserve.map((p) => p.nickname).join(", ")}` : "";
  return { success: `Пар: ${saved.n}${extra}. Проверьте пары и создайте сетку во вкладке «Сетка».` };
}

export async function swapPrivatePlayers(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const t = await privateTournament(formData);
  if (!t) return { error: "Закрытый турнир не найден" };
  if (t.bracket_published_at) return { error: "Сетка уже создана — сначала удалите её во вкладке «Сетка»" };
  const a = String(formData.get("a") ?? "");
  const b = String(formData.get("b") ?? "");
  if (!a || !b || a === b) return { error: "Выберите двух разных игроков" };
  const plan = await currentPlan(t.id);
  const next = swapPlayers(plan, a, b);
  if (next === plan) return { error: "Игроки не найдены в парах" };
  const saved = await savePlan(t, admin.id, next);
  if ("error" in saved) return { error: saved.error };
  await audit(admin.id, "private.swap", { type: "tournament", id: t.id }, { a, b });
  refresh(t);
  return { success: "Поменяли местами" };
}
