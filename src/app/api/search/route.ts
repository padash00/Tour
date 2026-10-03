import { NextResponse, type NextRequest } from "next/server";
import { searchAll } from "@/lib/search";

/** Глобальный поиск шапки: ?q= (от 2 символов). Ответ одинаков для всех — кэшируется CDN на 30 с */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const result = await searchAll(q);
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" } });
}
