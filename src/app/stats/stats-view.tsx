import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamStats, type MapAgg } from "@/lib/stats";
import { getMapImages } from "@/lib/settings";
import { tint } from "@/components/competition/map-tile";
import { PlayerStatsTable, RatingExplainer, TeamStatsTable } from "@/components/stats-table";
import { StatLeaders } from "@/components/stat-leaders";
import { SelectNav } from "@/components/public/select-nav";
import { ClientTabs, TabPanel } from "@/components/public/client-tabs";
import { Container, EmptyState, PageTitle, Panel, cn } from "@/components/ds";

const TABS = [
  { key: "players", label: "Игроки" },
  { key: "teams", label: "Команды" },
  { key: "maps", label: "Карты" },
];

export async function StatsView({ slug }: { slug: string | null }) {
  const tournaments = await listPublicTournaments();
  const tournament = slug ? (tournaments.find((x) => x.slug === slug) ?? null) : null;
  if (slug && !tournament) notFound();
  const href = (s?: string | null) => (s ? `/stats/${s}` : "/stats");

  return (
    <Container width="wide" className="pb-16 pt-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <PageTitle>Статистика</PageTitle>
          <p className="mt-1 max-w-read text-meta text-fg-3">
            F16 Rating, Swing, команды и карты — только данные матчей с серверов F16 Arena.
          </p>
        </div>

        {tournaments.length > 0 && (
          <SelectNav
            label="Турнир"
            value={tournament?.slug ?? ""}
            options={[
              { value: "", label: "Все турниры", href: href() },
              ...tournaments.map((x) => ({ value: x.slug, label: x.name, href: href(x.slug) })),
            ]}
          />
        )}
      </header>

      <div className="mt-8">
        <ClientTabs
          scope="stats"
          items={TABS}
          defaultKey="players"
          aside={<span className="t-meta pb-3">{tournament ? tournament.name : "Все турниры платформы"}</span>}
        />
      </div>

      <div className="mt-8" data-tabs-scope="stats">
        <TabPanel tab="players" defaultKey="players">
          <PlayersTab tournamentId={tournament?.id} />
        </TabPanel>
        <TabPanel tab="teams" defaultKey="players">
          <TeamsTab tournamentId={tournament?.id} />
        </TabPanel>
        <TabPanel tab="maps" defaultKey="players">
          <MapsTab tournamentId={tournament?.id} />
        </TabPanel>
      </div>

      <div className="mt-14">
        <RatingExplainer />
      </div>
    </Container>
  );
}

const empty = (
  <EmptyState
    icon={<BarChart3 />}
    title="Статистика появится после первого матча"
    text="Рейтинги игроков, команд и карт считаются автоматически с игровых серверов F16 Arena."
  />
);

async function PlayersTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getPlayerLeaderboard(tournamentId);
  return rows.length ? (
    <div className="space-y-6">
      <StatLeaders rows={rows} />
      <Panel padded={false} className="overflow-hidden">
        <PlayerStatsTable rows={rows} sticky />
      </Panel>
    </div>
  ) : (
    empty
  );
}

async function TeamsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getTeamStats(tournamentId);
  if (!rows.length) return empty;
  return (
    <Panel padded={false} className="overflow-hidden">
      <TeamStatsTable rows={rows} />
    </Panel>
  );
}

async function MapsTab({ tournamentId }: { tournamentId?: string }) {
  const [rows, images] = await Promise.all([getMapTable(tournamentId), getMapImages()]);
  if (!rows.length) return empty;
  const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
  const sorted = [...rows].sort((a, b) => b.played - a.played || b.picked - a.picked || a.banned - b.banned);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {sorted.map((row, i) => (
        <MapStatCard key={row.map} r={row} rank={i + 1} image={images[row.map] ?? null} maxPlayed={maxPlayed} />
      ))}
    </div>
  );
}

function MapStatCard({ r, rank, image, maxPlayed }: { r: MapAgg; rank: number; image: string | null; maxPlayed: number }) {
  const [a, b] = tint(r.map);
  const unplayed = r.played === 0;
  const votes = r.picked + r.banned;
  const pickShare = votes ? (100 * r.picked) / votes : 0;
  const stats = [
    { label: "Сыграно", value: r.played },
    { label: "Пики", value: r.picked },
    { label: "Баны", value: r.banned },
    { label: "≈ раундов", value: r.avgRounds ? r.avgRounds.toFixed(1) : "—" },
  ];

  return (
    <article className={cn("group overflow-hidden rounded-surface border border-line-subtle bg-surface transition-colors hover:border-line-strong", unplayed && "opacity-60 hover:opacity-100")}>
      <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className={cn("absolute inset-0 h-full w-full object-cover brightness-[0.72] saturate-[0.75]", unplayed && "grayscale")} />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,#ffffff14,transparent_60%)]" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
        <span className={cn("num absolute left-3 top-3 grid h-7 min-w-7 place-items-center rounded-control px-1.5 text-meta font-semibold backdrop-blur-sm", rank === 1 && !unplayed ? "bg-accent text-accent-ink" : "bg-black/45 text-fg-2")}>
          {rank}
        </span>
        {unplayed && <span className="absolute right-3 top-3 rounded-control bg-black/45 px-2 py-1 text-micro text-fg-3 backdrop-blur-sm">ещё не играли</span>}
        <div className="absolute inset-x-4 bottom-3 text-[22px] font-semibold tracking-[-0.02em] text-fg">{mapName(r.map)}</div>
      </div>

      <div className="grid grid-cols-4 border-t border-line-subtle">
        {stats.map((stat, i) => (
          <div key={stat.label} className={cn("px-2 py-3 text-center", i > 0 && "border-l border-line-subtle")}>
            <div className="num text-[17px] font-semibold leading-none text-fg">{stat.value}</div>
            <div className="mt-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-fg-3">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-line-subtle px-4 py-3.5">
        <div>
          <div className="mb-1.5 flex justify-between text-micro text-fg-3">
            <span className="text-ok/90">пики {votes ? `${Math.round(pickShare)}%` : "—"}</span>
            <span className="text-danger/80">баны {votes ? `${Math.round(100 - pickShare)}%` : "—"}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            {votes > 0 && (
              <>
                <span className="h-full bg-ok/70" style={{ width: `${pickShare}%` }} />
                <span className="h-full bg-danger/60" style={{ width: `${100 - pickShare}%` }} />
              </>
            )}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-micro text-fg-3">
            <span>популярность</span>
            <span className="num">{Math.round((100 * r.played) / maxPlayed)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full bg-accent/75" style={{ width: `${(100 * r.played) / maxPlayed}%` }} />
          </div>
        </div>
      </div>
    </article>
  );
}
