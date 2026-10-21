import { NextResponse, type NextRequest } from "next/server";
import { demoDownloadUrl, demoFileName, getMatchDemos } from "@/lib/demos";
import { getMatch } from "@/lib/matches";

/**
 * «Скачать демо»: /matches/<id>/demo?f=<файл> → свежая подписанная ссылка на серверный ПК.
 * Подпись живёт 6 часов, поэтому в HTML страницы (кэш) её не кладём — выдаём в момент нажатия.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/matches/[id]/demo">) {
  const { id } = await ctx.params;
  const file = req.nextUrl.searchParams.get("f") ?? "";
  const m = await getMatch(id);
  if (!m || m.tournament.status === "draft" || m.matchzy_id == null) return text(404, "Матч не найден");
  const { demos, online } = await getMatchDemos(m.matchzy_id);
  const demo = demos.find((d) => d.file === file);
  if (!demo) return text(404, "Демо этого матча не найдено — возможно, оно уже удалено с сервера");
  if (!online) return text(503, "Серверный ПК сейчас не на связи — демо можно будет скачать, когда он включится");
  const mapName = m.maps.find((x) => x.map_number === demo.mapNumber)?.map_name ?? "map";
  const url = await demoDownloadUrl(m.matchzy_id, demo.file, demoFileName(m.number, demo.mapNumber, mapName, demo.part, demo.parts), m.server_address);
  if (!url) return text(503, "Адрес сервера неизвестен — демо пока нельзя скачать");
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}

const text = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
