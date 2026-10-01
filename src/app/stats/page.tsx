import type { Metadata } from "next";
import Link from "next/link";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamTable } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer } from "@/components/stats-table";
import { Container, EmptyState, IconChart, PageHeader, TeamLogo, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Статистика" };

const TABS = [
  { key: "players", label: "Игроки" },
  { key: "teams", label: "Команды" },
  { key: "maps", label: "Карты" },
];

export default async function StatsPage(props: PageProps<"/stats">) {
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "players";
  const tournaments = await listPublicTournaments();
  const t = tournaments.find((x) => x.slug === sp.t) ?? null;
  const q = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ ...(t && { t: t.slug }), tab, ...extra });
    return `/stats?${params}`;
  };

  return (
    <Container>
      <PageHeader
        eyebrow="F16 Rating"
        title="Статистика"
        description="Показатели собираются прямо с игровых серверов F16: каждое убийство, урон, клатч и раунд."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {TABS.map((x) => (
            <Link
              key={x.key}
              href={q({ tab: x.key })}
              className={cn(
                "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
                x.key === tab ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2 hover:border-line-strong",
              )}
            >
              {x.label}
            </Link>
          ))}
        </div>
        {tournaments.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Link href={`/stats?tab=${tab}`} className={cn("px-2 py-1 rounded-md", !t ? "text-fg bg-white/[0.05]" : "text-fg-3 hover:text-fg-2")}>
              Все турниры
            </Link>
            {tournaments.map((x) => (
              <Link
                key={x.id}
                href={`/stats?tab=${tab}&t=${x.slug}`}
                className={cn("px-2 py-1 rounded-md", t?.id === x.id ? "text-fg bg-white/[0.05]" : "text-fg-3 hover:text-fg-2")}
              >
                {x.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {tab === "players" && <PlayersTab tournamentId={t?.id} />}
      {tab === "teams" && <TeamsTab tournamentId={t?.id} />}
      {tab === "maps" && <MapsTab tournamentId={t?.id} />}

      <div className="mt-10">
        <RatingExplainer />
      </div>
    </Container>
  );
}

const empty = (
  <EmptyState
    icon={<IconChart />}
    title="Статистика появится после первых матчей"
    description="Как только начнётся первый турнир, здесь появятся рейтинги игроков, команд и карт."
  />
);

async function PlayersTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getPlayerLeaderboard(tournamentId);
  return rows.length ? <PlayerStatsTable rows={rows} /> : empty;
}

async function TeamsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getTeamTable(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className="card overflow-x-auto">
      <table className="tbl min-w-[720px]">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Команда</th>
            <th className="text-right">Матчи</th>
            <th className="text-right">Победы</th>
            <th className="text-right">Win rate</th>
            <th className="text-right">Карты</th>
            <th className="text-right">Раунды</th>
            <th className="text-right">±</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.roundsFor - r.roundsAgainst;
            return (
              <tr key={r.team.id}>
                <td className="num text-fg-3">{i + 1}</td>
                <td>
                  <Link href={`/teams/${r.team.tag}`} className="flex items-center gap-3 text-fg hover:text-accent">
                    <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={28} />
                    <span className="font-medium">{r.team.name}</span>
                  </Link>
                </td>
                <td className="text-right num">{r.matches}</td>
                <td className="text-right num">{r.wins}</td>
                <td className="text-right num">{Math.round((100 * r.wins) / Math.max(1, r.matches))}%</td>
                <td className="text-right num">
                  {r.mapWins}
                  <span className="text-fg-3">/{r.maps}</span>
                </td>
                <td className="text-right num">
                  {r.roundsFor}:{r.roundsAgainst}
                </td>
                <td className={cn("text-right num", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "")}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function MapsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getMapTable(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className="card overflow-x-auto">
      <table className="tbl min-w-[560px]">
        <thead>
          <tr>
            <th>Карта</th>
            <th className="text-right">Сыграно</th>
            <th className="text-right">Пики</th>
            <th className="text-right">Баны</th>
            <th className="text-right">Ср. раундов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.map}>
              <td className="font-medium text-fg">{mapName(r.map)}</td>
              <td className="text-right num">{r.played}</td>
              <td className="text-right num">{r.picked}</td>
              <td className="text-right num">{r.banned}</td>
              <td className="text-right num">{r.avgRounds ? r.avgRounds.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
