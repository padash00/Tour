import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { getUpcomingMatches, type MatchWithTeams } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import { MatchListRow } from "@/components/match-row";
import { Button, Container, EmptyState, PageTitle, RowList, Section, Stack } from "@/components/ds";

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

function stageLabel(m: MatchWithTeams) {
  if (m.bracket === "grand_final") return "Гранд-финал";
  if (m.bracket === "lower") return `Нижняя сетка · раунд ${m.round}`;
  if (m.bracket === "group") return `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`;
  if (m.bracket === "swiss") return `Швейцарка · раунд ${m.round}`;
  return `Плей-офф · раунд ${m.round}`;
}

function meta(m: ListMatch, includeTime = true) {
  const when = includeTime ? m.scheduled_at ?? m.finished_at : null;
  return `${m.tournament.name} · ${stageLabel(m)} · BO${m.best_of}${when ? ` · ${formatDateTime(when)}` : ""}`;
}

export default async function MatchesPage() {
  const [active, finished] = await Promise.all([getUpcomingMatches(50), recentFinished()]);
  const current = active.filter((m) => ["veto", "ready", "live"].includes(m.status));
  const upcoming = active.filter((m) => m.status === "upcoming");

  const byDay = new Map<string, typeof upcoming>();
  for (const match of upcoming) {
    const key = match.scheduled_at ? formatDate(match.scheduled_at) : "Время не назначено";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(match);
  }

  return (
    <Container className="pb-16 pt-8 sm:pt-10">
      {current.length > 0 && <LiveRefresh watch="matches" intervalMs={4000} />}

      <header>
        <PageTitle>Матчи</PageTitle>
        <p className="mt-1 max-w-read text-meta text-fg-3">Текущие, ближайшие и завершённые матчи всех турниров F16 Arena.</p>
      </header>

      {active.length === 0 && finished.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Gamepad2 />}
          title="Матчей пока нет"
          text="Матчи появятся, когда будет опубликована сетка турнира."
          action={
            <Button href="/tournaments" variant="secondary" size="sm">
              Смотреть турниры
            </Button>
          }
        />
      ) : (
        <Stack className="mt-10">
          {current.length > 0 && (
            <Section title="Сейчас" description="LIVE, вето и матчи с готовым сервером.">
              <RowList>
                {current.map((match) => (
                  <MatchListRow key={match.id} m={match} meta={meta(match)} />
                ))}
              </RowList>
            </Section>
          )}

          <Section title="Скоро">
            {upcoming.length > 0 ? (
              <div className="space-y-7">
                {[...byDay].map(([day, items]) => (
                  <div key={day}>
                    <div className="mb-2 text-meta font-medium text-fg-3">{day}</div>
                    <RowList>
                      {items.map((match) => (
                        <MatchListRow key={match.id} m={match} meta={meta(match)} />
                      ))}
                    </RowList>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact title="Ближайших матчей нет" text="Новые матчи появятся после обновления сетки." />
            )}
          </Section>

          {finished.length > 0 && (
            <Section title="Завершённые" description="Последние сыгранные матчи.">
              <RowList>
                {finished.map((match) => (
                  <MatchListRow key={match.id} m={match} meta={meta(match)} />
                ))}
              </RowList>
            </Section>
          )}
        </Stack>
      )}
    </Container>
  );
}
