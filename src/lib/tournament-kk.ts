import { makeT, tr, type Lang } from "./i18n/core";
import type { PrizeRow } from "./types";

/**
 * Казахская версия текстов турнира. Свободный текст (описание, требования, регламент, призы) админ пишет
 * в пульте в блоке «Қазақша» — колонка tournaments.kk; чего там нет — показывается по-русски.
 * Значения, которые подставляет сам пульт («Бесплатно», «1 место», «BO1, финал — BO3»), переводятся здесь.
 * Только для страниц игроков: пульт и отчёты работают с русскими полями.
 */
export type TournamentKk = {
  description?: string;
  requirements?: string;
  rules?: string;
  prize_pool?: string;
  /** призы по местам — в том же порядке, что prize_distribution */
  prizes?: string[];
};

/** jsonb из базы → TournamentKk (чужие ключи и типы отбрасываются) */
export function readKk(v: unknown): TournamentKk {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const s = (k: keyof TournamentKk) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string) : undefined);
  return {
    description: s("description"),
    requirements: s("requirements"),
    rules: s("rules"),
    prize_pool: s("prize_pool"),
    prizes: Array.isArray(o.prizes) ? o.prizes.map((p) => (typeof p === "string" ? p : "")) : undefined,
  };
}

// подставляет пульт или часто пишут вручную — переводятся по словарю
const STOCK = new Set<string>([tr("Бесплатно"), tr("Ценные подарки")]);

/** «1 место» → «1-орын», «III место» → «III орын» */
const placeKk = (p: string) =>
  p.replace(/^\s*(\d+)(?:-?е)?\s+место\s*$/i, "$1-орын").replace(/^\s*([IVX]+)\s+место\s*$/, "$1 орын");

type Localizable = {
  kk?: unknown;
  description?: string | null;
  requirements?: string | null;
  rules?: string | null;
  prize_pool?: string | null;
  entry_fee?: string | null;
  match_format?: string | null;
  prize_distribution?: PrizeRow[];
};

/** Турнир для показа на языке страницы: по-казахски — подставляет тексты из tournaments.kk и переводит стандартные значения */
export function tournamentForLang<T extends Localizable>(t: T, lang: Lang): T {
  if (lang !== "kk") return t;
  const kk = readKk(t.kk);
  const tx = makeT("kk");
  const stock = (s: string | null | undefined) => (s && STOCK.has(s.trim()) ? tx(s.trim()) : s);
  const out: Localizable = { ...t };
  if (t.description !== undefined) out.description = kk.description ?? t.description;
  if (t.requirements !== undefined) out.requirements = kk.requirements ?? t.requirements;
  if (t.rules !== undefined) out.rules = kk.rules ?? t.rules;
  if (t.prize_pool !== undefined) out.prize_pool = kk.prize_pool ?? stock(t.prize_pool);
  if (t.entry_fee !== undefined) out.entry_fee = stock(t.entry_fee);
  if (t.match_format) out.match_format = t.match_format.replace("финальная стадия", "финалдық кезең");
  if (t.prize_distribution) {
    out.prize_distribution = t.prize_distribution.map((p, i) => ({ place: placeKk(p.place), prize: kk.prizes?.[i]?.trim() || stock(p.prize) || "" }));
  }
  return out as T;
}
