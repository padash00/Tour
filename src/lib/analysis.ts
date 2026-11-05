import "server-only";
import { db } from "./supabase";

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
  return (data ?? []) as unknown as AnalysisCard[];
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
