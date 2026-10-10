import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { db } from "@/lib/supabase";
import type { MatchWithTeams } from "@/lib/matches";
import type { MatchStatus, Tournament } from "@/lib/types";
import { formatShortDateTime, mapName } from "@/lib/format";
import { MatchStatusBadge, visibleMatches } from "@/components/match-bits";
import { EmptyState, cn } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Матчи — F16 Control" };

const FILTERS: { key: string; label: string; statuses: MatchStatus[] }[] = [
  { key: "active", label: "Активные", statuses: ["upcoming", "veto", "ready", "live"] },
  { key: "pending", label: "Ожидают", statuses: ["pending"] },
  { key: "finished", label: "Завершённые", statuses: ["finished"] },
];

type Row = MatchWithTeams & {
  tournament: Pick<Tournament, "name" | "slug" | "status">;
  maps: { map_name: string; status: string; map_number: number }[] | null;
};

export default async function AdminMatchesPage(props: PageProps<"/admin/matches">) {
  await requireAdmin("/admin/matches"); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f) ?? FILTERS[0];
  const { data } = await db()
    .from("matches")
    .select(
      "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), tournament:tournaments(name, slug, status), maps:match_maps(map_name, status, map_number)",
    )
    .in("status", filter.statuses)
    .order("number");
  const matches = visibleMatches((data ?? []) as Row[]).filter(
    (m) => !["finished", "cancelled"].includes(m.tournament.status) || filter.key === "finished",
  );
  const order = { live: 0, veto: 1, ready: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  matches.sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);
  const now = serverNow();

  return (
    <div className="space-y-6">
      <LiveRefresh watch="matches" intervalMs={4000} />
      <AdminHeader title="Матчи" />
      <div className="flex gap-5 border-b border-white/[0.06]">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/matches?f=${f.key}`}
            className={cn(
              "relative h-10 inline-flex items-center text-[13px] font-medium transition-colors",
              filter.key === f.key ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {f.label}
            {filter.key === f.key && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
          </Link>
        ))}
      </div>
      {matches.length === 0 ? (
        <EmptyState compact title="Матчей нет" description="Матчи создаются при генерации сетки на странице турнира." />
      ) : (
        <TableBox minWidth={980} maxHeight={720}>
          <thead>
            <tr>
              <th>#</th>
              <th>Команды</th>
              <th>Турнир</th>
              <th>Статус</th>
              <th>Счёт</th>
              <th>Сервер</th>
              <th>Карта</th>
              <th>Время</th>
              <th>Ожидание</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const maps = [...(m.maps ?? [])].sort((a, b) => a.map_number - b.map_number);
              const cur = maps.find((x) => x.status === "live") ?? maps.find((x) => x.status !== "finished") ?? maps[maps.length - 1];
              return (
                <tr key={m.id} className={m.status === "live" ? "bg-danger/[0.04]" : undefined}>
                  <td className="num text-fg-3">{m.number}</td>
                  <td>
                    <Link href={`/admin/matches/${m.id}`} className="font-medium text-fg hover:text-accent">
                      {m.team1?.name ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.name ?? "TBD"}
                    </Link>
                  </td>
                  <td className="text-fg-3 max-w-[180px] truncate">{m.tournament.name}</td>
                  <td>
                    <MatchStatusBadge status={m.status} />
                  </td>
                  <td className="num text-fg">{["live", "finished"].includes(m.status) ? `${m.team1_score}:${m.team2_score}` : "—"}</td>
                  <td className="num">
                    {m.server_instance ?? "—"}
                    {m.server_state === "loading" && <span className="ml-1.5 text-warn">…</span>}
                  </td>
                  <td>{cur ? mapName(cur.map_name) : "—"}</td>
                  <td className="num">{formatShortDateTime(m.scheduled_at)}</td>
                  <td className="num">
                    {m.status === "ready" && m.server_ready_at ? (
                      (() => {
                        const min = Math.floor((now - new Date(m.server_ready_at).getTime()) / 60000);
                        return (
                          <span className={min >= 15 ? "text-danger font-semibold" : min >= 10 ? "text-warn" : ""}>
                            {min} мин{min >= 15 ? " · неявка" : ""}
                          </span>
                        );
                      })()
                    ) : m.server_state === "error" ? (
                      <span className="text-danger">ошибка сервера</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
    </div>
  );
}

/** Время запроса (серверный компонент рендерится один раз на запрос) */
function serverNow() {
  return Date.now();
}
