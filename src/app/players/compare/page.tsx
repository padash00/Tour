import type { Metadata } from "next";
import Link from "next/link";
import { getPlayerBySteamId } from "@/lib/data";
import { mapName } from "@/lib/format";
import { aggregatePlayers, getHeadToHead, getPlayerMapHistory, getPlayerWeapons, getStatRows, type PlayerAgg, type WeaponStat } from "@/lib/stats";
import { db } from "@/lib/supabase";
import type { Player } from "@/lib/types";
import { ComparePicker, type PickPlayer } from "@/components/compare-picker";
import { fmt, weaponName } from "@/components/stats-format";
import { Avatar, EmptyState, Eyebrow, cn } from "@/components/ds";

const WRAP = "mx-auto w-full max-w-wide px-4 sm:px-6 lg:px-8";
const CARD = "rounded-surface border border-line-subtle bg-surface";

export const metadata: Metadata = { title: "Сравнение игроков", robots: { index: false } };

/*
 * Два игрока рядом: рейтинг, K/D, ADR, KAST, HS, Swing, лучшие карты, оружие, личные встречи.
 * Лучшее значение в строке подсвечено. /players/compare?a=<SteamID64>&b=<SteamID64>
 */

type Side = {
  player: Player;
  agg: PlayerAgg | null;
  maps: { map: string; played: number; wins: number; rating: number }[];
  weapons: WeaponStat[];
  teamIds: string[];
};

async function load(steam: string | undefined): Promise<Side | null> {
  if (!steam || !/^\d{17}$/.test(steam)) return null;
  const player = await getPlayerBySteamId(steam);
  if (!player) return null;
  const [rows, history] = await Promise.all([getStatRows({ playerId: player.id }), getPlayerMapHistory(player.id)]);
  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  const weapons = await getPlayerWeapons(player.steam_id, matchIds);
  const by = new Map<string, { map: string; played: number; wins: number; ratingSum: number }>();
  for (const h of history) {
    if (!h.mapName) continue;
    const cur = by.get(h.mapName) ?? { map: h.mapName, played: 0, wins: 0, ratingSum: 0 };
    cur.played++;
    if (h.scoreFor > h.scoreAgainst) cur.wins++;
    cur.ratingSum += h.stats.rating;
    by.set(h.mapName, cur);
  }
  return {
    player,
    agg: rows.length ? aggregatePlayers(rows)[0] : null,
    maps: [...by.values()].map((m) => ({ map: m.map, played: m.played, wins: m.wins, rating: m.ratingSum / m.played })).sort((a, b) => b.rating - a.rating).slice(0, 4),
    weapons: weapons.slice(0, 5),
    teamIds: [...new Set(rows.map((r) => r.team_id).filter(Boolean) as string[])],
  };
}

type Metric = { label: string; a: number | null; b: number | null; show: (v: number) => string; lowerBetter?: boolean };

function Row({ m }: { m: Metric }) {
  const both = m.a != null && m.b != null && m.a !== m.b;
  const aWins = both && (m.lowerBetter ? m.a! < m.b! : m.a! > m.b!);
  const bWins = both && !aWins;
  const cell = (v: number | null, win: boolean, right?: boolean) => (
    <div className={cn("num text-[18px] sm:text-[22px] font-semibold", right ? "text-left" : "text-right", v == null ? "text-fg-3" : win ? "text-ok" : "text-fg-2")}>
      {v == null ? "—" : m.show(v)}
    </div>
  );
  // доля полосы — чтобы разницу было видно и без чисел
  // для отрицательных значений (Swing) — сдвигаем обе величины к нулю снизу
  const lo = Math.min(0, m.a ?? 0, m.b ?? 0);
  const av = (m.a ?? 0) - lo;
  const bv = (m.b ?? 0) - lo;
  const total = av + bv;
  const share = total > 0 && m.a != null && m.b != null ? (m.lowerBetter ? bv / total : av / total) : 0.5;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 px-4 sm:px-6 py-3.5 border-b border-line-subtle last:border-0">
      {cell(m.a, aWins)}
      <div className="w-[96px] sm:w-[140px] text-center">
        <div className="text-[12px] sm:text-[13px] text-fg-3">{m.label}</div>
        <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full bg-accent/70 transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
          <div className="h-full flex-1 bg-warn/60" />
        </div>
      </div>
      {cell(m.b, bWins, true)}
    </div>
  );
}

function Head({ s, align, picker }: { s: Side; align: "left" | "right"; picker: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", align === "right" ? "items-start text-left" : "items-end text-right")}>
      <Link href={`/players/${s.player.steam_id}`} className={cn("group flex min-w-0 items-center gap-3", align === "left" && "flex-row-reverse")}>
        <span className={cn("rounded-full p-[3px]", align === "left" ? "bg-accent/40" : "bg-warn/40")}>
          <Avatar src={s.player.avatar_url} name={s.player.nickname} size="lg" />
        </span>
        <span className="min-w-0 break-words text-[18px] sm:text-[26px] font-semibold leading-tight group-hover:text-accent-strong">{s.player.nickname}</span>
      </Link>
      {picker}
    </div>
  );
}

