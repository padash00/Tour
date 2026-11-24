import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Avatar, EmptyState, Section, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { MapThumb } from "@/components/lobby/settings";
import { DATA_TABLE, NUM_CELL, RankBadge, SortedHead, tableBox } from "@/components/public/data-table";
import { SelectNav } from "@/components/public/select-nav";
import type { T } from "@/lib/i18n/core";
import { mapLabel } from "@/lib/maps";
import { SEASON_MIN_MAPS, MAP_MIN, RADAR_AXES, ROLE_MIN_MAPS, ROLES, TWENTY_MIN_MAPS, type MapBoard, type RoleKey, type TwentyRow } from "@/lib/twenty-core";
import type { TwentyPlayer } from "@/lib/twenty";
import { money } from "./money";
import { MapHero, SectionHead } from "./panels";
import { BestMapChip, Radar, RatingPill, RoleChip, Streak, Trend, heatTone } from "./bits";

/* Вкладки раздела «Микс». Все — серверные: данные и переводчик приходят со страницы. */

export type Who = (steamId: string, fallback?: string | null) => TwentyPlayer;
/** Ник и аватар игрока: из базы, а если его там нет — ник из статистики сервера */
export const whoOf =
  (players: Record<string, TwentyPlayer>): Who =>
  (steamId, fallback) =>
    players[steamId] ?? { nickname: fallback ?? steamId, avatar_url: null };

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

// ───────────────────────── рейтинг

export const SORTS = ["rating", "maps", "wins", "kills", "diff", "kd", "adr", "hs", "mvp"] as const;
export type SortKey = (typeof SORTS)[number];
const SORT_VALUE: Record<SortKey, (r: TwentyRow) => number> = {
  rating: (r) => r.rating,
  maps: (r) => r.maps,
  wins: (r) => r.wins,
  kills: (r) => r.kills,
  diff: (r) => r.kills - r.deaths,
  kd: (r) => r.kd,
  adr: (r) => r.adr,
  hs: (r) => r.hsPct,
  mvp: (r) => r.mvp,
};

/**
 * Таблица рейтинга. Место игрока — всегда его место по рейтингу, как бы таблица ни была отсортирована.
 * В сезоне места есть только у набравших карты для зачёта; остальные идут ниже с пометкой, сколько карт осталось.
 */
