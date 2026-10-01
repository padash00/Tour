import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";
import type { MatchWithTeams } from "@/lib/matches";
import type { Tournament } from "@/lib/types";
import { MatchStatusBadge, visibleMatches } from "@/components/match-bits";
import { EmptyState, IconBracket, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Матчи — админ" };

const FILTERS = [
  { key: "active", label: "Активные", statuses: ["upcoming", "veto", "ready", "live"] },
  { key: "pending", label: "Ожидают", statuses: ["pending"] },
  { key: "finished", label: "Завершённые", statuses: ["finished"] },
];

export default async function AdminMatchesPage(props: PageProps<"/admin/matches">) {
  const sp = await props.searchParams;
  const filter = FILTERS.find((f) => f.key === sp.f) ?? FILTERS[0];
  const { data } = await db()
    .from("matches")
    .select("*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), tournament:tournaments(name, slug, status)")
    .in("status", filter.statuses)
    .order("number");
  const matches = visibleMatches((data ?? []) as (MatchWithTeams & { tournament: Pick<Tournament, "name" | "slug" | "status"> })[]).filter(
    (m) => !["finished", "cancelled"].includes(m.tournament.status) || filter.key === "finished",
  );
  const order = { live: 0, veto: 1, ready: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  matches.sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);

  return (
    <div className="space-y-8">
      <div>
        <div className="label">Управление</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Матчи</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/matches?f=${f.key}`}
            className={cn(
              "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
              filter.key === f.key ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {matches.length === 0 ? (
        <EmptyState
          icon={<IconBracket />}
          title="Матчей нет"
          description="Матчи создаются при генерации сетки на странице турнира."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[760px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Матч</th>
                <th>Турнир</th>
                <th>Формат</th>
                <th>Статус</th>
                <th>Счёт</th>
                <th>Сервер</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td className="num text-fg-3">{m.number}</td>
                  <td>
                    <Link href={`/admin/matches/${m.id}`} className="font-medium text-fg hover:text-accent">
                      {m.team1?.name ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.name ?? "TBD"}
                    </Link>
                  </td>
                  <td className="text-xs">{m.tournament.name}</td>
                  <td>BO{m.best_of}</td>
                  <td><MatchStatusBadge status={m.status} /></td>
                  <td className="num">{["live", "finished"].includes(m.status) ? `${m.team1_score}:${m.team2_score}` : "—"}</td>
                  <td className="num text-xs">{m.server_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
