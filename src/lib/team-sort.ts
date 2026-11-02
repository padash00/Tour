import type { TeamListItem } from "./data";

/** Сортировка списка команд по колонке: ?sort=elo&dir=desc. Без параметров — как в listTeams (игроки, затем ELO) */
export type TeamSortKey = "name" | "region" | "players" | "elo" | "created" | "captain";
export type SortDir = "asc" | "desc";

export function parseTeamSort(sp: Record<string, string | string[] | undefined>): { key: TeamSortKey | null; dir: SortDir } {
  const k = typeof sp.sort === "string" ? sp.sort : "";
  const key = (["name", "region", "players", "elo", "created", "captain"] as const).find((x) => x === k) ?? null;
  const dir: SortDir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : key === "name" || key === "region" || key === "captain" ? "asc" : "desc";
  return { key, dir };
}

export function sortTeams<T extends TeamListItem>(list: T[], key: TeamSortKey | null, dir: SortDir, captainName?: (t: T) => string): T[] {
  if (!key) return list;
  const s = dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, "ru", { sensitivity: "base" });
  const by: Record<TeamSortKey, (a: T, b: T) => number> = {
    name: (a, b) => text(a.name, b.name),
    region: (a, b) => text((a.region ?? "").trim(), (b.region ?? "").trim()),
    players: (a, b) => a.member_count - b.member_count,
    // команды без ELO — всегда в конце
    elo: (a, b) => (a.avg_elo == null ? (b.avg_elo == null ? 0 : 1 / s) : b.avg_elo == null ? -1 / s : a.avg_elo - b.avg_elo),
    created: (a, b) => a.created_at.localeCompare(b.created_at),
    captain: (a, b) => text(captainName?.(a) ?? "", captainName?.(b) ?? ""),
  };
  return [...list].sort((a, b) => s * by[key](a, b) || b.member_count - a.member_count);
}

/** Ссылка заголовка: тот же ключ — сменить направление, другой — его направление по умолчанию; прочие параметры сохраняются */
export function sortHref(base: string, params: Record<string, string>, key: TeamSortKey, cur: { key: TeamSortKey | null; dir: SortDir }) {
  const def: SortDir = key === "name" || key === "region" || key === "captain" ? "asc" : "desc";
  const dir: SortDir = cur.key === key ? (cur.dir === "asc" ? "desc" : "asc") : def;
  const q = new URLSearchParams({ ...params, sort: key, dir });
  return `${base}?${q.toString()}`;
}
