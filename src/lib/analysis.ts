import "server-only";
import { privateMatchIds } from "./private-tournament";
import { db } from "./supabase";
import { isAdmin } from "./auth";
import type { Player } from "./types";

/*
 * Разбор демок. Сам разбор (позиции, убийства, гранаты, экономика) — gzip-JSON в закрытом хранилище «analyses»;
 * в таблице demo_analyses — карточка для списка. Страница «Разбор» пока только для админов.
 */

export const ANALYSIS_BUCKET = "analyses";

export type AnalysisCard = {
  id: string;
  kind: "pro" | "match";
  match_id: string | null;
  map_number: number | null;
  map: string;
  title: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  rounds: number;
  players: { name: string; steamid: string | null; team: string | null }[];
  source: string | null;
  size_bytes: number | null;
  created_at: string;
};

export async function listAnalyses(): Promise<AnalysisCard[]> {
  const { data, error } = await db().from("demo_analyses").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error("Не удалось загрузить разборы", { cause: error });
  // карты закрытых турниров в общий список не попадают
  const hidden = await privateMatchIds();
  return ((data ?? []) as unknown as AnalysisCard[]).filter((a) => !a.match_id || !hidden.has(a.match_id));
}

export async function getAnalysis(id: string): Promise<{ card: AnalysisCard; url: string } | null> {
  const { data } = await db().from("demo_analyses").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const card = data as unknown as AnalysisCard & { storage_path: string };
  // файл отдаёт сам сайт (только админам): свой сервер Supabase не пускает браузер в хранилище без ключа
  return { card, url: `/api/analysis/${card.id}` };
}

/** Файл разбора (gzip) из закрытого хранилища */
export async function analysisFile(id: string): Promise<Blob | null> {
  const { data } = await db().from("demo_analyses").select("storage_path").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: file, error } = await db().storage.from(ANALYSIS_BUCKET).download(data.storage_path);
  return error ? null : file;
}

/** Библиотека топов по карте (раскидки и т. д.), собирается server/analyzer/learn.mjs */
export async function knowledgeFile(map: string): Promise<Blob | null> {
  const { data, error } = await db().storage.from(ANALYSIS_BUCKET).download(`knowledge/${map}.json.gz`);
  return error ? null : data;
}

/** Карты, по которым уже собрана библиотека топов */
export async function knowledgeMaps(): Promise<string[]> {
  const { data } = await db().storage.from(ANALYSIS_BUCKET).list("knowledge", { limit: 100 });
  return (data ?? []).map((f) => f.name.replace(/\.json\.gz$/, "")).filter((m) => /^[a-z0-9_]+$/.test(m)).sort();
}

/** Разбор игрока против топов (server/analyzer/coach.mjs) */
export async function coachFile(analysisId: string, steamid: string): Promise<Blob | null> {
  const { data, error } = await db().storage.from(ANALYSIS_BUCKET).download(`coach/${analysisId}-${steamid}.json.gz`);
  return error ? null : data;
}

/** Для каких игроков этого разбора уже есть разбор игрока (steamid) */
export async function coachPlayers(analysisId: string): Promise<string[]> {
  const { data } = await db().storage.from(ANALYSIS_BUCKET).list("coach", { limit: 100, search: analysisId });
  return (data ?? []).map((f) => f.name.match(/-(\d{17})\.json\.gz$/)?.[1]).filter((x): x is string => !!x);
}

/*
 * Доступ к разбору демок:
 * — повтор карты матча клуба (kind = match, привязан к матчу) и демки про — всем;
 * — демка, загруженная вручную (без матча клуба, например FACEIT), — её участникам и админам;
 * — разбор игрока против топов и ИИ-тренер — самому игроку и админам.
 */
export function canViewAnalysis(card: Pick<AnalysisCard, "kind" | "match_id" | "players">, viewer: Player | null) {
  if (card.kind === "pro" || card.match_id) return true;
  if (isAdmin(viewer)) return true;
  return !!viewer && card.players.some((p) => p.steamid === viewer.steam_id);
}

export function canViewCoach(steamid: string, viewer: Player | null) {
  return isAdmin(viewer) || (!!viewer && viewer.steam_id === steamid);
}

export async function analysisCard(id: string): Promise<AnalysisCard | null> {
  const { data } = await db().from("demo_analyses").select("*").eq("id", id).maybeSingle();
  return (data as unknown as AnalysisCard | null) ?? null;
}

/** Разборы, где играл этот игрок (по steamid), новые сверху */
export async function analysesOfPlayer(steamid: string): Promise<AnalysisCard[]> {
  const { data } = await db().from("demo_analyses").select("*").eq("kind", "match").contains("players", [{ steamid }]).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as unknown as AnalysisCard[];
}

/** Разборы карт матча клуба (по номеру карты) */
export async function analysesOfMatch(matchId: string): Promise<Pick<AnalysisCard, "id" | "map_number">[]> {
  const { data } = await db().from("demo_analyses").select("id, map_number").eq("match_id", matchId);
  return (data ?? []) as Pick<AnalysisCard, "id" | "map_number">[];
}
