import type { Instrumentation } from "next";

/**
 * При старте сервера. Node 24 (OpenSSL 3.5) по умолчанию шлёт в TLS постквантовый ключ (X25519MLKEM768) —
 * большой ClientHello, который по пути VPS → Akamai (steamcommunity.com) теряется: рукопожатие висело
 * до таймаута, вход через Steam падал «fetch failed» (02.11.2026). Классические кривые — как у curl/браузеров раньше.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const tls = await import("node:tls");
  tls.DEFAULT_ECDH_CURVE = "X25519:P-256:P-384";
}

/**
 * Ошибки сайта на сервере (страницы, server actions, API) — в «Журнал» F16 Control как site.error,
 * чтобы организатор узнавал о них сразу, а не от игроков. Ошибку записи самой ошибки глотаем.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { logSiteError } = await import("./lib/site-errors");
    await logSiteError({
      source: "server",
      message: err instanceof Error ? err.message : String(err),
      digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null,
      path: request.path,
      method: request.method,
      route: context.routePath,
      kind: context.routeType,
    });
  } catch {}
};
