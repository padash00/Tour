import { NextResponse, type NextRequest } from "next/server";
import { steamLoginUrl } from "@/lib/steam";
import { safeNext } from "@/lib/redirect";

export function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(steamLoginUrl(request.nextUrl.origin, next));
}