export function RatingTable({ rows, who, t, meSteamId, sort = "rating", sortHref, season = false }: { rows: TwentyRow[]; who: Who; t: T; meSteamId: string | null; sort?: SortKey; sortHref?: (key: SortKey) => string; season?: boolean }) {
  const place = new Map(rows.map((r, i) => [r.steam_id, r.qualified ? i + 1 : null]));
  const list = sort === "rating" ? rows : [...rows].sort((x, y) => SORT_VALUE[sort](y) - SORT_VALUE[sort](x) || y.rating - x.rating);
  const columns: [SortKey, string][] = [["maps", t("Карт")], ["wins", t("Побед")], ["kills", t("У–С")], ["diff", "±"], ["kd", "K/D"], ["adr", "ADR"], ["hs", "HS%"], ["mvp", "MVP"]];
  const head = (key: SortKey, label: string) => {
    const inner = sort === key ? <SortedHead>{label}</SortedHead> : label;
    return sortHref ? (
      <Link href={sortHref(key)} scroll={false} title={t("Сортировать по столбцу «{name}»", { name: label })} className="inline-flex items-center hover:text-fg">
        {inner}
      </Link>
    ) : (
      inner
    );
  };
  return (
    <div className={tableBox()}>
      <table className={cn(DATA_TABLE, "min-w-[900px]")}>
        <thead>
          <tr>
            <th className="w-14">#</th>
            <th className="min-w-[230px]">{t("Игрок")}</th>
            {columns.map(([key, label]) => (
              <th key={key} className="w-[74px] !text-right">
                {head(key, label)}
              </th>
            ))}
            <th className="w-[150px] !text-right">{head("rating", t("Рейтинг"))}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const p = who(r.steam_id, r.name);
            const me = meSteamId === r.steam_id;
            const diff = r.kills - r.deaths;
            const n = place.get(r.steam_id) ?? null;
            return (
              <tr key={r.steam_id} className={cn(me ? "bg-accent-dim/70" : n === 1 ? "bg-gold/[0.07]" : n != null && n <= 3 ? "bg-ink/[0.02]" : undefined)}>
                <td>{n != null ? <RankBadge n={n} /> : <span className="inline-grid size-8 place-items-center text-fg-4" title={t("Вне зачёта сезона")}>—</span>}</td>
                <td className="!h-auto py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                    <div className="min-w-0">
                      <Link href={`/players/${r.steam_id}`} className="flex min-w-0 items-center gap-2 text-fg hover:text-accent">
                        <span className={cn("truncate", n != null && n <= 3 ? "text-[16px] font-bold" : "font-semibold")}>{p.nickname}</span>
                        {n === 1 && <span className="shrink-0 text-gold">{Icon.crown("size-4")}</span>}
                        {me && <span className="shrink-0 rounded-chip bg-accent px-1.5 py-0.5 text-micro font-semibold text-accent-ink">{t("вы")}</span>}
                        {r.prize != null && <span className="num shrink-0 rounded-chip bg-gold/20 px-1.5 py-0.5 text-micro font-bold text-gold">{money(r.prize, t)}</span>}
                      </Link>
                      {(r.role || r.best || r.streak >= 3 || !r.qualified) && (
                        <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
                          {season && !r.qualified && <span className="shrink-0 rounded-chip bg-ink/[0.06] px-1.5 py-0.5 text-micro font-semibold text-fg-3">{t("до зачёта карт: {n}", { n: SEASON_MIN_MAPS - r.maps })}</span>}
                          <RoleChip role={r.role} t={t} />
                          <BestMapChip cell={r.best} t={t} />
                          <Streak n={r.streak} t={t} />
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className={NUM_CELL}>{r.maps}</td>
                <td className={NUM_CELL}>
                  <span className={cn(r.wins > 0 && "font-semibold text-fg")}>{r.wins}</span>
                  <span className="text-fg-4">/{r.matches}</span>
                </td>
                <td className={cn(NUM_CELL, "whitespace-nowrap")}>
                  {r.kills}–{r.deaths}
                </td>
                <td className={cn(NUM_CELL, "font-semibold", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "text-fg-3")}>{diff > 0 ? `+${diff}` : diff}</td>
                <td className={cn(NUM_CELL, r.kd >= 1 ? "text-fg" : "text-fg-3")}>{r.kd.toFixed(2)}</td>
                <td className={NUM_CELL}>{Math.round(r.adr)}</td>
                <td className={NUM_CELL}>{Math.round(r.hsPct)}%</td>
                <td className={NUM_CELL}>{r.mvp}</td>
                <td className="text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <Trend value={r.trend} t={t} />
                    <RatingPill value={r.rating} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── карты

export function MapsTab({ boards, rows, who, t, images, selected, href, meSteamId }: { boards: MapBoard[]; rows: TwentyRow[]; who: Who; t: T; images: Record<string, string>; selected: string | null; href: (params: Record<string, string>) => string; meSteamId: string | null }) {
  if (!boards.length) return <EmptyState title={t("Карт пока нет")} text={t("Рейтинг по картам появится после первых сыгранных матчей.")} />;
  const board = boards.find((b) => b.map === selected) ?? boards[0];
  const maps = boards.map((b) => b.map);
  // в матрице — те, у кого есть хотя бы одна карта с порогом; остальным показывать нечего
  const matrix = rows.filter((r) => r.byMap.some((c) => c.maps >= MAP_MIN)).slice(0, 40);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {boards.map((b) => {
          const active = b.map === board.map;
          return (
            <Link key={b.map} href={href({ map: b.map })} scroll={false} aria-current={active ? "true" : undefined}>
              <MapThumb map={b.map} image={images[b.map]} className={cn("h-16 rounded-control border-2 transition-[border-color,opacity]", active ? "border-accent" : "border-transparent opacity-75 hover:opacity-100")}>
                <span className="absolute inset-x-2.5 bottom-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-bold text-white">{mapLabel(b.map)}</span>
                  <span className="num shrink-0 text-[11px] font-semibold text-white/80">{b.played}</span>
                </span>
              </MapThumb>
            </Link>
          );
        })}
      </div>

      <MapHero board={board} image={images[board.map]} who={who} t={t} />

      <section aria-label={mapLabel(board.map)}>
        <SectionHead title={t("Рейтинг на {map}", { map: mapLabel(board.map) })} meta={t("Игроков в таблице: {n}", { n: board.rows.length })} />
        <div className={tableBox()}>
          <table className={cn(DATA_TABLE, "min-w-[760px]")}>
            <thead>
              <tr>
                <th className="w-14">#</th>
                <th>{t("Игрок")}</th>
                {[t("Игр"), t("Побед"), t("Винрейт"), t("У–С"), "K/D", "ADR", "HS%"].map((h) => (
                  <th key={h} className="w-[82px] !text-right">
                    {h}
                  </th>
                ))}
                <th className="w-[104px] !text-right">{t("Рейтинг")}</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r, i) => {
                const p = who(r.steam_id, r.name);
                const me = meSteamId === r.steam_id;
                return (
                  <tr key={r.steam_id} className={cn(me ? "bg-accent-dim/70" : i === 0 ? "bg-gold/[0.07]" : undefined)}>
                    <td>
                      <RankBadge n={i + 1} />
                    </td>
                    <td>
                      <Link href={`/players/${r.steam_id}`} className="flex min-w-0 items-center gap-3 text-fg hover:text-accent">
                        <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                        <span className="truncate font-semibold">{p.nickname}</span>
                        {me && <span className="shrink-0 rounded-chip bg-accent px-1.5 py-0.5 text-micro font-semibold text-accent-ink">{t("вы")}</span>}
                      </Link>
                    </td>
                    <td className={NUM_CELL}>{r.maps}</td>
                    <td className={NUM_CELL}>{r.wins}</td>
                    <td className={cn(NUM_CELL, pct(r.wins, r.maps) >= 50 ? "text-fg" : "text-fg-3")}>{pct(r.wins, r.maps)}%</td>
                    <td className={cn(NUM_CELL, "whitespace-nowrap")}>
                      {r.kills}–{r.deaths}
                    </td>
                    <td className={cn(NUM_CELL, r.kd >= 1 ? "text-fg" : "text-fg-3")}>{r.kd.toFixed(2)}</td>
                    <td className={NUM_CELL}>{Math.round(r.adr)}</td>
                    <td className={NUM_CELL}>{Math.round(r.hsPct)}%</td>
                    <td className="text-right">
                      <RatingPill value={r.rating} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {matrix.length > 0 && (
        <section aria-label={t("Кто на какой карте силён")}>
          <SectionHead title={t("Кто на какой карте силён")} meta={t("Рейтинг игрока на каждой карте. Бледные числа — одна игра, это ещё не показатель.")} />
          <div className={tableBox()}>
            <table className={cn(DATA_TABLE, "min-w-[720px] [&_td]:!h-12")}>
              <thead>
                <tr>
                  <th>{t("Игрок")}</th>
                  {maps.map((m) => (
                    <th key={m} className="w-[92px] !text-center">
                      {mapLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => {
                  const p = who(r.steam_id, r.name);
                  return (
                    <tr key={r.steam_id}>
                      <td>
                        <Link href={`/players/${r.steam_id}`} className="flex min-w-0 items-center gap-2.5 font-semibold text-fg hover:text-accent">
                          <Avatar src={p.avatar_url} name={p.nickname} size="xs" />
                          <span className="truncate">{p.nickname}</span>
                        </Link>
                      </td>
                      {maps.map((m) => {
                        const c = r.byMap.find((x) => x.map === m);
                        if (!c) return <td key={m} className="text-center text-fg-4">·</td>;
                        const best = r.best?.map === m;
                        return (
                          <td key={m} className="!px-1.5 text-center">
                            <span
                              title={t("{map}: игр {n}, побед {wins}, K/D {kd}", { map: mapLabel(m), n: c.maps, wins: c.wins, kd: c.kd.toFixed(2) })}
                              className={cn("num inline-flex h-8 w-full items-center justify-center rounded-[6px] text-[14px] font-semibold", heatTone(c.rating), c.maps < MAP_MIN && "opacity-45", best && "ring-2 ring-gold/70")}
                            >
                              {c.rating.toFixed(2)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-meta text-fg-3">{t("Золотая рамка — коронная карта игрока.")}</p>
        </section>
      )}
    </div>
  );
}

// ───────────────────────── стиль игры

/** цвета сторон сравнения — как стороны в CS: синий против оранжевого; те же у фигур на паутинке */
const SIDE = [
  { bg: "bg-side-ct", text: "text-side-ct", ring: "ring-side-ct/50", soft: "bg-side-ct/[0.07] border-side-ct/30" },
  { bg: "bg-side-t", text: "text-side-t", ring: "ring-side-t/50", soft: "bg-side-t/[0.08] border-side-t/30" },
];
const SIDE_TEXT = SIDE.map((x) => x.text);

function CompareGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-control border border-line-subtle bg-shell/50 px-3 py-3 sm:px-5 sm:py-4">
      <div className="pb-2 text-center text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">{title}</div>
      <div className="divide-y divide-line-subtle">{children}</div>
    </div>
  );
}

/**
 * Строка сравнения «бабочкой»: подпись в середине, полоски расходятся от неё в стороны — у кого длиннее, тот сильнее.
 * Длина — доля от большего из двух значений; null — у игрока значения нет.
 */
function CompareRow({ label, a, b, show, neutral }: { label: string; a: number | null; b: number | null; show: (v: number) => string; neutral?: boolean }) {
  const max = Math.max(a ?? 0, b ?? 0);
  const win = neutral || a == null || b == null || a === b ? 0 : a > b ? 1 : 2;
  const side = (v: number | null, n: 1 | 2) => {
    const lost = win !== 0 && win !== n;
    const number = <span className={cn("num w-[52px] shrink-0 text-[16px] sm:text-[17px]", n === 1 ? "text-right" : "text-left", v == null ? "text-fg-4" : win === n ? "font-extrabold text-fg" : lost ? "font-medium text-fg-3" : "font-semibold text-fg-2")}>{v == null ? "—" : show(v)}</span>;
    const bar = (
      <span className={cn("flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]", n === 1 && "justify-end")} aria-hidden>
        {v != null && max > 0 && <span className={cn("rounded-full", SIDE[n - 1].bg, lost && "opacity-40")} style={{ width: `${Math.max(3, (100 * v) / max)}%` }} />}
      </span>
    );
    return <div className="flex min-w-0 items-center gap-2.5">{n === 1 ? [<Fragment key="n">{number}</Fragment>, <Fragment key="b">{bar}</Fragment>] : [<Fragment key="b">{bar}</Fragment>, <Fragment key="n">{number}</Fragment>]}</div>;
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_108px_minmax(0,1fr)] items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] sm:gap-3">
      {side(a, 1)}
      <div className="text-center text-[12px] leading-tight text-fg-2 sm:text-meta">{label}</div>
      {side(b, 2)}
    </div>
  );
}

const ROLE_ORDER: RoleKey[] = ["fragger", "sniper", "entry", "multi", "clutch", "headshot", "support", "survivor", "bomber", "stable", "universal"];

export function StyleTab({ rows, who, t, a, b, href }: { rows: TwentyRow[]; who: Who; t: T; a: string | null; b: string | null; href: (params: Record<string, string>) => string }) {
  const styled = rows.filter((r) => r.radar && r.role);
  if (styled.length < 2) return <EmptyState title={t("Стиль игры пока не виден")} text={t("Роли и сравнение появятся, когда хотя бы двое сыграют от {n} карт.", { n: ROLE_MIN_MAPS })} />;
  const first = styled.find((r) => r.steam_id === a) ?? styled[0];
  const second = styled.find((r) => r.steam_id === b && r.steam_id !== first.steam_id) ?? styled.find((r) => r.steam_id !== first.steam_id)!;
  const pair = [first, second];
  const names = pair.map((r) => who(r.steam_id, r.name).nickname);
  const options = (self: "a" | "b") =>
    [...styled]
      .sort((x, y) => who(x.steam_id, x.name).nickname.localeCompare(who(y.steam_id, y.name).nickname))
      .map((r) => ({ value: r.steam_id, label: who(r.steam_id, r.name).nickname, href: href(self === "a" ? { a: r.steam_id, b: second.steam_id } : { a: first.steam_id, b: r.steam_id }) }));
  const metrics: [string, (r: TwentyRow) => number, (v: number) => string, boolean?][] = [
    ["K/D", (r) => r.kd, (v) => v.toFixed(2)],
    ["ADR", (r) => r.adr, (v) => String(Math.round(v))],
    ["HS%", (r) => r.hsPct, (v) => `${Math.round(v)}%`],
    [t("Клатчей за карту"), (r) => r.clutches / r.maps, (v) => v.toFixed(2)],
    [t("3+ убийства за карту"), (r) => r.multi / r.maps, (v) => v.toFixed(2)],
    [t("Урон гранатами за карту"), (r) => r.utility / r.maps, (v) => String(Math.round(v))],
    [t("Ослеплено за карту"), (r) => r.flashed / r.maps, (v) => v.toFixed(1)],
    [t("Побед в матчах"), (r) => pct(r.wins, r.matches), (v) => `${v}%`],
    [t("Карт сыграно"), (r) => r.maps, (v) => String(v), true],
  ];
  // из лога раундов — только когда он есть у обоих: иначе сравнение с нулём ничего не значит
  if (pair.every((r) => r.sides)) {
    metrics.splice(
      metrics.length - 2,
      0,
      [t("Первых убийств за карту"), (r) => r.entries / r.maps, (v) => v.toFixed(2)],
      [t("K/D за защиту"), (r) => r.sides!.ct.kd, (v) => v.toFixed(2)],
      [t("K/D за атаку"), (r) => r.sides!.t.kd, (v) => v.toFixed(2)],
    );
  }
  const hasMap = (r: TwentyRow, m: string) => r.byMap.some((c) => c.map === m);
  const sharedMaps = [...new Set(pair.flatMap((r) => r.byMap.map((c) => c.map)))].sort((x, y) => Number(hasMap(first, y) && hasMap(second, y)) - Number(hasMap(first, x) && hasMap(second, x)));
  const byRole = ROLE_ORDER.map((role) => ({ role, list: styled.filter((r) => r.role === role) })).filter((g) => g.list.length);

  return (
    <div className="space-y-8">
      <section aria-label={t("Сравнение игроков")} className="rounded-surface border border-line-subtle bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-title text-fg">{t("Сравнение игроков")}</h2>
            <p className="mt-1 max-w-read text-meta text-fg-3">{t("Паутинка показывает место игрока среди остальных по каждой оси: край — лучший, центр — последний.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectNav value={first.steam_id} options={options("a")} label={t("Первый игрок")} />
            <span className="text-meta font-semibold text-fg-3">vs</span>
            <SelectNav value={second.steam_id} options={options("b")} label={t("Второй игрок")} />
          </div>
        </div>
        {/* игроки по бокам, паутинка между ними: цвет карточки = цвет фигуры = цвет полосок ниже */}
        <div className="mt-6 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)_minmax(0,1fr)]">
          {pair.map((r, i) => {
            const p = who(r.steam_id, r.name);
            return (
              <Link key={r.steam_id} href={`/players/${r.steam_id}`} className={cn("group flex items-center gap-4 rounded-surface border p-4 transition-colors hover:border-line-strong sm:p-5", SIDE[i].soft, i === 0 ? "lg:order-1 lg:flex-row-reverse lg:text-right" : "lg:order-3")}>
                <span className={cn("shrink-0 rounded-full p-1 ring-2", SIDE[i].ring)}>
                  <Avatar src={p.avatar_url} name={p.nickname} size="lg" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[20px] font-extrabold leading-tight text-fg group-hover:text-accent">{p.nickname}</span>
                  <span className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", i === 0 && "lg:justify-end")}>
                    <RoleChip role={r.role} t={t} />
                    <BestMapChip cell={r.best} t={t} />
                  </span>
                  <span className="num mt-2 block text-meta text-fg-3">{t("Карт: {maps} · побед {wins} из {matches}", { maps: r.maps, wins: r.wins, matches: r.matches })}</span>
                </span>
                <span className={cn("num shrink-0 text-[28px] font-extrabold leading-none sm:text-[40px]", SIDE[i].text)}>{r.rating.toFixed(2)}</span>
              </Link>
            );
          })}
          <div className="lg:order-2">
            <Radar t={t} size={360} colors={SIDE_TEXT} series={pair.map((r, i) => ({ name: names[i], values: r.radar! }))} />
          </div>
        </div>

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
          <CompareGroup title={t("Показатели")}>
            {metrics.map(([label, f, show, neutral]) => (
              <CompareRow key={label} label={label} a={f(first)} b={f(second)} show={show} neutral={neutral} />
            ))}
          </CompareGroup>
          <CompareGroup title={t("Рейтинг по картам")}>
            {sharedMaps.map((m) => (
              <CompareRow key={m} label={mapLabel(m)} a={first.byMap.find((c) => c.map === m)?.rating ?? null} b={second.byMap.find((c) => c.map === m)?.rating ?? null} show={(v) => v.toFixed(2)} />
            ))}
          </CompareGroup>
        </div>
      </section>

      <Section title={t("Кто как играет")} description={t("Роль — то, чем игрок сильнее всего выделяется среди остальных. Считается от {n} карт.", { n: ROLE_MIN_MAPS })}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {byRole.map(({ role, list }) => (
            <div key={role} className="rounded-control border border-line-subtle bg-shell/60 p-4">
              <div className="text-[15px] font-bold text-fg">{t(ROLES[role].label)}</div>
              <div className="mt-0.5 text-meta text-fg-3">{t(ROLES[role].hint)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {list.map((r) => {
                  const p = who(r.steam_id, r.name);
                  return (
                    <Link key={r.steam_id} href={href({ a: r.steam_id })} scroll={false} className="inline-flex items-center gap-2 rounded-chip bg-surface py-1 pl-1 pr-2.5 text-[13px] font-semibold text-fg ring-1 ring-line-subtle transition-colors hover:ring-line-strong">
                      <Avatar src={p.avatar_url} name={p.nickname} size="xs" />
                      <span className="max-w-[120px] truncate">{p.nickname}</span>
                      <span className="num text-fg-3">{r.rating.toFixed(2)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-meta text-fg-3">
          {t("Оси паутинки")}: {RADAR_AXES.map((x) => `${t(x.label)} — ${t(x.hint).toLowerCase()}`).join("; ")}.
        </p>
      </Section>
    </div>
  );
}

export { TWENTY_MIN_MAPS };
