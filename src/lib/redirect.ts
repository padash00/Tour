/** Разрешаем редирект только на внутренние пути, чтобы не было open redirect */
export function safeNext(next: string | null | undefined, fallback = "/me") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
