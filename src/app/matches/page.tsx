import type { Metadata } from "next";
import { getUpcomingMatches, type MatchWithTeams } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { MatchLine } from "@/components/public/bits";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import { Container, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Матчи" };

type ListMatch = MatchWithTeams & { tournament: Pick<Tournament, "id" | "name" | "slug" | "status"> };

async function recentFinished(limit = 20) {
  const { data } = await db()
    .from("matches")
    .select(
      "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), tournament:tournaments!inner(id, name, slug, status)",
    )
    .eq("status", "finished")
    .neq("tournament.status", "draft")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return visibleMatches((data ?? []) as ListMatch[]);
}

export default async function MatchesPage() {
  const [active, finished] = await Promise.all([getUpcomingMatches(50), recentFinished()]);
  const live = active.filter((m) => m.status === "live");
  const next = active.filter((m) => m.status !== "live");

  return (
    <Container>
      {live.length > 0 && <LiveRefresh intervalMs={10000} />}
      <PageHeader title="Матчи" />

      {active.length === 0 && finished.length === 0 ? (
        <EmptyState title="Матчей пока нет" description="Матчи появятся, когда будет опубликована сетка турнира." />
      ) : (
        <div className="space-y-20">
          {live.length > 0 && (
            <section>
              <h2 className="text-sm text-fg-3 mb-2">Сейчас в игре</h2>
              {live.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </section>
          )}
          <section>
            <h2 className="text-sm text-fg-3 mb-2">Ближайшие</h2>
            {next.length > 0 ? (
              next.map((m) => <MatchLine key={m.id} m={m} />)
            ) : (
              <p className="py-4 text-fg-2">Запланированных матчей нет.</p>
            )}
          </section>
          {finished.length > 0 && (
            <section>
              <h2 className="text-sm text-fg-3 mb-2">Завершённые</h2>
              {finished.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </section>
          )}
        </div>
      )}
    </Container>
  );
}
