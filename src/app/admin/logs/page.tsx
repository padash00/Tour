import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, formatTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { AuditLog, Player } from "@/lib/types";
import { EmptyState, cn } from "@/components/ui";
import { AdminHeader } from "@/components/admin/control";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Журнал — F16 Control" };

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "tournament", label: "Турниры" },
  { key: "registration", label: "Заявки" },
  { key: "match", label: "Матчи" },
  { key: "server", label: "Серверы" },
  { key: "autopilot", label: "Автопилот" },
  { key: "roster", label: "Составы" },
  { key: "team", label: "Команды" },
  { key: "player", label: "Игроки" },
  { key: "settings", label: "Настройки" },
  { key: "site", label: "Ошибки сайта" },
];

type Severity = "info" | "warn" | "error";

/** Уровень по названию действия: цвет — только у уровня */
function severityOf(action: string): Severity {
  if (/(ban|delete|disqualif|force|walkover|reopen|error|fail)/i.test(action)) return "error";
  if (/(reject|withdraw|stop|restart|reset|remove|kick|dispute|replace)/i.test(action)) return "warn";
  return "info";
}

const sevLabel: Record<Severity, string> = { info: "Обычное", warn: "Важное", error: "Опасное" };
const sevCls: Record<Severity, string> = { info: "text-fg-3", warn: "text-warn", error: "text-danger" };

type Row = AuditLog & { actor: Pick<Player, "nickname" | "steam_id"> | null };

export default async function LogsPage(props: PageProps<"/admin/logs">) {
  await requireAdmin("/admin/logs"); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f)?.key ?? "all";
  const sev = (["info", "warn", "error"] as const).find((s) => s === sp.s) ?? null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const actor = typeof sp.a === "string" ? sp.a.trim() : "";

  let query = db()
    .from("audit_logs")
    .select("*, actor:players(nickname, steam_id)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter !== "all") query = query.like("action", `${filter}.%`);
  const { data } = await query;
  const all = (data ?? []) as Row[];
  const needle = q.toLowerCase();
  const who = actor.toLowerCase();
  const logs = all.filter((l) => {
    if (sev && severityOf(l.action) !== sev) return false;
    if (who && !(l.actor?.nickname ?? "system").toLowerCase().includes(who)) return false;
    if (needle && !`${l.action} ${JSON.stringify(l.payload ?? {})}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  // группировка по дням
  const days = new Map<string, Row[]>();
  for (const l of logs) {
    const d = formatDate(l.created_at);
    days.set(d, [...(days.get(d) ?? []), l]);
  }

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { f: filter === "all" ? null : filter, s: sev, q: q || null, a: actor || null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/admin/logs?${qs}` : "/admin/logs";
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Журнал"
        description="Кто и что делал на сайте: администраторы, игроки, автопилот и серверы. Ответы серверов — на странице «Серверы»."
      />

      {/* фильтры */}
      <div className="space-y-3">
        <form className="flex flex-wrap gap-2" role="search">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          {sev && <input type="hidden" name="s" value={sev} />}
          <input name="q" defaultValue={q} placeholder="Поиск по действию и данным" aria-label="Поиск" className="field !h-11 flex-1 min-w-[220px] text-[15px]" />
          <input name="a" defaultValue={actor} placeholder="Кто (ник или system)" aria-label="Кто" className="field !h-11 w-56 text-[15px]" />
          <button type="submit" className="h-11 rounded-control bg-accent px-6 text-[15px] font-semibold text-white hover:bg-accent-strong">
            Найти
          </button>
          {(q || actor) && (
            <Link href={href({ q: null, a: null })} className="h-11 inline-flex items-center px-3 text-[14px] font-semibold text-fg-3 hover:text-fg">
              Сбросить
            </Link>
          )}
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ f: f.key === "all" ? null : f.key })}
                className={cn(
                  "h-10 px-4 inline-flex items-center rounded-control text-[14px] font-semibold transition",
                  filter === f.key ? "bg-accent text-white" : "bg-surface text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line-subtle)] hover:bg-surface-2",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([null, "info", "warn", "error"] as const).map((s) => (
              <Link
                key={s ?? "any"}
                href={href({ s })}
                className={cn(
                  "h-10 px-4 inline-flex items-center rounded-control text-[14px] font-semibold transition",
                  sev === s ? "bg-ink/[0.09]" : "hover:bg-ink/[0.04]",
                  s ? sevCls[s] : "text-fg-2",
                )}
              >
                {s ? sevLabel[s] : "Любая важность"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState compact title="Записей нет" description={q || actor || sev || filter !== "all" ? "Попробуйте снять фильтры." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-surface bg-surface shadow-[inset_0_0_0_1px_var(--color-line-subtle),var(--shadow-soft)]">
          <div className="min-w-[820px] py-2 text-[14px] leading-[30px]">
            {[...days.entries()].map(([day, rows]) => (
              <div key={day}>
                <div className="sticky left-0 px-5 pt-4 pb-1 text-[15px] font-bold text-fg">
                  {day} <span className="num tracking-normal text-fg-3">· {rows.length}</span>
                </div>
                {rows.map((l) => {
                  const s = severityOf(l.action);
                  const payload = l.payload && Object.keys(l.payload).length ? l.payload : null;
                  return (
                    <details key={l.id} className="group px-5 hover:bg-surface-2 open:bg-surface-2">
                      <summary className={cn("flex gap-4 list-none", payload ? "cursor-pointer" : "cursor-default")}>
                        <span className="num text-fg-3 shrink-0 w-[60px]">{formatTime(l.created_at)}</span>
                        <span className={cn("shrink-0 w-20 font-semibold", sevCls[s])}>{sevLabel[s]}</span>
                        <span className="text-fg-2 shrink-0 w-32 truncate">{l.actor?.nickname ?? "system"}</span>
                        <span className="shrink-0 font-mono text-[14px] text-fg">{l.action}</span>
                        <span className="truncate font-mono text-[14px] text-fg-3">{payload ? JSON.stringify(payload) : ""}</span>
                      </summary>
                      {payload && (
                        <pre className="ml-[230px] mb-3 mt-1 max-h-72 overflow-auto rounded-control bg-ink/[0.05] px-4 py-3 font-mono text-[14px] leading-6 whitespace-pre-wrap break-all text-fg-2">
                          {JSON.stringify(payload, null, 2)}
                          {l.entity_type ? `\n\n${l.entity_type}: ${l.entity_id ?? ""}` : ""}
                        </pre>
                      )}
                    </details>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[13px] text-fg-3">
        Показано записей: {logs.length} из последних {all.length}. Нажмите на строку, чтобы увидеть подробности.
      </p>
    </div>
  );
}
