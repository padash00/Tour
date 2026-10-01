import Link from "next/link";
import { formatDate, mapName } from "@/lib/format";
import type { PlayerAgg } from "@/lib/stats";
import type { Player } from "@/lib/types";
import { fmt, ratingColor } from "./stats-table";
import { Avatar, Card, Container, EmptyState, FaceitLevel, IconChart, SectionTitle, TeamLogo, cn } from "./ui";

export type MapHistoryItem = {
  key: string;
  matchId: string;
  tournament: { name: string; slug: string };
  opponent: { name: string; tag: string } | null;
  mapName: string;
  scoreFor: number;
  scoreAgainst: number;
  stats: PlayerAgg;
};

export function PlayerProfile({
  player,
  team,
  actions,
  agg,
  history = [],
  tournaments = 0,
}: {
  player: Player;
  team: { name: string; tag: string; logo_url: string | null } | null;
  actions?: React.ReactNode;
  agg?: PlayerAgg | null;
  history?: MapHistoryItem[];
  tournaments?: number;
}) {
  const stats = [
    { label: "Rating", value: agg ? fmt.r(agg.rating) : "—", cls: agg ? ratingColor(agg.rating) : "text-fg-3" },
    { label: "K/D", value: agg ? agg.kd.toFixed(2) : "—" },
    { label: "ADR", value: agg ? fmt.d1(agg.adr) : "—" },
    { label: "KAST", value: agg ? fmt.pct(agg.kast) : "—" },
    { label: "HS", value: agg ? fmt.pct(agg.hsPct) : "—" },
    { label: "Карты", value: String(agg?.maps ?? 0) },
  ];

  return (
    <>
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <Container className="relative py-14 flex flex-col md:flex-row md:items-center gap-8">
          <Avatar src={player.avatar_url} name={player.nickname} size={112} />
          <div className="flex-1 min-w-0">
            <div className="label">Игрок F16 Arena</div>
            <h1 className="mt-2 text-4xl md:text-5xl font-bold tracking-[-0.04em] truncate">{player.nickname}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-3">
              {team ? (
                <Link href={`/teams/${team.tag}`} className="inline-flex items-center gap-2 text-fg-2 hover:text-fg">
                  <TeamLogo src={team.logo_url} tag={team.tag} size={20} />
                  {team.name}
                </Link>
              ) : (
                <span>Без команды</span>
              )}
              {player.country && <span>{player.country}</span>}
              <span>На платформе с {formatDate(player.created_at)}</span>
              {player.profile_url && (
                <a href={player.profile_url} target="_blank" rel="noreferrer" className="hover:text-fg-2">
                  Steam ↗
                </a>
              )}
            </div>
          </div>
          <div className="card px-5 py-4 flex items-center gap-4">
            <FaceitLevel level={player.faceit_level} />
            <div>
              <div className="label">FACEIT</div>
              <div className="mt-0.5 font-semibold">
                {player.faceit_nickname ? (
                  <a href={`https://www.faceit.com/ru/players/${player.faceit_nickname}`} target="_blank" rel="noreferrer" className="hover:text-accent">
                    {player.faceit_elo ?? "—"} ELO
                  </a>
                ) : (
                  <span className="text-fg-3">Не найден</span>
                )}
              </div>
            </div>
          </div>
          {actions}
        </Container>
      </section>

      <Container className="pt-10 space-y-8">
        <div>
          <SectionTitle eyebrow="Статистика F16" title="Показатели" />
          <div className="card grid grid-cols-3 md:grid-cols-6 divide-x divide-line">
            {stats.map((s) => (
              <div key={s.label} className="p-5">
                <div className="label">{s.label}</div>
                <div className={cn("mt-2 text-2xl font-bold num", agg ? (s.cls ?? "text-fg") : "text-fg-3")}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        {agg && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              ["Убийства", agg.kills],
              ["Смерти", agg.deaths],
              ["Ассисты", agg.assists],
              ["Entry", `${agg.firstKills}/${agg.firstDeaths}`],
              ["Клатчи", agg.clutches],
              ["Трейды", agg.trades],
              ["3K+", agg.k3 + agg.k4 + agg.k5],
              ["Ace", agg.k5],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-4">
                <div className="label">{label}</div>
                <div className="mt-1.5 text-lg font-semibold num">{value}</div>
              </Card>
            ))}
          </div>
        )}
        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
          <div>
            <SectionTitle title="История карт" />
            {history.length === 0 ? (
              <EmptyState compact icon={<IconChart />} title="История матчей появится после первого участия" />
            ) : (
              <div className="card overflow-x-auto">
                <table className="tbl min-w-[560px] text-[13px]">
                  <thead>
                    <tr>
                      <th>Соперник</th>
                      <th>Карта</th>
                      <th className="text-right">Счёт</th>
                      <th className="text-right">K-D</th>
                      <th className="text-right">ADR</th>
                      <th className="text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.key}>
                        <td>
                          <Link href={`/matches/${h.matchId}`} className="text-fg hover:text-accent">
                            vs {h.opponent?.name ?? "—"}
                          </Link>
                          <div className="text-[11px] text-fg-3">{h.tournament.name}</div>
                        </td>
                        <td>{mapName(h.mapName)}</td>
                        <td className={cn("text-right num", h.scoreFor > h.scoreAgainst ? "text-ok" : "text-danger")}>
                          {h.scoreFor}:{h.scoreAgainst}
                        </td>
                        <td className="text-right num">
                          {h.stats.kills}-{h.stats.deaths}
                        </td>
                        <td className="text-right num">{fmt.d1(h.stats.adr)}</td>
                        <td className={cn("text-right num font-semibold", ratingColor(h.stats.rating))}>{fmt.r(h.stats.rating)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <SectionTitle title="Турниры F16" />
            <Card className="p-6 grid grid-cols-3 gap-4">
              <div><div className="label">Турниров</div><div className="mt-2 text-xl font-bold num">{tournaments}</div></div>
              <div><div className="label">Матчей</div><div className="mt-2 text-xl font-bold num">{agg?.matches ?? 0}</div></div>
              <div><div className="label">Раундов</div><div className="mt-2 text-xl font-bold num">{agg?.rounds ?? 0}</div></div>
            </Card>
          </div>
        </div>
      </Container>
    </>
  );
}