export default async function ComparePage(props: PageProps<"/players/compare">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [a, b, pick] = await Promise.all([
    load(one(sp.a)),
    load(one(sp.b)),
    db().from("players").select("steam_id, nickname, avatar_url").eq("is_banned", false).order("nickname").limit(600),
  ]);
  const players = (pick.data ?? []) as PickPlayer[];

  if (!a || !b) {
    const base = a ?? b;
    return (
      <div className={cn(WRAP, "pt-14 pb-10 space-y-8")}>
        <div>
          <Eyebrow>Игроки F16 Arena</Eyebrow>
          <h1 className="mt-4 text-[36px] sm:text-[48px] font-semibold tracking-[-0.015em]">Сравнение игроков</h1>
        </div>
        {base ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-fg-2">Выберите, с кем сравнить {base.player.nickname}:</span>
            <ComparePicker self={base.player.steam_id} players={players} label="Выбрать игрока" />
          </div>
        ) : (
          <EmptyState title="Выберите двух игроков" text="Откройте профиль игрока и нажмите «Сравнить с игроком»." />
        )}
      </div>
    );
  }

  const A = a.agg;
  const B = b.agg;
  const metrics: Metric[] = [
    { label: "F16 Rating", a: A?.rating ?? null, b: B?.rating ?? null, show: fmt.r },
    { label: "K/D", a: A?.kd ?? null, b: B?.kd ?? null, show: (v) => v.toFixed(2) },
    { label: "ADR", a: A?.adr ?? null, b: B?.adr ?? null, show: fmt.d1 },
    { label: "KAST", a: A && A.kastRounds ? A.kast : null, b: B && B.kastRounds ? B.kast : null, show: fmt.pct },
    { label: "В голову", a: A?.hsPct ?? null, b: B?.hsPct ?? null, show: fmt.pct },
    { label: "Swing", a: A?.swing ?? null, b: B?.swing ?? null, show: (v) => fmt.swing(v) },
    { label: "Убийства", a: A?.kills ?? null, b: B?.kills ?? null, show: (v) => String(v) },
    { label: "Смерти", a: A?.deaths ?? null, b: B?.deaths ?? null, show: (v) => String(v), lowerBetter: true },
    { label: "Карты", a: A?.maps ?? null, b: B?.maps ?? null, show: (v) => String(v) },
  ];

  // личные встречи: матчи команд игрока A против команд игрока B
  const h2h = a.teamIds.length && b.teamIds.length ? (await getHeadToHead({ teamIds: a.teamIds })).filter((x) => b.teamIds.includes(x.opponent.id)) : [];
  const meet = h2h.reduce(
    (s, x) => ({ matches: s.matches + x.matches, wins: s.wins + x.wins, maps: s.maps + x.maps, mapWins: s.mapWins + x.mapWins }),
    { matches: 0, wins: 0, maps: 0, mapWins: 0 },
  );

  return (
    <div className={cn(WRAP, "pt-12 pb-10 space-y-10")}>
      <div>
        <Eyebrow>Сравнение игроков</Eyebrow>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <Head s={a} align="left" picker={<ComparePicker self={b.player.steam_id} other={b.player.steam_id} side="a" players={players} label="Другой" />} />
          <span className="text-[14px] font-semibold uppercase tracking-[0.2em] text-fg-3">vs</span>
          <Head s={b} align="right" picker={<ComparePicker self={a.player.steam_id} players={players} label="Другой" />} />
        </div>
      </div>

      {meet.matches > 0 && (
        <div className={cn(CARD, "flex flex-wrap items-center justify-center gap-x-8 gap-y-2 p-5 text-center")}>
          <span className="text-[13px] uppercase tracking-[0.18em] text-fg-3">Личные встречи</span>
          <span className="num text-[22px] font-semibold">
            <span className="text-accent">{meet.wins}</span>
            <span className="mx-1.5 text-fg-3">:</span>
            <span className="text-warn">{meet.matches - meet.wins}</span>
          </span>
          <span className="num text-[14px] text-fg-2">
            карты {meet.mapWins}:{meet.maps - meet.mapWins}
          </span>
        </div>
      )}

      {!A && !B ? (
        <EmptyState title="Статистики пока нет" text="Она появится, когда игроки сыграют матчи на серверах F16 Arena." />
      ) : (
        <div className={cn(CARD, "overflow-hidden")}>
          {metrics.map((m) => (
            <Row key={m.label} m={m} />
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {[a, b].map((s, i) => (
          <div key={s.player.id} className={cn(CARD, "p-5 sm:p-6 space-y-6")}>
            <div className={cn("text-[15px] font-semibold", i === 0 ? "text-accent" : "text-warn")}>{s.player.nickname}</div>
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-[0.2em] text-fg-3">Лучшие карты</div>
              {s.maps.length ? (
                <ul className="space-y-2">
                  {s.maps.map((m) => (
                    <li key={m.map} className="flex items-center justify-between gap-3 text-[14px]">
                      <span className="font-medium">{mapName(m.map)}</span>
                      <span className="num text-fg-3">
                        {m.wins}/{m.played} побед · <span className="text-fg-2">{m.rating.toFixed(2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-fg-3">Нет сыгранных карт</div>
              )}
            </div>
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-[0.2em] text-fg-3">Оружие</div>
              {s.weapons.length ? (
                <ul className="space-y-2">
                  {s.weapons.map((w) => (
                    <li key={w.weapon} className="flex items-center justify-between gap-3 text-[14px]">
                      <span className="font-medium">{weaponName(w.weapon)}</span>
                      <span className="num text-fg-3">
                        {w.kills} убийств · HS {w.kills ? Math.round((100 * w.hs) / w.kills) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-fg-3">Нет данных об оружии</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
