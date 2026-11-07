import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import type { Player } from "./types";

// auth тянет next/navigation — грузим лениво, чтобы data.ts/matches.ts оставались доступны офлайн-тестам
const auth = () => import("./auth");

/**
 * Закрытый турнир: видят только админы и приглашённые (ещё не ответившие видят страницу с кнопкой «Принять»,
 * отказавшиеся — уже нет).
 * Для остальных его нет совсем — 404 на страницах, ни в списках, ни в статистике, ни в боте.
 * Сайт читает базу служебным ключом (RLS не действует), поэтому каждое публичное чтение фильтрует сам код:
 * - списки и сводная статистика — только открытые турниры (`is_private = false`, `privateMatchIds`);
 * - страницы турнира и матча — `canViewTournament` (через getTournamentBySlug / getVisibleMatch).
 */

export type AccessStatus = "invited" | "accepted" | "declined";
export type AccessRow = {
  tournament_id: string;
  player_id: string;
  status: AccessStatus;
  checked_in_at: string | null;
  is_reserve: boolean;
  invited_at: string;
  decided_at: string | null;
};

type Lite = { id: string; is_private?: boolean | null };

/** id всех закрытых турниров — для фильтров там, где турнир не подтянут в запрос */
export const privateTournamentIds = cache(async (): Promise<string[]> => {
  const { data } = await db().from("tournaments").select("id").eq("is_private", true);
  return (data ?? []).map((t) => t.id);
});

/** id закрытых матчей (матчи закрытых турниров) — для фильтров по match_id */
export const privateMatchIds = cache(async (): Promise<Set<string>> => {
  const ids = await privateTournamentIds();
  if (!ids.length) return new Set();
  const { data } = await db().from("matches").select("id").in("tournament_id", ids);
  return new Set((data ?? []).map((m) => m.id));
});

export const getAccess = cache(async (tournamentId: string, playerId: string): Promise<AccessRow | null> => {
  const { data } = await db().from("tournament_access").select("*").eq("tournament_id", tournamentId).eq("player_id", playerId).maybeSingle();
  return (data as AccessRow | null) ?? null;
});

/** Может ли игрок (по умолчанию — текущий) видеть турнир */
export async function canViewTournament(t: Lite, player?: Player | null): Promise<boolean> {
  if (!t.is_private) return true;
  const { getCurrentPlayer, isAdmin } = await auth();
  const p = player === undefined ? await getCurrentPlayer() : player;
  if (!p) return false;
  if (isAdmin(p)) return true;
  if (p.is_banned) return false;
  const a = await getAccess(t.id, p.id);
  return a?.status === "accepted" || a?.status === "invited";
}

/** Игроки, которым турнир виден (принявшие приглашение) — получатели уведомлений вместо общего чата */
export async function acceptedPlayerIds(tournamentId: string): Promise<string[]> {
  const { data } = await db().from("tournament_access").select("player_id").eq("tournament_id", tournamentId).eq("status", "accepted");
  return (data ?? []).map((r) => r.player_id);
}

export async function isPrivateTournament(tournamentId: string | null | undefined): Promise<boolean> {
  if (!tournamentId) return false;
  return (await privateTournamentIds()).includes(tournamentId);
}

export async function isPrivateMatch(matchId: string | null | undefined): Promise<boolean> {
  if (!matchId) return false;
  return (await privateMatchIds()).has(matchId);
}

/** Матч по id виден игроку? (разборы демок, служебные ссылки) — матч закрытого турнира только допущенным */
export async function canViewMatchId(matchId: string | null | undefined, player?: Player | null): Promise<boolean> {
  if (!matchId || !(await isPrivateMatch(matchId))) return true;
  const { data } = await db().from("matches").select("tournament:tournaments(id, is_private)").eq("id", matchId).maybeSingle();
  return !data?.tournament || canViewTournament(data.tournament, player);
}
