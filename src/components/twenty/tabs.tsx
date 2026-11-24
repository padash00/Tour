import Link from "next/link";
import { Avatar, EmptyState, Section, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { MapThumb } from "@/components/lobby/settings";
import { DATA_TABLE, NUM_CELL, RankBadge, tableBox } from "@/components/public/data-table";
import { SelectNav } from "@/components/public/select-nav";
import { formatDate } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import { mapLabel } from "@/lib/maps";
import { DUO_MIN, MAP_MIN, NOMINATIONS, RADAR_AXES, RECORDS, ROLE_MIN_MAPS, ROLES, TWENTY_MIN_MAPS, type Duo, type MapBoard, type Nomination, type RecordItem, type RoleKey, type TwentyRow } from "@/lib/twenty-core";
import type { TwentyPlayer } from "@/lib/twenty";
import { BestMapChip, Radar, RadarLegend, RatingPill, RoleChip, Streak, Trend, heatTone } from "./bits";

/* Вкладки раздела «Микс». Все — серверные: данные и переводчик приходят со страницы. */

export type Who = (steamId: string, fallback?: string | null) => TwentyPlayer;
/** Ник и аватар игрока: из базы, а если его там нет — ник из статистики сервера */
export const whoOf =
  (players: Record<string, TwentyPlayer>): Who =>
  (steamId, fallback) =>
    players[steamId] ?? { nickname: fallback ?? steamId, avatar_url: null };

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

// ───────────────────────── рейтинг

function nominationNote(n: Nomination, t: T) {
  const d = n.detail;
  if (d.kind === "total") return t("за вечер");
  if (d.kind === "perMap") return t("в среднем за карту · всего {n}", { n: d.n ?? 0 });
  if (d.kind === "kills") return t("убийств: {n}", { n: d.kills ?? 0 });
  if (d.kind === "map") return `${d.map ? mapLabel(d.map) : "—"} · ${d.kills}–${d.deaths}`;
  return t("рейтинг {from} → {to}", { from: (d.from ?? 0).toFixed(2), to: (d.to ?? 0).toFixed(2) });
}

export function Nominations({ items, who, t, evening }: { items: Nomination[]; who: Who; t: T; evening: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-label={t("Номинации")}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-title text-fg">{evening ? t("Номинации вечера") : t("Номинации")}</h2>
        <p className="text-meta text-fg-3">{evening ? t("Лучшие в своём деле за этот вечер") : t("Лучшие в своём деле — в среднем за карту, от {n} карт", { n: ROLE_MIN_MAPS })}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((n) => {
          const p = who(n.steam_id, n.name);
          const body = (
            <>
              <div className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3" title={t(NOMINATIONS[n.key].hint)}>
                {t(NOMINATIONS[n.key].label)}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Avatar src={p.avatar_url} name={p.nickname} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-fg">{p.nickname}</span>
                  <span className="block truncate text-micro text-fg-3">{nominationNote(n, t)}</span>
                </span>
                <span className="num text-[22px] font-extrabold text-fg">{n.value}</span>
              </div>
            </>
          );
          return (
            <Link key={n.key} href={n.game_id ? `/lobbies/games/${n.game_id}` : `/players/${n.steam_id}`} className="rounded-surface border border-line-subtle bg-surface p-4 transition-colors hover:border-line-strong">
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function RatingTable({ rows, who, t, meSteamId }: { rows: TwentyRow[]; who: Who; t: T; meSteamId: string | null }) {
  return (
    <div className={tableBox()}>
      <table className={cn(DATA_TABLE, "min-w-[900px]")}>
        <thead>
          <tr>
            <th className="w-14">#</th>
            <th>{t("Игрок")}</th>
            {[t("Карт"), t("Побед"), t("У–С"), "±", "K/D", "ADR", "HS%", "MVP"].map((h) => (
              <th key={h} className="w-[74px] !text-right">
                {h}
              </th>
            ))}
            <th className="w-[150px] !text-right">{t("Рейтинг")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = who(r.steam_id, r.name);
            const me = meSteamId === r.steam_id;
            const diff = r.kills - r.deaths;
            return (
              <tr key={r.steam_id} className={cn(me ? "bg-accent-dim/70" : i === 0 ? "bg-gold/[0.07]" : i < 3 ? "bg-ink/[0.02]" : undefined)}>
                <td>
                  <RankBadge n={i + 1} />
                </td>
                <td className="!h-auto py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                    <div className="min-w-0">
                      <Link href={`/players/${r.steam_id}`} className="flex min-w-0 items-center gap-2 text-fg hover:text-accent">
                        <span className={cn("truncate", i < 3 ? "text-[16px] font-bold" : "font-semibold")}>{p.nickname}</span>
                        {i === 0 && <span className="shrink-0 text-gold">{Icon.crown("size-4")}</span>}
                        {me && <span className="shrink-0 rounded-chip bg-accent px-1.5 py-0.5 text-micro font-semibold text-accent-ink">{t("вы")}</span>}
                      </Link>
                      {(r.role || r.best || r.streak >= 3) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
  const owner = board.rows[0];
  const ownerWho = owner ? who(owner.steam_id, owner.name) : null;
  const maps = boards.map((b) => b.map);
  // в матрице — те, у кого есть хотя бы одна карта с порогом; остальным показывать нечего
  const matrix = rows.filter((r) => r.byMap.some((c) => c.maps >= MAP_MIN)).slice(0, 40);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {boards.map((b) => {
          const top = b.rows[0];
          const active = b.map === board.map;
          return (
            <Link key={b.map} href={href({ map: b.map })} scroll={false} aria-current={active ? "true" : undefined}>
              <MapThumb map={b.map} image={images[b.map]} className={cn("h-24 rounded-surface border-2 transition-colors", active ? "border-accent" : "border-transparent hover:border-line-strong")}>
                <span className="absolute right-2.5 top-2 rounded-chip bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-white">{t("игр: {n}", { n: b.played })}</span>
                <span className="absolute inset-x-3 bottom-2 grid gap-0.5">
                  <span className="truncate text-[15px] font-bold text-white">{mapLabel(b.map)}</span>
                  {top && <span className="truncate text-[11px] font-medium text-white/85">{who(top.steam_id, top.name).nickname}</span>}
                </span>
              </MapThumb>
            </Link>
          );
        })}
      </div>

      {owner && ownerWho && (
        <section aria-label={t("Хозяин карты")} className="flex flex-wrap items-center gap-5 rounded-surface border border-gold/40 bg-gradient-to-br from-gold/[0.14] via-gold/[0.05] to-transparent p-5 sm:p-6">
          <span className="rounded-full p-1 ring-2 ring-gold/60">
            <Avatar src={ownerWho.avatar_url} name={ownerWho.nickname} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.14em] text-gold">
              {Icon.crown("size-4")} {t("Хозяин карты {map}", { map: mapLabel(board.map) })}
            </div>
            <Link href={`/players/${owner.steam_id}`} className="mt-1 block truncate text-[26px] font-extrabold leading-tight text-fg hover:text-accent">
              {ownerWho.nickname}
            </Link>
            <div className="mt-1 text-meta text-fg-3">{t("Игр на карте: {n} · побед {wins} · K/D {kd} · ADR {adr}", { n: owner.maps, wins: owner.wins, kd: owner.kd.toFixed(2), adr: Math.round(owner.adr) })}</div>
          </div>
          <span className="num text-[40px] font-extrabold leading-none text-fg">{owner.rating.toFixed(2)}</span>
        </section>
      )}

      <section aria-label={mapLabel(board.map)}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-title text-fg">{t("Рейтинг на {map}", { map: mapLabel(board.map) })}</h2>
          <p className="text-meta text-fg-3">{board.minMaps > 1 ? t("В таблице — сыгравшие на карте от {n} игр", { n: board.minMaps }) : t("Карту играли редко — в таблице все, кто на ней был")}</p>
        </div>
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
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-title text-fg">{t("Кто на какой карте силён")}</h2>
            <p className="text-meta text-fg-3">{t("Рейтинг игрока на каждой карте. Бледные числа — одна игра, это ещё не показатель.")}</p>
          </div>
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

const ROLE_ORDER: RoleKey[] = ["fragger", "entry", "multi", "clutch", "headshot", "support", "survivor", "bomber", "stable", "universal"];

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
    [t("Рейтинг"), (r) => r.rating, (v) => v.toFixed(2)],
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
  const sharedMaps = [...new Set(pair.flatMap((r) => r.byMap.map((c) => c.map)))];
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
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div>
            <Radar t={t} series={pair.map((r, i) => ({ name: names[i], values: r.radar! }))} />
            <div className="mt-2">
              <RadarLegend names={names} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr>
                  {pair.map((r, i) => [
                    i === 1 ? <th key="mid" style={{ width: "30%" }} /> : null,
                    <th key={r.steam_id} className={cn("pb-3 font-semibold", i === 0 ? "text-right" : "text-left")} style={{ width: "35%" }}>
                      <Link href={`/players/${r.steam_id}`} className={cn("inline-flex items-center gap-2 text-fg hover:text-accent", i === 0 && "flex-row-reverse")}>
                        <Avatar src={who(r.steam_id, r.name).avatar_url} name={names[i]} size="sm" />
                        <span className="max-w-[160px] truncate">{names[i]}</span>
                      </Link>
                      <div className={cn("mt-1.5 flex", i === 0 && "justify-end")}>
                        <RoleChip role={r.role} t={t} />
                      </div>
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {metrics.map(([label, f, show, neutral]) => {
                  const va = f(first);
                  const vb = f(second);
                  return (
                    <tr key={label} className="border-t border-line-subtle">
                      <td className={cn("num py-2.5 text-right text-[16px] font-semibold", !neutral && va > vb ? "text-ok" : "text-fg-2")}>{show(va)}</td>
                      <td className="px-3 py-2.5 text-center text-meta text-fg-3">{label}</td>
                      <td className={cn("num py-2.5 text-left text-[16px] font-semibold", !neutral && vb > va ? "text-ok" : "text-fg-2")}>{show(vb)}</td>
                    </tr>
                  );
                })}
                {sharedMaps.map((m) => {
                  const ca = first.byMap.find((c) => c.map === m);
                  const cb = second.byMap.find((c) => c.map === m);
                  return (
                    <tr key={m} className="border-t border-line-subtle">
                      <td className={cn("num py-2.5 text-right text-[16px] font-semibold", ca && cb && ca.rating > cb.rating ? "text-ok" : "text-fg-2")}>{ca ? ca.rating.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2.5 text-center text-meta text-fg-3">{mapLabel(m)}</td>
                      <td className={cn("num py-2.5 text-left text-[16px] font-semibold", ca && cb && cb.rating > ca.rating ? "text-ok" : "text-fg-2")}>{cb ? cb.rating.toFixed(2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

// ───────────────────────── рекорды и связки

export function RecordsTab({ records, duos, who, t }: { records: RecordItem[]; duos: Duo[]; who: Who; t: T }) {
  if (!records.length) return <EmptyState title={t("Рекордов пока нет")} text={t("Они появятся после первых сыгранных матчей.")} />;
  return (
    <div className="space-y-8">
      <section aria-label={t("Рекорды")}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-title text-fg">{t("Рекорды")}</h2>
          <p className="text-meta text-fg-3">{t("За всё время. Побьёте — запись перейдёт к вам.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {records.map((r) => {
            const p = who(r.steam_id, r.name);
            return (
              <Link key={r.key} href={r.game_id ? `/lobbies/games/${r.game_id}` : `/players/${r.steam_id}`} className="rounded-surface border border-line-subtle bg-surface p-4 transition-colors hover:border-line-strong">
                <div className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t(RECORDS[r.key])}</div>
                <div className="num mt-2 text-[34px] font-extrabold leading-none text-fg">{r.value}</div>
                <div className="mt-3 flex items-center gap-2.5">
                  <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-fg">{p.nickname}</span>
                    <span className="block truncate text-micro text-fg-3">{[r.map ? mapLabel(r.map) : null, r.note, r.at ? formatDate(r.at, t.lang) : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label={t("Лучшие связки")}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-title text-fg">{t("Лучшие связки")}</h2>
          <p className="text-meta text-fg-3">{t("Пары, которые чаще всего выигрывают в одной команде. От {n} матчей вместе.", { n: DUO_MIN })}</p>
        </div>
        {duos.length === 0 ? (
          <p className="rounded-surface border border-line-subtle bg-surface p-5 text-meta text-fg-3">{t("Пока никто не сыграл вместе {n} матча.", { n: DUO_MIN })}</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {duos.map((d, i) => {
              const pa = who(d.a);
              const pb = who(d.b);
              return (
                <div key={`${d.a}:${d.b}`} className="flex items-center gap-3 rounded-surface border border-line-subtle bg-surface px-4 py-3">
                  <RankBadge n={i + 1} />
                  <span className="flex shrink-0 -space-x-2">
                    <Avatar src={pa.avatar_url} name={pa.nickname} size="sm" className="ring-2 ring-surface" />
                    <Avatar src={pb.avatar_url} name={pb.nickname} size="sm" className="ring-2 ring-surface" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
                    <Link href={`/players/${d.a}`} className="hover:text-accent">{pa.nickname}</Link>
                    <span className="text-fg-3"> + </span>
                    <Link href={`/players/${d.b}`} className="hover:text-accent">{pb.nickname}</Link>
                  </span>
                  <span className="num shrink-0 text-meta text-fg-3">{t("{wins} из {games}", { wins: d.wins, games: d.games })}</span>
                  <span className={cn("num w-14 shrink-0 text-right text-[18px] font-extrabold", pct(d.wins, d.games) >= 60 ? "text-ok" : "text-fg")}>{pct(d.wins, d.games)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export { TWENTY_MIN_MAPS };
