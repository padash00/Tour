import Link from "next/link";
import { formatDate, mapName } from "@/lib/format";
import type { PlayerAgg } from "@/lib/stats";
import type { Player } from "@/lib/types";
import { fmt, ratingColor, swingColor } from "./stats-table";
import { Avatar, Container, EmptyState, FaceitLevel, Meta, TeamLogo, cn } from "./ui";

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

/** Лучшие карты игрока по истории: средний рейтинг, минимум одна карта */
function bestMaps(history: MapHistoryItem[]) {
  const by = new Map<string, { map: string; played: number; wins: number; ratingSum: number }>();
  for (const h of history) {
    const cur = by.get(h.mapName) ?? { map: h.mapName, played: 0, wins: 0, ratingSum: 0 };
    cur.played++;
    if (h.scoreFor > h.scoreAgainst) cur.wins++;
    cur.ratingSum += h.stats.rating;
    by.set(h.mapName, cur);
  }
  return [...by.values()]
    .map((m) => ({ ...m, rating: m.ratingSum / m.played }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);
}

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
  const main = [
    { label: "F16 Rating", value: agg ? fmt.r(agg.rating) : "—", cls: agg ? ratingColor(agg.rating) : undefined },
    { label: "K/D", value: agg ? agg.kd.toFixed(2) : "—" },
    { label: "ADR", value: agg ? fmt.d1(agg.adr) : "—" },
    { label: "KAST", value: agg ? fmt.pct(agg.kast) : "—" },
    { label: "Swing", value: agg ? fmt.swing(agg.swing) : "—", cls: swingColor(agg?.swing ?? null) },
    { label: "Карты", value: String(agg?.maps ?? 0) },
  ];
  const maps = bestMaps(history);

  return (
    <>
      <section className="atmos">
        <Container className="pt-16 pb-14 md:pt-24 md:pb-16 flex flex-col md:flex-row md:items-end gap-8 md:gap-10">
          <Avatar src={player.avatar_url} name={player.nickname} size={128} />
          <div className="flex-1 min-w-0">
            <h1 className="text-[44px] md:text-[64px] font-bold tracking-[-0.045em] leading-[0.95] truncate">{player.nickname}</h1>
            <Meta
              className="mt-5"
              items={[
                team ? (
                  <Link key="t" href={`/teams/${team.tag}`} className="inline-flex items-center gap-2 text-fg hover:text-accent">
                    <TeamLogo src={team.logo_url} tag={team.tag} size={20} />
                    {team.name}
                  </Link>
                ) : (
                  "Без команды"
                ),
                player.country,
                `На платформе с ${formatDate(player.created_at)}`,
                player.profile_url ? (
                  <a key="s" href={player.profile_url} target="_blank" rel="noreferrer" className="hover:text-fg">
                    Steam ↗
                  </a>
                ) : null,
              ]}
            />
            <div className="mt-6 flex items-center gap-3 text-sm">
              <FaceitLevel level={player.faceit_level} />
              {player.faceit_nickname ? (
                <a
                  href={`https://www.faceit.com/ru/players/${player.faceit_nickname}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg-2 hover:text-fg"
                >
                  FACEIT · <span className="num">{player.faceit_elo ?? "—"}</span> ELO
                </a>
              ) : (
                <span className="text-fg-3">FACEIT-профиль не найден</span>
              )}
            </div>
          </div>
          {actions}
        </Container>
      </section>

      <Container className="pt-14">
        {/* КЛЮЧЕВЫЕ ЦИФРЫ — крупная типографика без коробок */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-y-8 gap-x-6">
          {main.map((s) => (
            <div key={s.label}>
              <div
                className={cn(
                  "num text-[32px] md:text-[44px] font-semibold tracking-[-0.03em] leading-none",
                  agg ? (s.cls ?? "text-fg") : "text-fg-3",
                )}
              >
                {s.value}
              </div>
              <div className="mt-2 text-[13px] text-fg-3">{s.label}</div>
            </div>
          ))}
        </div>
        {!agg && <p className="mt-6 text-fg-3">Статистика появится после первого матча на F16 Arena.</p>}
        {agg && (
          <dl className="mt-10 pt-6 border-t border-white/[0.06] flex flex-wrap gap-x-10 gap-y-4 text-sm">
            {[
              ["Убийства", agg.kills],
              ["Смерти", agg.deaths],
              ["Ассисты", agg.assists],
              ["Entry", `${agg.firstKills}/${agg.firstDeaths}`],
              ["Клатчи", agg.clutches],
              ["Трейды", agg.trades],
              ["3K+", agg.k3 + agg.k4 + agg.k5],
              ["Ace", agg.k5],
              ["Турниров", tournaments],
              ["Матчей", agg.matches],
              ["Раундов", agg.rounds],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline gap-2">
                <dt className="text-fg-3">{label}</dt>
                <dd className="num font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-20 grid lg:grid-cols-[1.7fr_1fr] gap-14 items-start">
          <section>
            <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Последние матчи</h2>
            {history.length === 0 ? (
              <EmptyState compact title="Матчей пока нет" description="История появится после первого участия в турнире." />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="tbl min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Соперник</th>
                      <th>Карта</th>
                      <th className="text-right">Счёт</th>
                      <th className="text-right">K–D</th>
                      <th className="text-right">ADR</th>
                      <th className="text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.key}>
                        <td>
                          <Link href={`/matches/${h.matchId}`} className="text-fg hover:text-accent">
                            {h.opponent?.name ?? "—"}
                          </Link>
                          <div className="text-[12px] text-fg-3">{h.tournament.name}</div>
                        </td>
                        <td>{mapName(h.mapName)}</td>
                        <td className={cn("text-right num", h.scoreFor > h.scoreAgainst ? "text-ok" : "text-danger")}>
                          {h.scoreFor}:{h.scoreAgainst}
                        </td>
                        <td className="text-right num">
                          {h.stats.kills}–{h.stats.deaths}
                        </td>
                        <td className="text-right num">{fmt.d1(h.stats.adr)}</td>
                        <td className={cn("text-right num font-semibold", ratingColor(h.stats.rating))}>{fmt.r(h.stats.rating)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="space-y-14">
            <section>
              <h2 className="text-[22px] font-bold tracking-[-0.025em]">Лучшие карты</h2>
              {maps.length === 0 ? (
                <p className="mt-3 text-fg-3">Пока нет сыгранных карт.</p>
              ) : (
                <div className="mt-3">
                  {maps.map((m) => (
                    <div key={m.map} className="flex items-center gap-4 py-3 border-b border-white/[0.06]">
                      <span className="flex-1 font-medium">{mapName(m.map)}</span>
                      <span className="text-[13px] text-fg-3">
                        {m.wins}/{m.played}
                      </span>
                      <span className={cn("num w-12 text-right font-semibold", ratingColor(m.rating))}>{fmt.r(m.rating)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h2 className="text-[22px] font-bold tracking-[-0.025em]">Достижения</h2>
              <p className="mt-3 text-fg-3">Первые трофеи впереди.</p>
            </section>
          </div>
        </div>
      </Container>
    </>
  );
}
