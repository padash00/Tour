import "server-only";
import { db } from "./supabase";

/**
 * Глобальный поиск шапки: игроки, команды, турниры и матчи найденных команд.
 * Только чтение. Каждое поле — отдельным запросом (ввод пользователя не склеивается в строку фильтра).
 */
export type SearchResult = {
  players: { id: string; nickname: string; avatar_url: string | null; steam_id: string; faceit_level: number | null; href: string }[];
  teams: { id: string; name: string; tag: string; logo_url: string | null; href: string }[];
  tournaments: { id: string; name: string; status: string; starts_at: string | null; href: string }[];
  matches: { id: string; number: number; status: string; team1: string; team2: string; team1_score: number; team2_score: number; tournament: string; href: string }[];
};

export const EMPTY_SEARCH: SearchResult = { players: [], teams: [], tournaments: [], matches: [] };

/** Экранирование для ILIKE: % и _ — обычные символы, а не шаблон */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchAll(raw: string): Promise<SearchResult> {
  const q = raw.trim().slice(0, 64);
  if (q.length < 2) return EMPTY_SEARCH;
  const pattern = like(q);
  const steamId = /^\d{17}$/.test(q) ? q : null;

  const [byNick, bySteam, byName, byTag, tournaments] = await Promise.all([
    db().from("players").select("id, nickname, avatar_url, steam_id, faceit_level").eq("is_banned", false).ilike("nickname", pattern).order("nickname").limit(6),
    steamId ? db().from("players").select("id, nickname, avatar_url, steam_id, faceit_level").eq("steam_id", steamId).limit(1) : Promise.resolve({ data: [] }),
    db().from("teams").select("id, name, tag, logo_url").is("disbanded_at", null).ilike("name", pattern).order("name").limit(5),
    db().from("teams").select("id, name, tag, logo_url").is("disbanded_at", null).ilike("tag", pattern).order("tag").limit(5),
    db().from("tournaments").select("id, name, slug, status, starts_at").neq("status", "draft").ilike("name", pattern).order("starts_at", { ascending: false, nullsFirst: false }).limit(5),
  ]);

  const players = new Map<string, NonNullable<typeof byNick.data>[number]>();
  for (const p of [...(bySteam.data ?? []), ...(byNick.data ?? [])]) players.set(p.id, p);
  const teams = new Map<string, NonNullable<typeof byName.data>[number]>();
  for (const t of [...(byTag.data ?? []), ...(byName.data ?? [])]) teams.set(t.id, t);
  const teamList = [...teams.values()].slice(0, 6);

  // матчи найденных команд: сначала идущие и ближайшие, затем последние сыгранные
  let matches: SearchResult["matches"] = [];
  if (teamList.length) {
    const ids = teamList.map((t) => t.id);
    const { data } = await db()
      .from("matches")
      .select(
        "id, number, status, team1_score, team2_score, finished_at, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name), tournament:tournaments!inner(name, status)",
      )
      .or(`team1_id.in.(${ids.join(",")}),team2_id.in.(${ids.join(",")})`)
      .neq("tournament.status", "draft")
      .in("status", ["upcoming", "veto", "ready", "live", "finished"])
      .not("team1_id", "is", null)
      .not("team2_id", "is", null)
      .limit(30);
    type Row = { id: string; number: number; status: string; team1_score: number; team2_score: number; finished_at: string | null; team1: { name: string } | null; team2: { name: string } | null; tournament: { name: string } };
    const rank: Record<string, number> = { live: 0, ready: 1, veto: 1, upcoming: 2, finished: 3 };
    matches = ((data ?? []) as unknown as Row[])
      .sort((a, b) => rank[a.status] - rank[b.status] || (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))
      .slice(0, 4)
      .map((m) => ({
        id: m.id,
        number: m.number,
        status: m.status,
        team1: m.team1?.name ?? "TBD",
        team2: m.team2?.name ?? "TBD",
        team1_score: m.team1_score,
        team2_score: m.team2_score,
        tournament: m.tournament.name,
        href: `/matches/${m.id}`,
      }));
  }

  return {
    players: [...players.values()].slice(0, 6).map((p) => ({ ...p, href: `/players/${p.steam_id}` })),
    teams: teamList.map((t) => ({ ...t, href: `/teams/${encodeURIComponent(t.tag)}` })),
    tournaments: (tournaments.data ?? []).map((t) => ({ id: t.id, name: t.name, status: t.status, starts_at: t.starts_at, href: `/tournaments/${t.slug}` })),
    matches,
  };
}
