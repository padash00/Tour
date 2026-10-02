import type { MatchWithTeams } from "@/lib/matches";
import type { StandingRow } from "@/lib/formats";
import type { Team, Tournament } from "@/lib/types";
import type { MapRounds } from "@/lib/rounds";
import { LiveRefresh } from "../live-refresh";
import { BracketPanel, ChampionPanel, LeadersPanel, LivePanel, StandingsPanel, TvEmpty, UpcomingPanel, type TvLeader, type TvMap, type TvPlace } from "./panels";
import { TvShell, type TvPanel } from "./tv-shell";

export type TvData = {
  tournament: Pick<Tournament, "id" | "name" | "status" | "bracket_type" | "format">;
  matches: MatchWithTeams[];
  liveMaps: TvMap[];
  groups: { label: string | null; table: StandingRow[] }[];
  leaders: TvLeader[];
  mvp: (TvLeader & { by: "swing" | "rating"; swing: number | null }) | null;
  places: TvPlace[];
  /** раунды идущей карты каждого live-матча (лента под счётом) */
  liveRounds?: Record<string, MapRounds>;
};

/** Набор экранов турнира для ТВ — только то, что есть в данных */
export function TvView({ data, live = true }: { data: TvData; live?: boolean }) {
  const { tournament: t, matches } = data;
  const visible = matches.filter((m) => !(m.is_walkover && (!m.team1_id || !m.team2_id)) && m.status !== "cancelled");
  const liveMatches = visible.filter((m) => m.status === "live");
  const upcoming = visible
    .filter((m) => ["ready", "veto", "upcoming"].includes(m.status) && m.team1_id && m.team2_id)
    .sort((a, b) => {
      const o = { ready: 0, veto: 1, upcoming: 2 } as Record<string, number>;
      return o[a.status] - o[b.status] || (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") || a.number - b.number;
    });
  const playoff = visible.filter((m) => (m.stage ?? "playoff") === "playoff");
  const teams = new Map<string, Pick<Team, "id" | "name" | "tag" | "logo_url">>(
    matches.flatMap((m) => [m.team1, m.team2]).filter((x): x is Team => !!x).map((x) => [x.id, x]),
  );
  const swiss = t.bracket_type === "swiss" || t.bracket_type === "swiss_playoff";

  const panels: TvPanel[] = [];
  if (t.status === "finished" && data.places.length) {
    panels.push({ key: "champion", title: "Итоги турнира", node: <ChampionPanel places={data.places} mvpName={data.mvp?.name ?? null} /> });
  }
  if (liveMatches.length) panels.push({ key: "live", title: liveMatches.length > 1 ? "Сейчас в игре" : "Сейчас в игре · LIVE", node: <LivePanel matches={liveMatches} maps={data.liveMaps} all={visible} rounds={data.liveRounds} /> });
  if (data.groups.some((g) => g.table.length)) {
    panels.push({ key: "standings", title: swiss ? "Швейцарская система · таблица" : "Групповая стадия", node: <StandingsPanel groups={data.groups} teams={teams} swiss={swiss} /> });
  }
  if (playoff.length) panels.push({ key: "bracket", title: "Сетка плей-офф", node: <BracketPanel matches={playoff} /> });
  if (upcoming.length) panels.push({ key: "upcoming", title: "Ближайшие матчи", node: <UpcomingPanel matches={upcoming} all={visible} /> });
  if (data.leaders.length) panels.push({ key: "leaders", title: "Лидеры турнира", node: <LeadersPanel leaders={data.leaders} mvp={data.mvp} /> });

  if (!panels.length) {
    panels.push({
      key: "soon",
      title: t.name,
      node: (
        <TvEmpty
          title={t.status === "registration" ? "Идёт регистрация" : t.status === "checkin" ? "Идёт check-in" : "Скоро начало"}
          text="Сетка и матчи появятся здесь, как только турнир стартует."
        />
      ),
    });
  }

  return (
    <>
      {live && <LiveRefresh watch={`tournament:${t.id}`} intervalMs={3000} />}
      <TvShell panels={panels} tournament={t.name} />
    </>
  );
}
