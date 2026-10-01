import type { Metadata } from "next";
import Link from "next/link";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamTable } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer } from "@/components/stats-table";
import { SelectNav } from "@/components/public/select-nav";
import { DATA_TABLE, NUM_CELL, RankBadge, SortedHead, tableBox } from "@/components/public/data-table";
import { Tabs, TeamLogo, cn } from "@/components/ui";
import { CARD, EmptyCard, PageHero, Wrap } from "@/components/primitives";

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
  const href = (nextTab: string, slug?: string | null) => {
    const params = new URLSearchParams({ tab: nextTab, ...(slug && { t: slug }) });
    return `/stats?${params}`;
  };

  return (
    <>
      <PageHero
        eyebrow="F16 Rating · Swing · карты"
        title="Статистика"
        lead="Каждое число — с наших серверов: убийства, раунды, вклад в победу."
        aside={
          tournaments.length > 0 ? (
            <SelectNav
              label="Турнир"
              value={t?.slug ?? ""}
              options={[
                { value: "", label: "Все турниры", href: href(tab) },
                ...tournaments.map((x) => ({ value: x.slug, label: x.name, href: href(tab, x.slug) })),
              ]}
            />
          ) : undefined
        }
      />

      <Wrap className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Tabs items={TABS.map((x) => ({ ...x, href: href(x.key, t?.slug) }))} active={tab} />
          <span className="t-meta pb-3">{t ? `Турнир: ${t.name}` : "Все турниры платформы"}</span>
        </div>

        <div className="mt-8">
          {tab === "players" && <PlayersTab tournamentId={t?.id} />}
          {tab === "teams" && <TeamsTab tournamentId={t?.id} />}
          {tab === "maps" && <MapsTab tournamentId={t?.id} />}
        </div>

        <div className="mt-14">
          <RatingExplainer />
        </div>
      </Wrap>
    </>
  );
}

const empty = (
  <EmptyCard
    dashed
    title="Статистика появится после первого матча"
    text="Рейтинги игроков, команд и карт считаются автоматически с игровых серверов F16 Arena."
  />
);

async function PlayersTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getPlayerLeaderboard(tournamentId);
  return rows.length ? (
    <div className={cn(CARD, "overflow-hidden")}>
      <PlayerStatsTable rows={rows} sticky />
    </div>
  ) : (
    empty
  );
}

async function TeamsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getTeamTable(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className={tableBox(true)}>
      <table className={cn(DATA_TABLE, "min-w-[760px]")}>
        <thead>
          <tr>
            <th className="w-14">#</th>
            <th>Команда</th>
            <th className="!text-right">Матчи</th>
            <th className="!text-right">
              <SortedHead>Победы</SortedHead>
            </th>
            <th className="!text-right">Win rate</th>
            <th className="!text-right">Карты</th>
            <th className="!text-right">Раунды</th>
            <th className="!text-right">±</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.roundsFor - r.roundsAgainst;
            const wr = Math.round((100 * r.wins) / Math.max(1, r.matches));
            return (
              <tr key={r.team.id}>
                <td>
                  <RankBadge n={i + 1} />
                </td>
                <td>
                  <Link href={`/teams/${r.team.tag}`} className="flex items-center gap-3 text-fg transition-colors hover:text-accent">
                    <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={32} />
                    <span className="font-semibold">{r.team.name}</span>
                    <span className="text-[12px] uppercase tracking-[0.16em] text-fg-3">{r.team.tag}</span>
                  </Link>
                </td>
                <td className={NUM_CELL}>{r.matches}</td>
                <td className={cn(NUM_CELL, "text-fg")}>{r.wins}</td>
                <td className={cn(NUM_CELL, wr >= 60 ? "text-ok" : wr < 40 ? "text-danger" : "")}>{wr}%</td>
                <td className={NUM_CELL}>
                  {r.mapWins}
                  <span className="text-fg-3">/{r.maps}</span>
                </td>
                <td className={NUM_CELL}>
                  {r.roundsFor}:{r.roundsAgainst}
                </td>
                <td className={cn(NUM_CELL, diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "")}>{diff > 0 ? `+${diff}` : diff}</td>
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
  const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
  return (
    <div className={tableBox(true)}>
      <table className={cn(DATA_TABLE, "min-w-[620px]")}>
        <thead>
          <tr>
            <th>Карта</th>
            <th className="!text-right">
              <SortedHead>Сыграно</SortedHead>
            </th>
            <th className="!text-right">Пики</th>
            <th className="!text-right">Баны</th>
            <th className="!text-right">Ср. раундов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.map}>
              <td>
                <div className="text-[16px] font-semibold text-fg">{mapName(r.map)}</div>
                <div className="mt-1.5 h-[3px] w-40 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${(r.played / maxPlayed) * 100}%` }} />
                </div>
              </td>
              <td className={cn(NUM_CELL, "text-fg")}>{r.played}</td>
              <td className={NUM_CELL}>{r.picked}</td>
              <td className={NUM_CELL}>{r.banned}</td>
              <td className={NUM_CELL}>{r.avgRounds ? r.avgRounds.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
