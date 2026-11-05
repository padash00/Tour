import { NextResponse } from "next/server";

/** Какая сборка сейчас на сайте: время сборки (next.config env.BUILD_AT). Для проверки, что выкладка дошла. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ builtAt: process.env.BUILD_AT ?? null }, { headers: { "Cache-Control": "no-store" } });
}
