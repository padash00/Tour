import type { Metadata } from "next";
import Link from "next/link";
import { formatShortDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { AuditLog, Player } from "@/lib/types";
import { EmptyState, cn } from "@/components/ui";
import { AdminHeader } from "@/components/admin/control";

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
];

type Severity = "info" | "warn" | "error";

/** Уровень по названию действия: цвет — только у уровня */
function severityOf(action: string): Severity {
  if (/(ban|delete|disqualif|force|walkover|reopen|error|fail)/i.test(action)) return "error";
  if (/(reject|withdraw|stop|restart|reset|remove|kick|dispute|replace)/i.test(action)) return "warn";
  return "info";
}

const sevCls: Record<Severity, string> = { info: "text-fg-3", warn: "text-warn", error: "text-danger" };

export default async function LogsPage(props: PageProps<"/admin/logs">) {
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f)?.key ?? "all";
  const sev = (["info", "warn", "error"] as const).find((s) => s === sp.s) ?? null;
  let query = db()
    .from("audit_logs")
    .select("*, actor:players(nickname, steam_id)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (filter !== "all") query = query.like("action", `${filter}.%`);
  const { data } = await query;
  const all = (data ?? []) as (AuditLog & { actor: Pick<Player, "nickname" | "steam_id"> | null })[];
  const logs = sev ? all.filter((l) => severityOf(l.action) === sev) : all;
  const href = (f: string, s: string | null) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("f", f);
    if (s) p.set("s", s);
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key, sev)}
              className={cn(
                "h-7 px-2.5 inline-flex items-center rounded-md text-[12px] transition",
                filter === f.key ? "bg-white/[0.07] text-fg" : "text-fg-3 hover:text-fg-2",
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
              href={href(filter, s)}
              className={cn(
                "h-7 px-2.5 inline-flex items-center rounded-md text-[12px] font-mono transition",
                sev === s ? "bg-white/[0.07]" : "hover:bg-white/[0.03]",
                s ? sevCls[s] : "text-fg-2",
              )}
            >
              {s ?? "все уровни"}
            </Link>
          ))}
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState compact title="Записей нет" />
      ) : (
        <div className="rounded-[12px] border border-white/[0.08] bg-[#04070c] overflow-x-auto">
          <div className="min-w-[820px] py-2 font-mono text-[12px] leading-[22px]">
            {logs.map((l) => {
              const s = severityOf(l.action);
              const details = Object.keys(l.payload ?? {}).length ? JSON.stringify(l.payload) : "";
              return (
                <div key={l.id} className="group flex gap-4 px-4 hover:bg-white/[0.03]">
                  <span className="text-fg-3 shrink-0 w-[124px] whitespace-nowrap">{formatShortDateTime(l.created_at)}</span>
                  <span className={cn("shrink-0 w-11 uppercase", sevCls[s])}>{s}</span>
                  <span className="text-fg-3 shrink-0 w-28 truncate">{l.actor?.nickname ?? "system"}</span>
                  <span className="text-fg-2 shrink-0">{l.action}</span>
                  <span className="text-fg-3 truncate group-hover:whitespace-normal group-hover:break-all">{details}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[12px] text-fg-3">Показаны последние {all.length} записей.</p>
    </div>
  );
}
