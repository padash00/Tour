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
  // ссылка на файл разбора на час — браузер качает его прямо из хранилища (без предела размера Vercel)
  const { data: signed, error } = await db().storage.from(ANALYSIS_BUCKET).createSignedUrl(card.storage_path, 3600);
  if (error || !signed?.signedUrl) return null;
  return { card, url: signed.signedUrl };
}
