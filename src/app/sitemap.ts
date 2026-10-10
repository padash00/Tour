import type { MetadataRoute } from "next";
import { listPlayers, listPublicTournaments, listTeams } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

// карта сайта обновляется раз в час
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // приоритет: главная и турниры важнее справочных страниц
  const staticRoutes: MetadataRoute.Sitemap = (
    [
      ["", 1, "daily"],
      ["/tournaments", 0.9, "daily"],
      ["/matches", 0.7, "hourly"],
      ["/teams", 0.7, "daily"],
      ["/stats", 0.6, "daily"],
      ["/players", 0.6, "daily"],
      ["/find", 0.5, "daily"],
      ["/rules", 0.5, "monthly"],
      ["/help", 0.5, "monthly"],
      ["/about", 0.4, "monthly"],
    ] as const
  ).map(([p, priority, changeFrequency]) => ({ url: `${SITE_URL}${p}`, lastModified: now, priority, changeFrequency }));

  const [tournaments, teams, players] = await Promise.all([
    listPublicTournaments().catch(() => []),
    listTeams().catch(() => []),
    listPlayers().catch(() => []),
  ]);

  return [
    ...staticRoutes,
    ...tournaments.map((t) => ({ url: `${SITE_URL}/tournaments/${t.slug}`, lastModified: new Date(t.updated_at ?? now), priority: 0.8, changeFrequency: "daily" as const })),
    ...teams.map((t) => ({ url: `${SITE_URL}/teams/${encodeURIComponent(t.tag)}`, lastModified: now, priority: 0.5, changeFrequency: "weekly" as const })),
    ...players.map((p) => ({ url: `${SITE_URL}/players/${p.steam_id}`, lastModified: now, priority: 0.4, changeFrequency: "weekly" as const })),
  ];
}
