import type { Metadata } from "next";
import { getUpcomingMatches, type MatchWithTeams } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { MatchLine } from "@/components/public/bits";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState } from "@/components/ui";
import { WRAP } from "@/components/public/home";
import { PageHero, SectionLabel } from "@/components/public/page-hero";

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
    <>
      {live.length > 0 && <LiveRefresh intervalMs={10000} />}
      <PageHero eyebrow="Матчи F16 Arena" title="Матчи" description="Live, ближайшие и сыгранные матчи всех турниров." />
      <div className={`${WRAP} pt-14`}>

      {active.length === 0 && finished.length === 0 ? (
        <EmptyState title="Матчей пока нет" description="Матчи появятся, когда будет опубликована сетка турнира." />
      ) : (
        <div className="space-y-16">
          {live.length > 0 && (
            <section>
              <SectionLabel>Сейчас в игре</SectionLabel>
              {live.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </section>
          )}
          <section>
            <SectionLabel>Ближайшие</SectionLabel>
            {next.length > 0 ? (
              next.map((m) => <MatchLine key={m.id} m={m} />)
            ) : (
              <p className="rounded-[12px] border border-dashed border-white/[0.12] px-8 py-7 text-[15px] lg:text-[17px] text-fg-3">
                Запланированных матчей нет.
              </p>
            )}
          </section>
          {finished.length > 0 && (
            <section>
              <SectionLabel>Завершённые</SectionLabel>
              {finished.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </section>
          )}
        </div>
      )}
      </div>
    </>
  );
}
