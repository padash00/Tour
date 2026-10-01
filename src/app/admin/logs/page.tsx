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
];

type Severity = "info" | "warn" | "error";

/** Уровень по названию действия: цвет — только у уровня */
function severityOf(action: string): Severity {
  if (/(ban|delete|disqualif|force|walkover|reopen|error|fail)/i.test(action)) return "error";
  if (/(reject|withdraw|stop|restart|reset|remove|kick|dispute|replace)/i.test(action)) return "warn";
  return "info";
}

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
        eyebrow="F16 Control"
        title="Журнал"
        description="Действия администраторов, участников, автопилота и серверов. Ответы агента — на странице «Серверы»."
      />

      {/* фильтры */}
      <div className="space-y-3">
        <form className="flex flex-wrap gap-2" role="search">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          {sev && <input type="hidden" name="s" value={sev} />}
          <input name="q" defaultValue={q} placeholder="Поиск по действию и данным" aria-label="Поиск" className="field !h-10 flex-1 min-w-[220px] text-[13px]" />
          <input name="a" defaultValue={actor} placeholder="Кто (ник или system)" aria-label="Кто" className="field !h-10 w-56 text-[13px]" />
          <button type="submit" className="h-10 rounded-[8px] border border-white/[0.14] bg-white/[0.03] px-4 text-[13px] font-medium hover:border-white/[0.26]">
            Найти
          </button>
          {(q || actor) && (
            <Link href={href({ q: null, a: null })} className="h-10 inline-flex items-center px-3 text-[12px] text-fg-3 hover:text-fg">
              Сбросить
            </Link>
          )}
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ f: f.key === "all" ? null : f.key })}
                className={cn(
                  "h-8 px-3 inline-flex items-center rounded-[7px] text-[12px] transition",
                  filter === f.key ? "bg-accent/[0.1] text-accent" : "text-fg-3 hover:text-fg-2 hover:bg-white/[0.03]",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-1">
            {([null, "info", "warn", "error"] as const).map((s) => (
              <Link
                key={s ?? "any"}
                href={href({ s })}
                className={cn(
                  "h-8 px-3 inline-flex items-center rounded-[7px] text-[12px] font-mono transition",
                  sev === s ? "bg-white/[0.07]" : "hover:bg-white/[0.03]",
                  s ? sevCls[s] : "text-fg-2",
                )}
              >
                {s ?? "все уровни"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState compact title="Записей нет" description={q || actor || sev || filter !== "all" ? "Попробуйте снять фильтры." : undefined} />
      ) : (
        <div className="rounded-[12px] border border-white/[0.08] bg-[#04070c] overflow-x-auto">
          <div className="min-w-[820px] font-mono text-[12px] leading-[22px]">
            {[...days.entries()].map(([day, rows]) => (
              <div key={day}>
                <div className="sticky left-0 px-4 pt-3 pb-1 text-[10px] font-sans font-medium uppercase tracking-[0.24em] text-[#7f93b0]">
                  {day} <span className="num tracking-normal text-fg-3">· {rows.length}</span>
                </div>
                {rows.map((l) => {
                  const s = severityOf(l.action);
                  const payload = l.payload && Object.keys(l.payload).length ? l.payload : null;
                  return (
                    <details key={l.id} className="group px-4 hover:bg-white/[0.03] open:bg-white/[0.02]">
                      <summary className={cn("flex gap-4 list-none", payload ? "cursor-pointer" : "cursor-default")}>
                        <span className="text-fg-3 shrink-0 w-[52px]">{formatTime(l.created_at)}</span>
                        <span className={cn("shrink-0 w-11 uppercase", sevCls[s])}>{s}</span>
                        <span className="text-fg-3 shrink-0 w-28 truncate">{l.actor?.nickname ?? "system"}</span>
                        <span className="text-fg-2 shrink-0">{l.action}</span>
                        <span className="text-fg-3 truncate">{payload ? JSON.stringify(payload) : ""}</span>
                      </summary>
                      {payload && (
                        <pre className="ml-[200px] mb-2 mt-1 max-h-72 overflow-auto rounded-[6px] bg-white/[0.03] px-3 py-2 whitespace-pre-wrap break-all text-fg-2">
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
      <p className="text-[12px] text-fg-3">
        Показано {logs.length} из последних {all.length} записей.
      </p>
    </div>
  );
}
