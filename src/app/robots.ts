import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        // правила — префиксы: "/team" закрыл бы и публичные /teams/…, поэтому точный адрес и подпапка
        "/me$",
        "/me/",
        "/team$",
        "/team/",
        "/notifications",
        "/join",
        "/login",
        "/overlay",
        "/broadcast",
        "/tv$",
        "/players/compare",
        "/teams/*/apply",
        "/tournaments/*/register",
        "/tournaments/*/checkin",
        "/tournaments/*/preview",
        "/tournaments/*/tv",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
