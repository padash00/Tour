import type { MetadataRoute } from "next";
import { listPlayers, listPublicTournaments, listTeams } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

// карта сайта обновляется раз в час
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes = ["", "/tournaments", "/teams", "/matches", "/players", "/stats", "/rules", "/about"].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
  }));

  const [tournaments, teams, players] = await Promise.all([
    listPublicTournaments().catch(() => []),
    listTeams().catch(() => []),
    listPlayers().catch(() => []),
  ]);

  return [
    ...staticRoutes,
    ...tournaments.map((t) => ({ url: `${SITE_URL}/tournaments/${t.slug}`, lastModified: new Date(t.updated_at ?? now) })),
    ...teams.map((t) => ({ url: `${SITE_URL}/teams/${encodeURIComponent(t.tag)}`, lastModified: now })),
    ...players.map((p) => ({ url: `${SITE_URL}/players/${p.steam_id}`, lastModified: now })),
  ];
}
