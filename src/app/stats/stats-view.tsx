import { notFound } from "next/navigation";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamStats, type MapAgg } from "@/lib/stats";
import { getMapImages } from "@/lib/settings";
import { tint } from "@/components/competition/map-tile";
import { PlayerStatsTable, RatingExplainer, TeamStatsTable } from "@/components/stats-table";
import { StatLeaders } from "@/components/stat-leaders";
import { SelectNav } from "@/components/public/select-nav";
import { ClientTabs, TabPanel } from "@/components/public/client-tabs";
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
  const [rows, images] = await Promise.all([getMapTable(tournamentId), getMapImages()]);
  if (!rows.length) return empty;
  const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
  // самые сыгранные — первыми; при равенстве — чаще пикают, реже банят; несыгранные — в конце
  const sorted = [...rows].sort((a, b) => b.played - a.played || b.picked - a.picked || a.banned - b.banned);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {sorted.map((r, i) => (
        <MapStatCard key={r.map} r={r} rank={i + 1} image={images[r.map] ?? null} maxPlayed={maxPlayed} />
      ))}
    </div>
  );
}

/** Карточка карты: обложка, место по популярности, цифры, соотношение пиков и банов */
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
    <article
      className={cn(
        "lift group relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0b1420]/90 hover:border-white/[0.18]",
        unplayed && "opacity-60 hover:opacity-100",
      )}
    >
      {/* обложка */}
      <div className="relative h-40 overflow-hidden sm:h-44" style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            loading="lazy"
            className={cn("media-zoom absolute inset-0 h-full w-full object-cover brightness-[0.72] saturate-[0.75]", unplayed && "grayscale")}
          />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,#ffffff14,transparent_60%)]" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-[#0b1420] via-[#0b1420]/40 to-transparent" />
        <span
          className={cn(
            "num absolute left-3 top-3 grid h-7 min-w-7 place-items-center rounded-[7px] px-1.5 text-[12px] font-semibold backdrop-blur-sm",
            rank === 1 && !unplayed ? "bg-accent text-accent-ink" : "bg-black/45 text-fg-2",
          )}
        >
          {rank}
        </span>
        {unplayed && (
          <span className="absolute right-3 top-3 rounded-[6px] bg-black/45 px-2 py-1 text-[11px] text-fg-3 backdrop-blur-sm">ещё не играли</span>
        )}
        <div className="absolute inset-x-4 bottom-3">
          <div className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{mapName(r.map)}</div>
        </div>
      </div>

      {/* цифры */}
      <div className="grid grid-cols-4 border-t border-white/[0.06]">
        {stats.map((s, j) => (
          <div key={s.label} className={cn("px-2 py-3 text-center", j > 0 && "border-l border-white/[0.06]")}>
            <div className="num text-[18px] font-semibold leading-none text-fg">{s.value}</div>
            <div className="mt-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-fg-3">{s.label}</div>
          </div>
        ))}
      </div>

      {/* пики против банов и популярность */}
      <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
        <div>
          <div className="mb-1.5 flex justify-between text-[11px] text-fg-3">
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
          <div className="mb-1.5 flex justify-between text-[11px] text-fg-3">
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
