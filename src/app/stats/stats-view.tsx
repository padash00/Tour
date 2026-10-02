import { notFound } from "next/navigation";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamStats } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer, TeamStatsTable } from "@/components/stats-table";
import { StatLeaders } from "@/components/stat-leaders";
import { SelectNav } from "@/components/public/select-nav";
import { ClientTabs, TabPanel } from "@/components/public/client-tabs";
import { DATA_TABLE, NUM_CELL, SortedHead, tableBox } from "@/components/public/data-table";
import { cn } from "@/components/ui";
import { CARD, EmptyCard, PageHero, Wrap } from "@/components/primitives";

const TABS = [
  { key: "players", label: "Игроки" },
  { key: "teams", label: "Команды" },
  { key: "maps", label: "Карты" },
];

/**
 * Статистика: все три вкладки уже в HTML, переключение на клиенте (ClientTabs) —
 * страница одинакова для всех и отдаётся из кэша CDN. Турнир — в адресе: /stats/<slug>.
 */
export async function StatsView({ slug }: { slug: string | null }) {
  const tournaments = await listPublicTournaments();
  const t = slug ? (tournaments.find((x) => x.slug === slug) ?? null) : null;
  if (slug && !t) notFound();
  const href = (s?: string | null) => (s ? `/stats/${s}` : "/stats");

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
                { value: "", label: "Все турниры", href: href() },
                ...tournaments.map((x) => ({ value: x.slug, label: x.name, href: href(x.slug) })),
              ]}
            />
          ) : undefined
        }
      />

      <Wrap className="pt-10">
        <ClientTabs
          scope="stats"
          items={TABS}
          defaultKey="players"
          aside={<span className="t-meta pb-3">{t ? `Турнир: ${t.name}` : "Все турниры платформы"}</span>}
        />

        <div className="mt-8" data-tabs-scope="stats">
          <TabPanel tab="players" defaultKey="players">
            <PlayersTab tournamentId={t?.id} />
          </TabPanel>
          <TabPanel tab="teams" defaultKey="players">
            <TeamsTab tournamentId={t?.id} />
          </TabPanel>
          <TabPanel tab="maps" defaultKey="players">
            <MapsTab tournamentId={t?.id} />
          </TabPanel>
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
    <div className="space-y-6">
      <StatLeaders rows={rows} />
      <div className={cn(CARD, "overflow-hidden")}>
        <PlayerStatsTable rows={rows} sticky />
      </div>
    </div>
  ) : (
    empty
  );
}

async function TeamsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getTeamStats(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <TeamStatsTable rows={rows} />
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
