import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDate, mapName } from "@/lib/format";
import type { HeadToHead, PlayerAgg, WeaponStat } from "@/lib/stats";
import type { Player } from "@/lib/types";
import { fmt, ratingColor, swingColor, weaponName } from "./stats-format";
import { HeadToHeadList } from "./head-to-head";
import {
  Avatar,
  Container,
  EmptyState,
  FaceitLevel,
  Panel,
  Region,
  RowList,
  Section,
  SectionTitle,
  TeamLogo,
  cn,
} from "@/components/ds";
import { DATA_TABLE, NUM_CELL } from "./public/data-table";
import { FormStrip } from "./public/form-strip";
import { AwardsRow, ProgressTable } from "./public/awards";
import type { Award } from "@/lib/awards";
import type { ProgressItem } from "@/lib/progress";

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

function WeaponList({ weapons }: { weapons: WeaponStat[] }) {
  if (!weapons.length) return <p className="text-[14px] text-fg-3">Появится после первых убийств на наших серверах.</p>;
  const merged = new Map<string, WeaponStat>();
  for (const w of weapons) {
    const name = weaponName(w.weapon);
    const cur = merged.get(name) ?? { weapon: name, kills: 0, hs: 0 };
    cur.kills += w.kills;
    cur.hs += w.hs;
    merged.set(name, cur);
  }
  const list = [...merged.values()].sort((a, b) => b.kills - a.kills);
  const total = Math.max(1, list.reduce((sum, w) => sum + w.kills, 0));
  return (
    <div className="divide-y divide-line-subtle">
      {list.slice(0, 8).map((w) => (
        <div key={w.weapon} className="py-3 last:pb-0">
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate font-semibold text-fg">{w.weapon}</span>
            <span className="num text-meta text-fg-3">HS {fmt.pct((100 * w.hs) / Math.max(1, w.kills))}</span>
            <span className="num w-24 text-right text-meta text-fg-2">
              {w.kills} <span className="text-fg-3">· {fmt.pct((100 * w.kills) / total)}</span>
            </span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(100 * w.kills) / list[0].kills}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerProfile({
  player,
  team,
  actions,
  agg,
  history = [],
  tournaments = 0,
  awards = [],
  progress = [],
  weapons = [],
  h2h = [],
}: {
  player: Player;
  team: { name: string; tag: string; logo_url: string | null } | null;
  actions?: React.ReactNode;
  agg?: PlayerAgg | null;
  history?: MapHistoryItem[];
  tournaments?: number;
  awards?: Award[];
  progress?: ProgressItem[];
  weapons?: WeaponStat[];
  h2h?: HeadToHead[];
}) {
  const main = [
    { label: "F16 Rating", value: agg ? fmt.r(agg.rating) : "—", cls: agg ? ratingColor(agg.rating) : "text-fg-3" },
    { label: "K/D", value: agg ? agg.kd.toFixed(2) : "—", cls: "text-fg" },
    { label: "ADR", value: agg ? fmt.d1(agg.adr) : "—", cls: "text-fg" },
    { label: "KAST", value: agg ? fmt.pct(agg.kast) : "—", cls: "text-fg" },
    { label: "Swing", value: agg ? fmt.swing(agg.swing) : "—", cls: swingColor(agg?.swing ?? null) },
    { label: "Карты", value: String(agg?.maps ?? 0), cls: "text-fg" },
  ];
  const maps = bestMaps(history);
  const form = history.slice(0, 5).map((h) => (h.scoreFor > h.scoreAgainst ? "W" : "L") as "W" | "L");
  const won = history.filter((h) => h.scoreFor > h.scoreAgainst).length;

  return (
    <>
      <div className="border-b border-line-subtle bg-shell">
        <Container width="wide" className="py-8 sm:py-10">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-5 sm:gap-6">
              <div className="relative shrink-0">
                <Avatar src={player.avatar_url} name={player.nickname} size="xl" />
                {player.faceit_level ? (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-shell p-1">
                    <FaceitLevel level={player.faceit_level} />
                  </span>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">Игрок F16 Arena</div>
                <h1 className="mt-1 truncate text-[30px] font-semibold tracking-[-0.025em] text-fg sm:text-[36px]">{player.nickname}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-fg-2">
                  {team ? (
                    <Link href={`/teams/${team.tag}`} className="inline-flex items-center gap-2 hover:text-accent">
                      <TeamLogo src={team.logo_url} tag={team.tag} size="xs" />
                      {team.name}
                    </Link>
                  ) : (
                    <span className="text-fg-3">Без команды</span>
                  )}
                  {player.country && <span>{player.country}</span>}
                  <span className="text-fg-3">На платформе с {formatDate(player.created_at)}</span>
                  {player.profile_url && (
                    <a href={player.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                      Steam <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[14px]">
                  <FaceitLevel level={player.faceit_level} />
                  {player.faceit_nickname ? (
                    <a href={`https://www.faceit.com/ru/players/${player.faceit_nickname}`} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-fg">
                      FACEIT · <span className="num">{player.faceit_elo ?? "—"}</span> ELO
                    </a>
                  ) : (
                    <span className="text-fg-3">FACEIT-профиль не найден</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-4 lg:items-end">
              {actions}
              <div className="min-w-[260px]">
                <div className="text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">Форма · последние карты</div>
                {form.length ? (
                  <>
                    <FormStrip results={form} className="mt-3" />
                    <div className="num mt-3 text-meta text-fg-2">
                      <span className="text-ok">{won}W</span> · <span className="text-danger">{history.length - won}L</span>
                      <span className="text-fg-3"> · {history.length} карт</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-meta text-fg-3">Первая карта на F16 Arena впереди.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-x-5 gap-y-6 border-t border-line-subtle pt-7 md:grid-cols-6">
            {main.map((item, i) => (
              <div key={item.label} className={cn(i > 0 && "md:border-l md:border-line-subtle md:pl-5")}>
                <div className={cn("num text-[28px] font-semibold leading-none tracking-[-0.03em] sm:text-[34px]", item.cls)}>{item.value}</div>
                <div className="mt-2 text-micro uppercase tracking-[0.12em] text-fg-3">{item.label}</div>
              </div>
            ))}
          </div>
          {!agg && <p className="mt-5 text-meta text-fg-3">Статистика появится после первого матча на F16 Arena.</p>}
        </Container>
      </div>

      <Container width="wide" className="py-10 sm:py-12">
        {agg && (
          <Section title="Карьера">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
              {[
                ["Убийства", agg.kills],
                ["Смерти", agg.deaths],
                ["Ассисты", agg.assists],
                ["Entry", agg.firstKills + agg.firstDeaths ? `${agg.firstKills}/${agg.firstDeaths}` : "—"],
                ["Клатчи", agg.firstKills + agg.firstDeaths ? agg.clutches : "—"],
                ["Трейды", agg.trades],
                ["3K+", agg.k3 + agg.k4 + agg.k5],
                ["Ace", agg.k5],
                ["Турниров", tournaments],
                ["Матчей", agg.matches],
                ["Раундов", agg.rounds],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="text-micro uppercase tracking-[0.12em] text-fg-3">{label}</div>
                  <div className="num mt-1 text-[18px] font-semibold text-fg">{value}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </Container>

      {progress.length > 0 && (
        <Region>
          <Container width="wide">
            <Section title="Прогресс по турнирам">
              <Panel padded={false} className="overflow-hidden">
                <ProgressTable items={progress} />
              </Panel>
            </Section>
          </Container>
        </Region>
      )}

      <Container width="wide" className="py-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          <Section title="Последние матчи">
            {history.length === 0 ? (
              <EmptyState compact title="Матчей пока нет" text="История появится после первого участия в турнире." />
            ) : (
              <div className="overflow-x-auto rounded-surface border border-line-subtle bg-surface">
                <table className={cn(DATA_TABLE, "min-w-[600px]")}>
                  <thead>
                    <tr>
                      <th>Соперник</th>
                      <th>Карта</th>
                      <th className="!text-right">Счёт</th>
                      <th className="!text-right">K–D</th>
                      <th className="!text-right">ADR</th>
                      <th className="!text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.key}>
                        <td>
                          <Link href={`/matches/${h.matchId}`} className="font-semibold text-fg transition-colors hover:text-accent">
                            {h.opponent?.name ?? "—"}
                          </Link>
                          <div className="text-micro text-fg-3">{h.tournament.name}</div>
                        </td>
                        <td>{mapName(h.mapName)}</td>
                        <td className={cn(NUM_CELL, h.scoreFor > h.scoreAgainst ? "text-ok" : "text-danger")}>
                          {h.scoreFor}:{h.scoreAgainst}
                        </td>
                        <td className={NUM_CELL}>{h.stats.kills}–{h.stats.deaths}</td>
                        <td className={NUM_CELL}>{fmt.d1(h.stats.adr)}</td>
                        <td className={cn(NUM_CELL, "font-semibold", ratingColor(h.stats.rating))}>{fmt.r(h.stats.rating)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="space-y-10">
            <Section title="Лучшие карты">
              {maps.length === 0 ? (
                <p className="text-[14px] text-fg-3">Появятся после первых сыгранных карт.</p>
              ) : (
                <RowList>
                  {maps.map((m) => (
                    <div key={m.map} className="flex min-h-14 items-center gap-4 px-4 py-2.5">
                      <span className="flex-1 font-semibold text-fg">{mapName(m.map)}</span>
                      <span className="num text-meta text-fg-3">{m.wins}/{m.played} побед</span>
                      <span className={cn("num w-12 text-right font-semibold", ratingColor(m.rating))}>{fmt.r(m.rating)}</span>
                    </div>
                  ))}
                </RowList>
              )}
            </Section>
            <Section title="Достижения">
              <AwardsRow awards={awards} />
            </Section>
          </div>
        </div>
      </Container>

      {(weapons.length > 0 || h2h.length > 0) && (
        <Region>
          <Container width="wide">
            <div className="grid gap-10 lg:grid-cols-2">
              <Section title="Оружие">
                <Panel>
                  <WeaponList weapons={weapons} />
                </Panel>
              </Section>
              <Section title="Личные встречи">
                <Panel>
                  <HeadToHeadList items={h2h} />
                </Panel>
              </Section>
            </div>
          </Container>
        </Region>
      )}
    </>
  );
}
