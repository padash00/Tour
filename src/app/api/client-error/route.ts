import { NextResponse, type NextRequest } from "next/server";
import { logSiteError } from "@/lib/site-errors";

/**
 * Ошибки, которые случились в браузере (страница «Что-то пошло не так»).
 * Принимаем только с нашего сайта и коротко — это журнал, не хранилище.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  let body: { message?: unknown; digest?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });
  await logSiteError({
    source: "client",
    message,
    digest: typeof body.digest === "string" ? body.digest.slice(0, 64) : null,
    path: typeof body.path === "string" ? body.path.slice(0, 300) : null,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
