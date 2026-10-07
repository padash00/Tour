import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { logSiteError } from "@/lib/site-errors";
import { db } from "@/lib/supabase";

/**
 * Ошибки, которые случились в браузере (страница «Что-то пошло не так»).
 * Принимаем только с нашего сайта и коротко — это журнал, не хранилище.
 */
// не больше LIMIT отчётов в минуту с одного адреса (в пределах инстанса функции — от спама, не от DDoS)
const LIMIT = 10;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; reset: number }>();

function throttled(ip: string) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const cur = hits.get(ip);
  if (!cur || cur.reset <= now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  cur.count++;
  return cur.count > LIMIT;
}

/**
 * Общий для всех инстансов лимит: не чаще раза в 3 с с одного адреса (rate_limit_claim, ключ — UUID из хэша IP).
 * Сам IP в базу не пишем. Если база недоступна — пропускаем, журнал ошибок важнее.
 */
async function throttledShared(ip: string) {
  const h = createHash("sha256").update(`client-error:${ip}`).digest("hex");
  const actor = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  const { data, error } = await db().rpc("rate_limit_claim", { p_actor: actor, p_action: "client_error", p_seconds: 3 });
  return !error && data === true;
}

/** Запрос со страниц нашего сайта: браузер ставит Sec-Fetch-Site, старые браузеры — Origin. Без обоих — отказ */
function sameOrigin(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "same-site";
  const origin = request.headers.get("origin");
  return !!origin && origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (throttled(ip) || (await throttledShared(ip))) return NextResponse.json({ ok: false }, { status: 429 });
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
