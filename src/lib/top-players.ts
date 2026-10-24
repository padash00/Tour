import "server-only";
import { db } from "./supabase";
import { getPlayerLeaderboard, getPlayerLeaderboardForMatches, type LeaderboardRow } from "./stats";
import type { Tournament } from "./types";

/**
 * Данные для картинки «ТОП-5 лучших игроков»: рейтинг F16 по всему турниру или по матчам одного дня.
 * Дни считаем по Asia/Almaty (UTC+5, без перехода на летнее время).
 */
const ALMATY_OFFSET_MS = 5 * 3600 * 1000;
const MONTHS = ["ЯНВАРЯ", "ФЕВРАЛЯ", "МАРТА", "АПРЕЛЯ", "МАЯ", "ИЮНЯ", "ИЮЛЯ", "АВГУСТА", "СЕНТЯБРЯ", "ОКТЯБРЯ", "НОЯБРЯ", "ДЕКАБРЯ"];

/** YYYY-MM-DD по времени Алматы */
export const almatyDay = (iso: string) => new Date(new Date(iso).getTime() + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
export const isDayKey = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type TournamentDay = { day: string; n: number; matches: number; label: string };

async function finishedMatches(tournamentId: string) {
  const { data } = await db().from("matches").select("id, finished_at").eq("tournament_id", tournamentId).eq("status", "finished").not("finished_at", "is", null);
  return (data ?? []) as { id: string; finished_at: string }[];
}

/** Дни, в которые завершались матчи: «День 1 · 24.10», … */
export async function getTournamentDays(tournamentId: string): Promise<TournamentDay[]> {
  const byDay = new Map<string, number>();
  for (const m of await finishedMatches(tournamentId)) {
    const d = almatyDay(m.finished_at);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, matches], i) => ({ day, n: i + 1, matches, label: `День ${i + 1} · ${day.slice(8, 10)}.${day.slice(5, 7)}` }));
}

export type TopPlayers = { players: LeaderboardRow[]; subtitle: string };

/** Порог как у лидеров на вкладке статистики: не меньше половины раундов самого игравшего (но не больше 30) */
export function eligibleForTop(board: LeaderboardRow[]) {
  const maxRounds = Math.max(0, ...board.map((r) => r.rounds));
  const min = Math.min(30, Math.ceil(maxRounds / 2));
  return board.filter((r) => r.rounds > 0 && r.rounds >= min);
}

/** Пять лучших по F16 Rating; null — статистики нет (или за выбранный день нет матчей) */
export async function getTopPlayers(t: Tournament, day?: string | null): Promise<TopPlayers | null> {
  let board: LeaderboardRow[];
  let subtitle: string;
  if (day) {
    const days = await getTournamentDays(t.id);
    const d = days.find((x) => x.day === day);
    if (!d) return null;
    const ids = (await finishedMatches(t.id)).filter((m) => almatyDay(m.finished_at) === day).map((m) => m.id);
    board = await getPlayerLeaderboardForMatches(t.id, ids);
    subtitle = days.length > 1 ? `ПО ИТОГАМ ${d.n}-ГО ДНЯ · ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}` : `ПО ИТОГАМ ДНЯ · ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  } else {
    board = await getPlayerLeaderboard(t.id);
    if (t.status === "finished") subtitle = "ПО ИТОГАМ ТУРНИРА";
    else {
      const n = (await finishedMatches(t.id)).length;
      subtitle = `ТУРНИР ИДЁТ · ПОСЛЕ ${n} ${n % 10 === 1 && n % 100 !== 11 ? "МАТЧА" : "МАТЧЕЙ"}`;
    }
  }
  const players = eligibleForTop(board).slice(0, 5);
  return players.length ? { players, subtitle } : null;
}
