import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { getUpcomingMatches, type MatchWithTeams } from "@/lib/matches";
import { THIRD_PLACE_TITLE } from "@/lib/bracket";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { visibleMatches } from "@/components/match-bits";
import { LiveRefresh } from "@/components/live-refresh";
import { MatchListRow } from "@/components/match-row";
import { Button, Container, EmptyState, PageTitle, RowList, Section, Stack } from "@/components/ds";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Матчи"),
    description: "Матчи турниров по CS2 на F16 Arena: идут сейчас, ближайшие и сыгранные — счёт по картам и статистика.",
    alternates: { canonical: "/matches" },
  };
}

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

function stageLabel(m: MatchWithTeams, t: T) {
  if (m.bracket === "grand_final") return t("Гранд-финал");
  if (m.bracket === "third_place") return t(THIRD_PLACE_TITLE);
  if (m.bracket === "lower") return t("Нижняя сетка · раунд {n}", { n: m.round });
  if (m.bracket === "group") return m.group_label ? t("Группа {g} · тур {n}", { g: m.group_label, n: m.round }) : t("тур {n}", { n: m.round });
  if (m.bracket === "swiss") return t("Швейцарка · раунд {n}", { n: m.round });
  return t("Плей-офф · раунд {n}", { n: m.round });
}

function meta(m: ListMatch, t: T, includeTime = true) {
  const when = includeTime ? m.scheduled_at ?? m.finished_at : null;
  return `${m.tournament.name} · ${stageLabel(m, t)} · BO${m.best_of}${when ? ` · ${formatDateTime(when, t.lang)}` : ""}`;
}

export default async function MatchesPage() {
  const t = await getT();
  const [active, finished] = await Promise.all([getUpcomingMatches(50), recentFinished()]);
  const current = active.filter((m) => ["veto", "ready", "live"].includes(m.status));
  const upcoming = active.filter((m) => m.status === "upcoming");

  const byDay = new Map<string, typeof upcoming>();
  for (const match of upcoming) {
    const key = match.scheduled_at ? formatDate(match.scheduled_at, t.lang) : t("Время не назначено");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(match);
  }

  return (
    <Container className="pb-16 pt-8 sm:pt-10">
      {current.length > 0 && <LiveRefresh watch="matches" intervalMs={4000} />}

      <header>
        <PageTitle>{t("Матчи")}</PageTitle>
        <p className="mt-1 max-w-read text-meta text-fg-3">{t("Текущие, ближайшие и завершённые матчи всех турниров F16 Arena.")}</p>
      </header>

      {active.length === 0 && finished.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Gamepad2 />}
          title={t("Матчей пока нет")}
          text={t("Матчи появятся, когда будет опубликована сетка турнира.")}
          action={
            <Button href="/tournaments" variant="secondary" size="sm">
              {t("Смотреть турниры")}
            </Button>
          }
        />
      ) : (
        <Stack className="mt-10">
          {current.length > 0 && (
            <Section title={t("Сейчас")} description={t("LIVE, вето и матчи с готовым сервером.")}>
              <RowList>
                {current.map((match) => (
                  <MatchListRow key={match.id} m={match} meta={meta(match, t)} />
                ))}
              </RowList>
            </Section>
          )}

          <Section title={t("Скоро")}>
            {upcoming.length > 0 ? (
              <div className="space-y-7">
                {[...byDay].map(([day, items]) => (
                  <div key={day}>
                    <div className="mb-2 text-meta font-medium text-fg-3">{day}</div>
                    <RowList>
                      {items.map((match) => (
                        <MatchListRow key={match.id} m={match} meta={meta(match, t)} />
                      ))}
                    </RowList>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact title={t("Ближайших матчей нет")} text={t("Новые матчи появятся после обновления сетки.")} />
            )}
          </Section>

          {finished.length > 0 && (
            <Section title={t("Завершённые")} description={t("Последние сыгранные матчи.")}>
              <RowList>
                {finished.map((match) => (
                  <MatchListRow key={match.id} m={match} meta={meta(match, t)} />
                ))}
              </RowList>
            </Section>
          )}
        </Stack>
      )}
    </Container>
  );
}
