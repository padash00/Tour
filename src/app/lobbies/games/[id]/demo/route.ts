import { NextResponse, type NextRequest } from "next/server";
import { demoDownloadUrl, demoFileName, getMatchDemos } from "@/lib/demos";
import { getGame } from "@/lib/lobby";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * «Скачать демо» игры лобби: /lobbies/games/<id>/demo?f=<файл> → свежая подписанная ссылка на серверный ПК.
 * То же, что /matches/<id>/demo у турнирных матчей: подпись живёт 6 часов и выдаётся в момент нажатия.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/lobbies/games/[id]/demo">) {
  const { id } = await ctx.params;
  const file = req.nextUrl.searchParams.get("f") ?? "";
  const game = UUID.test(id) ? await getGame(id) : null;
  if (!game || game.matchzy_id == null) return text(404, "Матч не найден");
  const { demos, online } = await getMatchDemos(game.matchzy_id);
  const demo = demos.find((d) => d.file === file);
  if (!demo) return text(404, "Демо этого матча не найдено — возможно, оно уже удалено с сервера");
  if (!online) return text(503, "Серверный ПК сейчас не на связи — демо можно будет скачать, когда он включится");
  const mapName = game.maps[demo.mapNumber - 1]?.map ?? "map";
  const url = await demoDownloadUrl(game.matchzy_id, demo.file, demoFileName(game.matchzy_id, demo.mapNumber, mapName, demo.part, demo.parts), game.server_address);
  if (!url) return text(503, "Адрес сервера неизвестен — демо пока нельзя скачать");
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}

const text = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
