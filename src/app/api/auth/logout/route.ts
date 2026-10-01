import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/session";

/** Выход — только POST со своего сайта (чужая страница не может разлогинить игрока) */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const sameOrigin = origin ? origin === request.nextUrl.origin : site ? site === "same-origin" || site === "none" : true;
  if (!sameOrigin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await destroySession();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}
