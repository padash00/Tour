import type { Metadata } from "next";
import Link from "next/link";
import { formatShortDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { AuditLog, Player } from "@/lib/types";
import { EmptyState, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Журнал" };

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "tournament", label: "Турниры" },
  { key: "registration", label: "Заявки" },
  { key: "roster", label: "Составы" },
  { key: "team", label: "Команды" },
  { key: "player", label: "Игроки" },
];

export default async function LogsPage(props: PageProps<"/admin/logs">) {
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f)?.key ?? "all";
  let query = db()
    .from("audit_logs")
    .select("*, actor:players(nickname, steam_id)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") query = query.like("action", `${filter}.%`);
  const { data } = await query;
  const logs = (data ?? []) as (AuditLog & { actor: Pick<Player, "nickname" | "steam_id"> | null })[];

  return (
    <div className="space-y-8">
      <div>
        <div className="label">Аудит</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Журнал действий</h1>
        <p className="mt-2 text-sm text-fg-3">
          Все ручные действия администраторов и участников. Логи серверов появятся вместе с Server Agent.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/logs" : `/admin/logs?f=${f.key}`}
            className={cn(
              "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
              filter === f.key ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {logs.length === 0 ? (
        <EmptyState title="Записей нет" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[720px] text-[13px]">
            <thead>
              <tr>
                <th>Время</th>
                <th>Кто</th>
                <th>Действие</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="num text-fg-3 whitespace-nowrap">{formatShortDateTime(l.created_at)}</td>
                  <td className="whitespace-nowrap">{l.actor?.nickname ?? "system"}</td>
                  <td className="num text-fg">{l.action}</td>
                  <td className="num text-xs text-fg-3 max-w-[360px] truncate">
                    {Object.keys(l.payload).length ? JSON.stringify(l.payload) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
