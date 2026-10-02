import "server-only";
import { db } from "./supabase";
import type { Player, Team } from "./types";

/** Поиск команды и игроков: объявления «ищу команду» (игрок) и «ищем игрока» (капитан команды) */

export const FINDER_ROLES = [
  { key: "entry", label: "Entry" },
  { key: "awp", label: "AWP" },
  { key: "support", label: "Support" },
  { key: "lurk", label: "Lurker" },
  { key: "igl", label: "IGL" },
  { key: "any", label: "Любая" },
] as const;
export type FinderRole = (typeof FINDER_ROLES)[number]["key"];
export const FINDER_MODES = ["5v5", "2v2"] as const;
export const FINDER_TTL_DAYS = 14;

export const roleLabel = (r: string) => FINDER_ROLES.find((x) => x.key === r)?.label ?? r;

export type FinderPost = {
  id: string;
  kind: "player" | "team";
  player_id: string;
  team_id: string | null;
  roles: string[];
  modes: string[];
  availability: string | null;
  note: string | null;
  active: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
  player: Pick<Player, "id" | "nickname" | "avatar_url" | "steam_id" | "faceit_level" | "faceit_elo" | "country">;
  team: (Pick<Team, "id" | "name" | "tag" | "logo_url" | "region"> & { member_count?: number }) | null;
};

const SELECT =
  "*, player:players!finder_posts_player_id_fkey(id, nickname, avatar_url, steam_id, faceit_level, faceit_elo, country), team:teams(id, name, tag, logo_url, region)";

export type FinderFilter = { role?: string; mode?: string; faceitMin?: number; faceitMax?: number };

/** Активные, не истёкшие объявления одного вида с фильтрами */
export async function listFinderPosts(kind: "player" | "team", f: FinderFilter = {}): Promise<FinderPost[]> {
  let q = db()
    .from("finder_posts")
    .select(SELECT)
    .eq("kind", kind)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(200);
  if (f.role && f.role !== "all") q = q.contains("roles", [f.role]);
  if (f.mode && f.mode !== "all") q = q.contains("modes", [f.mode]);
  const { data } = await q;
  let list = (data ?? []) as unknown as FinderPost[];
  // уровень FACEIT: для игрока — его уровень, для команды — уровень капитана
  if (f.faceitMin) list = list.filter((p) => (p.player.faceit_level ?? 0) >= f.faceitMin!);
  if (f.faceitMax) list = list.filter((p) => (p.player.faceit_level ?? 0) <= f.faceitMax!);

  if (kind === "team" && list.length) {
    const ids = list.map((p) => p.team_id!).filter(Boolean);
    const { data: members } = await db().from("team_members").select("team_id").in("team_id", ids);
    const count = new Map<string, number>();
    for (const m of members ?? []) count.set(m.team_id, (count.get(m.team_id) ?? 0) + 1);
    list = list.map((p) => (p.team ? { ...p, team: { ...p.team, member_count: count.get(p.team.id) ?? 0 } } : p));
  }
  return list;
}

/** Активное объявление игрока / команды (истёкшие считаются закрытыми) */
export async function getOwnPost(kind: "player" | "team", ownerId: string): Promise<FinderPost | null> {
  const { data } = await db()
    .from("finder_posts")
    .select(SELECT)
    .eq("kind", kind)
    .eq(kind === "player" ? "player_id" : "team_id", ownerId)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data as unknown as FinderPost) ?? null;
}

/** Закрыть истёкшие объявления владельца, чтобы уникальный индекс не мешал новому */
export async function closeExpired(kind: "player" | "team", ownerId: string) {
  await db()
    .from("finder_posts")
    .update({ active: false })
    .eq("kind", kind)
    .eq(kind === "player" ? "player_id" : "team_id", ownerId)
    .eq("active", true)
    .lte("expires_at", new Date().toISOString());
}
