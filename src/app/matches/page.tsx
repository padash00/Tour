import type { Metadata } from "next";
import { getUpcomingMatches, type MatchWithTeams } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { MatchLine } from "@/components/public/bits";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import { Button, EmptyCard, PageHero, SectionHead, WRAP } from "@/components/primitives";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

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
      {live.length > 0 && <LiveRefresh watch="matches" intervalMs={4000} />}
      <PageHero eyebrow="Матчи F16 Arena" title="Матчи" description="Live, ближайшие и сыгранные матчи всех турниров." />
      <div className={`${WRAP} pt-14`}>

      {active.length === 0 && finished.length === 0 ? (
        <EmptyCard
          dashed
          title="Матчей пока нет"
          text="Матчи появятся, когда будет опубликована сетка турнира."
          action={
            <Button href="/tournaments" variant="secondary" size="md">
              Турниры
            </Button>
          }
        />
      ) : (
        <div className="space-y-16">
          {live.length > 0 && (
            <section>
              <SectionHead>
                <span className="inline-flex items-center gap-2.5 text-live">
                  <span className="size-2 rounded-full bg-live animate-pulse" />
                  Сейчас в игре
                </span>
              </SectionHead>
<div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-1.5">
                {live.map((m) => (
                  <MatchLine key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionHead>Ближайшие</SectionHead>
            {next.length > 0 ? (
<div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-1.5">
                {next.map((m) => (
                  <MatchLine key={m.id} m={m} />
                ))}
              </div>
            ) : (
              <p className="rounded-[12px] border border-dashed border-white/[0.12] px-8 py-7 text-[15px] lg:text-[17px] text-fg-3">
                Запланированных матчей нет.
              </p>
            )}
          </section>
          {finished.length > 0 && (
            <section>
              <SectionHead>Завершённые</SectionHead>
<div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-1.5">
                {finished.map((m) => (
                  <MatchLine key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </>
  );
}
