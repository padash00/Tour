import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getTournamentBySlug } from "@/lib/data";
import { ogFonts } from "@/lib/og-font";
import { ogAccess, ogFormat } from "@/lib/og-image";
import { getTournamentRecap } from "@/lib/recap";
import { buildRecapPoster } from "@/lib/recap-poster";

/**
 * Итоги турнира картинкой для соцсетей (плакат в стиле Telegram-каналов про CS, см. lib/recap-poster):
 *   /tournaments/<slug>/recap/image            — 1080×1350 (лента Instagram)
 *   /tournaments/<slug>/recap/image?f=story    — 1080×1920
 *   /tournaments/<slug>/recap/image?f=wide     — 1200×630 (WhatsApp, Telegram, превью ссылки)
 *   &download=1 — отдать файлом
 * Только для завершённого турнира, иначе 404.
 */

export async function GET(req: NextRequest, ctx: RouteContext<"/tournaments/[slug]/recap/image">) {
  const { slug } = await ctx.params;
  const t = await getTournamentBySlug(slug);
  if (!t || t.status !== "finished") return new Response("Итоги ещё не готовы", { status: 404 });
  const [recap, fonts] = await Promise.all([getTournamentRecap(t), ogFonts()]);
  if (!recap.placements.some((p) => p.place === "1")) return new Response("Итоги ещё не готовы", { status: 404 });

  const fmt = ogFormat(req.nextUrl.searchParams.get("f"));
  const access = await ogAccess(req, fmt);
  if (!access.allowed) return new Response("Скачивание — только для администратора", { status: 403, headers: { "Cache-Control": "private, no-store" } });

  const poster = await buildRecapPoster(t, recap, fmt, access.scale, fonts);
  const image = new ImageResponse(poster.node, { width: poster.width, height: poster.height, ...(fonts.length ? { fonts } : {}) });

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", access.private ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  if (req.nextUrl.searchParams.get("download")) {
    headers.set("Content-Disposition", `attachment; filename="f16-${slug}-itogi-${fmt}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
