import "server-only";
import { db } from "./supabase";

export type SiteError = {
  source: "server" | "client";
  message: string;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  route?: string | null;
  kind?: string | null;
};

/** Одна и та же ошибка на одном адресе пишется не чаще раза в минуту — журнал не засоряется */
const recent = new Map<string, number>();

export async function logSiteError(e: SiteError) {
  const key = `${e.source}:${e.path}:${e.digest ?? e.message.slice(0, 80)}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  await db()
    .from("audit_logs")
    .insert({
      actor_id: null,
      action: e.source === "server" ? "site.error" : "site.client_error",
      entity_type: null,
      entity_id: null,
      payload: {
        message: e.message.slice(0, 500),
        digest: e.digest ?? null,
        path: e.path?.slice(0, 300) ?? null,
        method: e.method ?? null,
        route: e.route ?? null,
        kind: e.kind ?? null,
      },
    });
}

/** Сколько ошибок сайта за последние minutes минут — для полосы тревог в пульте */
export async function recentSiteErrors(minutes = 15) {
  const { count } = await db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .like("action", "site.%")
    .gte("created_at", new Date(Date.now() - minutes * 60_000).toISOString());
  return count ?? 0;
}
