import type { Instrumentation } from "next";

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
