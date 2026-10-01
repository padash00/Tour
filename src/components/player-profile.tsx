import Link from "next/link";
import { formatDate, mapName } from "@/lib/format";
import type { PlayerAgg } from "@/lib/stats";
import type { Player } from "@/lib/types";
import { fmt, ratingColor, swingColor } from "./stats-table";
import { Avatar, FaceitLevel, TeamLogo, cn } from "./ui";
import { CARD, PageHero, SectionHead, Wrap } from "./public/page-kit";

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
      <PageHero
        media={
          <div className="shrink-0 rounded-full border border-white/[0.1] p-1.5">
            <Avatar src={player.avatar_url} name={player.nickname} size={136} />
          </div>
        }
        eyebrow="Игрок F16 Arena"
        title={player.nickname}
        lead={
          <>
            <div className="flex flex-wrap items-center gap-y-2 text-[15px] lg:text-[17px] text-fg">
              {[
                team ? (
                  <Link key="t" href={`/teams/${team.tag}`} className="inline-flex items-center gap-2 hover:text-accent">
                    <TeamLogo src={team.logo_url} tag={team.tag} size={22} />
                    {team.name}
                  </Link>
                ) : (
                  "Без команды"
                ),
                player.country,
                `С ${formatDate(player.created_at)}`,
                player.profile_url ? (
                  <a key="s" href={player.profile_url} target="_blank" rel="noreferrer" className="hover:text-accent">
                    Steam ↗
                  </a>
                ) : null,
              ]
                .filter(Boolean)
                .map((x, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && <span className="mx-4 h-4 w-px bg-white/20" />}
                    {x}
                  </span>
                ))}
            </div>
            <div className="mt-5 flex items-center gap-3 text-[15px]">
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
          </>
        }
        aside={actions}
      >
        {/* КЛЮЧЕВЫЕ ЦИФРЫ — открытая типографика */}
        <div className="mt-12 grid grid-cols-3 md:grid-cols-6 gap-y-8 gap-x-6 border-t border-white/[0.06] pt-10">
          {main.map((s, i) => (
            <div key={s.label} className={cn(i > 0 && "md:border-l md:border-white/[0.06] md:pl-6")}>
              <div
                className={cn(
                  "num font-semibold tracking-[-0.03em] leading-none",
                  i === 0 ? "text-[40px] md:text-[56px]" : "text-[30px] md:text-[42px]",
                  agg ? (s.cls ?? "text-fg") : "text-fg-3",
                )}
              >
                {s.value}
              </div>
              <div className="mt-3 text-[12px] uppercase tracking-[0.2em] text-fg-3">{s.label}</div>
            </div>
          ))}
        </div>
        {!agg && <p className="mt-6 text-fg-3">Статистика появится после первого матча на F16 Arena.</p>}
      </PageHero>

      <Wrap className="pt-14">
        {/* ДЕТАЛИ */}
        {agg && (
          <dl className={cn(CARD, "flex flex-wrap gap-x-10 gap-y-4 px-8 py-6 text-[15px]")}>
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

        <div className="mt-14 grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
          <section className={cn(CARD, "p-6 lg:p-8 min-w-0")}>
            <SectionHead title="Последние матчи" />
            {history.length === 0 ? (
              <div>
                <div className="text-[17px] font-semibold text-fg">Матчей пока нет</div>
                <div className="mt-1 text-[15px] text-fg-3">История появится после первого участия в турнире.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
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

          <div className="space-y-4">
            <section className={cn(CARD, "p-6 lg:p-8")}>
              <SectionHead title="Лучшие карты" />
              {maps.length === 0 ? (
                <p className="text-fg-3">Пока нет сыгранных карт.</p>
              ) : (
                <div>
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
            <section className={cn(CARD, "p-6 lg:p-8")}>
              <SectionHead title="Достижения" />
              <p className="text-fg-3">Первые трофеи впереди.</p>
            </section>
          </div>
        </div>
      </Wrap>
    </>
  );
}
