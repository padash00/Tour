import Link from "next/link";
import { formatDate, mapName } from "@/lib/format";
import type { HeadToHead, PlayerAgg, WeaponStat } from "@/lib/stats";
import type { Player } from "@/lib/types";
import { fmt, ratingColor, swingColor, weaponName } from "./stats-format";
import { HeadToHeadList } from "./head-to-head";
import { Avatar, FaceitLevel, TeamLogo, cn } from "./ui";
import { CARD, PageHero, SectionHead, Wrap } from "./primitives";
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

/** Убийства по оружию: доля от всех убийств и процент в голову, топ-8 */
function WeaponList({ weapons }: { weapons: WeaponStat[] }) {
  if (!weapons.length) return <p className="text-[14px] text-fg-3">Появится после первых убийств на наших серверах.</p>;
  // ножи разных скинов и варианты одного ствола сводим под одно имя
  const merged = new Map<string, WeaponStat>();
  for (const w of weapons) {
    const name = weaponName(w.weapon);
    const cur = merged.get(name) ?? { weapon: name, kills: 0, hs: 0 };
    cur.kills += w.kills;
    cur.hs += w.hs;
    merged.set(name, cur);
  }
  const list = [...merged.values()].sort((a, b) => b.kills - a.kills);
  const total = list.reduce((s, w) => s + w.kills, 0);
  return (
    <div>
      {list.slice(0, 8).map((w) => (
        <div key={w.weapon} className="border-b border-white/[0.06] py-3 last:border-0">
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate font-semibold text-fg">{w.weapon}</span>
            <span className="num text-[12px] text-fg-3">HS {fmt.pct((100 * w.hs) / w.kills)}</span>
            <span className="num w-20 text-right text-[13px] text-fg-2">
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
    { label: "F16 Rating", value: agg ? fmt.r(agg.rating) : "—", cls: agg ? ratingColor(agg.rating) : undefined },
    { label: "K/D", value: agg ? agg.kd.toFixed(2) : "—" },
    { label: "ADR", value: agg ? fmt.d1(agg.adr) : "—" },
    { label: "KAST", value: agg ? fmt.pct(agg.kast) : "—" },
    { label: "Swing", value: agg ? fmt.swing(agg.swing) : "—", cls: swingColor(agg?.swing ?? null) },
    { label: "Карты", value: String(agg?.maps ?? 0) },
  ];
  const maps = bestMaps(history);
  const form = history.slice(0, 5).map((h) => (h.scoreFor > h.scoreAgainst ? "W" : "L") as "W" | "L");
  const won = history.filter((h) => h.scoreFor > h.scoreAgainst).length;

  return (
    <>
      <PageHero
        media={
          <div className="relative shrink-0 rounded-full border border-white/[0.12] p-1.5 shadow-[var(--shadow-soft)]">
            <Avatar src={player.avatar_url} name={player.nickname} size={152} />
            {player.faceit_level ? (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-bg p-1">
                <FaceitLevel level={player.faceit_level} />
              </span>
            ) : null}
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
        aside={
          <div className="flex flex-col items-start gap-4 lg:items-end">
            {actions}
            <div className={cn(CARD, "w-full p-6 lg:min-w-[300px]")}>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-fg-3">Форма · последние карты</div>
              {form.length ? (
                <>
                  <FormStrip results={form} className="mt-4" />
                  <div className="num mt-4 text-[14px] text-fg-2">
                    <span className="text-ok">{won}W</span> · <span className="text-danger">{history.length - won}L</span>
                    <span className="text-fg-3"> · {history.length} карт</span>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-[14px] text-fg-3">Первая карта на F16 Arena впереди.</p>
              )}
            </div>
          </div>
        }
      >
        {/* КЛЮЧЕВЫЕ ЦИФРЫ — открытая типографика */}
        <div className="mt-12 grid grid-cols-3 gap-x-6 gap-y-8 border-t border-white/[0.06] pt-10 md:grid-cols-6">
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
          <dl className={cn(CARD, "grid grid-cols-2 gap-x-8 gap-y-4 px-6 py-6 text-[15px] sm:grid-cols-4 lg:grid-cols-6 lg:px-8")}>
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
              <div key={String(label)}>
                <dt className="text-[11px] uppercase tracking-[0.18em] text-fg-3">{label}</dt>
                <dd className="num mt-1 text-[18px] font-semibold text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {progress.length > 0 && (
          <section className={cn(CARD, "mt-14 p-6 lg:p-8 min-w-0")}>
            <SectionHead title="Прогресс по турнирам" />
            <ProgressTable items={progress} />
          </section>
        )}

        <div className="mt-14 grid lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
          <section className={cn(CARD, "p-6 lg:p-8 min-w-0")}>
            <SectionHead title="Последние матчи" />
            {history.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-white/[0.12] px-6 py-8">
                <div className="text-[16px] font-semibold text-fg">Матчей пока нет</div>
                <div className="mt-1 text-[14px] text-fg-3">История появится после первого участия в турнире.</div>
              </div>
            ) : (
              <div className="-mx-6 overflow-x-auto lg:-mx-8">
                <table className={cn(DATA_TABLE, "min-w-[600px] [&_th]:first:pl-6 [&_td]:first:pl-6 lg:[&_th]:first:pl-8 lg:[&_td]:first:pl-8")}>
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
                          <div className="text-[12px] text-fg-3">{h.tournament.name}</div>
                        </td>
                        <td>{mapName(h.mapName)}</td>
                        <td className={cn(NUM_CELL, h.scoreFor > h.scoreAgainst ? "text-ok" : "text-danger")}>
                          {h.scoreFor}:{h.scoreAgainst}
                        </td>
                        <td className={NUM_CELL}>
                          {h.stats.kills}–{h.stats.deaths}
                        </td>
                        <td className={NUM_CELL}>{fmt.d1(h.stats.adr)}</td>
                        <td className={cn(NUM_CELL, "font-semibold", ratingColor(h.stats.rating))}>{fmt.r(h.stats.rating)}</td>
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
                <p className="text-[14px] text-fg-3">Появятся после первых сыгранных карт.</p>
              ) : (
                <div>
                  {maps.map((m) => (
                    <div key={m.map} className="border-b border-white/[0.06] py-3.5 last:border-0">
                      <div className="flex items-center gap-4">
                        <span className="flex-1 font-semibold text-fg">{mapName(m.map)}</span>
                        <span className="num text-[13px] text-fg-3">
                          {m.wins}/{m.played} побед
                        </span>
                        <span className={cn("num w-12 text-right font-semibold", ratingColor(m.rating))}>{fmt.r(m.rating)}</span>
                      </div>
                      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={cn("h-full rounded-full bg-current opacity-70", ratingColor(m.rating))} style={{ width: `${Math.min(100, (m.rating / 1.6) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className={cn(CARD, "p-6 lg:p-8")}>
              <SectionHead title="Достижения" />
              <AwardsRow awards={awards} />
            </section>
          </div>
        </div>

        {(weapons.length > 0 || h2h.length > 0) && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2 items-start">
            <section className={cn(CARD, "p-6 lg:p-8 min-w-0")}>
              <SectionHead title="Оружие" />
              <WeaponList weapons={weapons} />
            </section>
            <section className={cn(CARD, "p-6 lg:p-8 min-w-0")}>
              <SectionHead title="Личные встречи" />
              <HeadToHeadList items={h2h} />
            </section>
          </div>
        )}
      </Wrap>
    </>
  );
}
