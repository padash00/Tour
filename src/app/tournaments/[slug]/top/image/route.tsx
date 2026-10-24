import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getTournamentBySlug } from "@/lib/data";
import { ogFonts } from "@/lib/og-font";
import { ogAccess } from "@/lib/og-image";
import { buildTopPoster, topFormat } from "@/lib/top-poster";
import { getTopPlayers, isDayKey } from "@/lib/top-players";

/**
 * «ТОП-5 лучших игроков» картинкой для соцсетей (плакат в стиле recap, см. lib/top-poster):
 *   /tournaments/<slug>/top/image            — 1080×1350 (лента Instagram)
 *   /tournaments/<slug>/top/image?f=story    — 1080×1920
 *   /tournaments/<slug>/top/image?f=square   — 1200×1200
 *   &day=YYYY-MM-DD — только матчи, завершённые в этот день (Asia/Almaty)
 *   &download=1 — отдать файлом
 * Только администратору (двойное разрешение). Нет статистики — 404.
 */

export async function GET(req: NextRequest, ctx: RouteContext<"/tournaments/[slug]/top/image">) {
  const { slug } = await ctx.params;
  const t = await getTournamentBySlug(slug);
  if (!t) return new Response("Турнир не найден", { status: 404 });

  const fmt = topFormat(req.nextUrl.searchParams.get("f"));
  // скачивание и крупные картинки — только админу; формат «post» в ogAccess не считается публичным превью
  const access = await ogAccess(req, "post");
  if (!access.allowed) return new Response("Скачивание — только для администратора", { status: 403, headers: { "Cache-Control": "private, no-store" } });

  const dayParam = req.nextUrl.searchParams.get("day");
  if (dayParam && !isDayKey(dayParam)) return new Response("Неверная дата", { status: 400 });

  const [top, fonts] = await Promise.all([getTopPlayers(t, dayParam), ogFonts()]);
  if (!top) return new Response("Статистики ещё нет", { status: 404 });

  const poster = await buildTopPoster(t, top.players, top.subtitle, fmt, access.scale, fonts);
  const image = new ImageResponse(poster.node, { width: poster.width, height: poster.height, ...(fonts.length ? { fonts } : {}) });

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", access.private ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  if (req.nextUrl.searchParams.get("download")) {
    headers.set("Content-Disposition", `attachment; filename="f16-${slug}-top${top.players.length}${dayParam ? `-${dayParam}` : ""}-${fmt}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
