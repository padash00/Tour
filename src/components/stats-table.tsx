"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { PlayerAgg, TeamStatRow } from "@/lib/stats";
import { Avatar, TeamLogo, cn } from "@/components/ds";
import { DATA_TABLE, NUM_CELL, RankBadge } from "./public/data-table";
import { fmt, swingColor } from "./stats-format";

type Row = PlayerAgg & {
  team?: { name: string; tag: string } | null;
  player?: { nickname: string; avatar_url: string | null; steam_id: string } | null;
};

type Sort = { key: string; dir: 1 | -1 };

/** Сортировка по колонке: первый клик — по убыванию, повторный — по возрастанию. Сортировка стабильная */
function useSort<T>(rows: T[], cols: Record<string, (r: T) => number>, initial: string) {
  const [sort, setSort] = useState<Sort>({ key: initial, dir: -1 });
  const sorted = useMemo(() => {
    const get = cols[sort.key];
    if (!get) return rows;
    return [...rows].sort((a, b) => (get(b) - get(a)) * -sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: -1 }));
  return { sorted, sort, toggle };
}

/** Заголовок колонки-кнопки: стрелка у активной колонки */
function SortTh({
  k,
  sort,
  onSort,
  children,
  title,
  left,
  className,
}: {
  k: string;
  sort: Sort;
  onSort: (k: string) => void;
  children: ReactNode;
  title?: string;
  left?: boolean;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={cn(!left && "!text-right", className)} aria-sort={active ? (sort.dir === -1 ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(k)}
        title={title ?? "Сортировать"}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-fg",
          active && "text-fg-2",
        )}
      >
        {children}
        <svg
          viewBox="0 0 12 12"
          className={cn("size-2.5 transition-transform", active ? "opacity-100" : "opacity-0", active && sort.dir === 1 && "rotate-180")}
          aria-hidden
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );
}

const PLAYER_COLS: Record<string, (p: Row) => number> = {
  maps: (p) => p.maps,
  kills: (p) => p.kills,
  deaths: (p) => p.deaths,
  assists: (p) => p.assists,
  diff: (p) => p.kills - p.deaths,
  adr: (p) => p.adr,
  kast: (p) => p.kast,
  hs: (p) => p.hsPct,
  entry: (p) => p.firstKills - p.firstDeaths,
  clutch: (p) => p.clutches,
  swing: (p) => p.swing ?? -1e9,
  rating: (p) => p.rating,
};

/** Рейтинг плашкой: ≥ 1.10 — зелёная, < 0.90 — красная, иначе нейтральная */
export function RatingPill({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "num inline-block min-w-[3.25rem] rounded-chip px-2 py-1 text-center text-[15px] font-extrabold leading-none",
        value >= 1.1 ? "bg-ok-dim text-ok" : value < 0.9 ? "bg-danger-dim text-danger" : "bg-surface-4 text-fg",
        className,
      )}
    >
      {fmt.r(value)}
    </span>
  );
}

/**
 * Таблица игроков в стиле HLTV: компактные строки (~44 px), команда — мелко под ником, У–С одной колонкой,
 * рейтинг плашкой. HS, entry и клатчи — только на широких экранах (от 1536 px).
 * sticky — своя вертикальная прокрутка с закреплённой шапкой (для длинных рейтингов).
 */
export function PlayerStatsTable({
  rows,
  showTeam = true,
  compact,
  rank = true,
  sticky,
  solo,
  highlightSteamId,
  mvpSteamId,
}: {
  rows: Row[];
  showTeam?: boolean;
  compact?: boolean;
  rank?: boolean;
  sticky?: boolean;
  /** дуэль 1×1: каждый выигранный раунд MatchZy считает клатчем 1v1 — колонка бессмысленна */
  solo?: boolean;
  /** устарело: заголовки теперь всегда словами */
  plain?: boolean;
  /** строка этого игрока подсвечивается и помечается «это вы» */
  highlightSteamId?: string | null;
  /** лучший игрок (MVP) — звёздочка у ника */
  mvpSteamId?: string | null;
}) {
  // MatchZy присылает KAST и первые убийства не всегда — пустые колонки не показываем
  const showKast = rows.some((p) => p.kastRounds > 0);
  const showSwing = rows.some((p) => p.swing != null);
  const showEntry = !compact && !solo && rows.some((p) => p.firstKills + p.firstDeaths > 0);
  const showClutch = !compact && !solo && rows.some((p) => p.clutches > 0);
  // в дуэлях «команда» — это сам игрок: подпись с повтором ника не показываем
  const teamLine = showTeam && rows.some((p) => p.team && p.team.name !== (p.player?.nickname ?? p.name));
  const { sorted, sort, toggle } = useSort(rows, PLAYER_COLS, "rating");
  const me = (steamId: string) => !!highlightSteamId && steamId === highlightSteamId;
  const th = (k: string, label: ReactNode, title?: string, cls?: string) => (
    <SortTh k={k} sort={sort} onSort={toggle} title={title} className={cls}>
      {label}
    </SortTh>
  );
  const wide = "hidden 2xl:table-cell";
  return (
    <div className={cn("rounded-surface border border-line-subtle bg-surface", sticky ? "max-h-[min(78vh,960px)] overflow-auto overscroll-contain" : "overflow-x-auto")}>
      <table
        className={cn(
          DATA_TABLE,
          "min-w-[600px] text-[15px] lg:min-w-0 [&_td]:h-11 [&_td]:py-1 [&_th]:h-10 sm:[&_td:first-child]:!pl-4 sm:[&_th:first-child]:!pl-4 sm:[&_td:last-child]:!pr-4 sm:[&_th:last-child]:!pr-4",
          compact ? "text-[14.5px] sm:[&_td]:px-2 sm:[&_th]:px-2" : "sm:[&_td]:px-3 sm:[&_th]:px-3",
        )}
      >
        <thead>
          <tr>
            {rank && <th className="w-12">#</th>}
            <th>Игрок</th>
            {!compact && th("maps", "Карты")}
            {th("diff", "У–С", "Убийства – смерти (сортировка по разнице)")}
            {th("diff", "±", "Убийства минус смерти")}
            {th("adr", "Урон/р", "Средний урон за раунд (ADR)")}
            {showKast && th("kast", "KAST", "Доля раундов с убийством, ассистом, выживанием или разменом")}
            {!compact && th("hs", "HS", "Доля убийств в голову", wide)}
            {showEntry && th("entry", "Entry", "Первые убийства / первые смерти раунда", wide)}
            {showClutch && th("clutch", "Клатчи", "Выигранные клатчи", wide)}
            {showSwing && th("swing", "Swing", "Средний вклад в шанс победы раунда")}
            {th("rating", "Рейтинг", "F16 Rating: больше — лучше, средний игрок ~1.00")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const nick = p.player?.nickname ?? p.name;
            const diff = p.kills - p.deaths;
            const name = (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar src={p.player?.avatar_url} name={nick} size="xs" className="!size-7" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("truncate font-semibold text-fg", compact ? "max-w-[110px] xl:max-w-[150px]" : "max-w-[180px]")}>{nick}</span>
                    {mvpSteamId === p.steam_id && <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-label="Лучший игрок команды" />}
                    {me(p.steam_id) && <span className="shrink-0 rounded-full bg-accent-dim px-1.5 text-[11px] font-bold text-accent">это вы</span>}
                  </span>
                  {teamLine && p.team && <span className="block max-w-[200px] truncate text-[12.5px] leading-tight text-fg-3">{p.team.name}</span>}
                </span>
              </span>
            );
            return (
              <tr key={p.steam_id} className={cn(me(p.steam_id) && "bg-accent-dim/60")}>
                {rank && (
                  <td>
                    <RankBadge n={i + 1} />
                  </td>
                )}
                <td>
                  {p.player ? (
                    <Link href={`/players/${p.player.steam_id}`} className="block rounded-[6px] transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </td>
                {!compact && <td className={NUM_CELL}>{p.maps}</td>}
                <td className={cn(NUM_CELL, "whitespace-nowrap text-fg")} title={`${p.assists} ассист.`}>
                  {p.kills}
                  <span className="text-fg-4">–</span>
                  {p.deaths}
                </td>
                <td className={cn(NUM_CELL, "font-semibold", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "text-fg-3")}>{diff > 0 ? `+${diff}` : diff}</td>
                <td className={NUM_CELL}>{fmt.d1(p.adr)}</td>
                {showKast && <td className={NUM_CELL}>{fmt.pct(p.kast)}</td>}
                {!compact && <td className={cn(NUM_CELL, wide)}>{fmt.pct(p.hsPct)}</td>}
                {showEntry && (
                  <td className={cn(NUM_CELL, wide)}>
                    {p.firstKills}
                    <span className="text-fg-3">/{p.firstDeaths}</span>
                  </td>
                )}
                {showClutch && <td className={cn(NUM_CELL, wide)}>{p.clutches}</td>}
                {showSwing && <td className={cn(NUM_CELL, swingColor(p.swing))}>{fmt.swing(p.swing)}</td>}
                <td className="text-right">
                  <RatingPill value={p.rating} className="mr-2" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TEAM_COLS: Record<string, (t: TeamStatRow) => number> = {
  matches: (t) => t.matches,
  wins: (t) => t.wins,
  maps: (t) => t.mapWins - (t.maps - t.mapWins),
  rounds: (t) => t.roundsFor - t.roundsAgainst,
  roundPct: (t) => (t.roundsFor + t.roundsAgainst ? t.roundsFor / (t.roundsFor + t.roundsAgainst) : 0),
  kills: (t) => t.kills,
  deaths: (t) => t.deaths,
  kd: (t) => (t.deaths ? t.kills / t.deaths : t.kills),
  adr: (t) => (t.rounds ? t.damage / t.rounds : 0),
  hs: (t) => (t.kills ? t.hs / t.kills : 0),
};

/** Статистика команд турнира: результаты серий и карт, раунды, и сумма по игрокам — K/D, ADR, HS */
export function TeamStatsTable({ rows, solo }: { rows: TeamStatRow[]; solo?: boolean }) {
  const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
  // по умолчанию — порядок с сервера (победы → карты → раунды); сортировка стабильная, он сохраняется при равенстве
  const { sorted, sort, toggle } = useSort(rows, TEAM_COLS, "wins");
  const th = (k: string, label: ReactNode, title?: string) => (
    <SortTh k={k} sort={sort} onSort={toggle} title={title}>
      {label}
    </SortTh>
  );
  return (
    <div className="overflow-x-auto rounded-surface border border-line-subtle bg-surface">
      <table className={cn(DATA_TABLE, "min-w-[900px]")}>
        <thead>
          <tr>
            <th className="w-14">#</th>
            <th>{solo ? "Участник" : "Команда"}</th>
            {th("matches", "Матчи")}
            {th("wins", "В–П", "Победы и поражения в матчах")}
            {th("maps", "Карты", "Выигранные и проигранные карты")}
            {th("rounds", "Раунды", "Выигранные и проигранные раунды")}
            {th("roundPct", "% раундов", "Доля выигранных раундов")}
            {th("kills", "K", "Убийства")}
            {th("deaths", "D", "Смерти")}
            {th("kd", "K/D")}
            {th("adr", "ADR", "Средний урон за раунд на игрока")}
            {th("hs", "HS", "Доля убийств в голову")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const rounds = t.roundsFor + t.roundsAgainst;
            const rd = t.roundsFor - t.roundsAgainst;
            const kd = t.deaths ? t.kills / t.deaths : t.kills;
            return (
              <tr key={t.team.id}>
                <td>
                  <RankBadge n={i + 1} />
                </td>
                <td>
                  <Link href={t.href} className="flex items-center gap-3 hover:text-accent">
                    <TeamLogo src={t.team.logo_url} tag={t.team.tag} size="sm" />
                    <span className="max-w-[220px] truncate font-semibold text-fg">{t.team.name}</span>
                  </Link>
                </td>
                <td className={NUM_CELL}>{t.matches}</td>
                <td className={cn(NUM_CELL, "font-semibold text-fg")}>
                  {t.wins}–{t.matches - t.wins}
                </td>
                <td className={NUM_CELL}>
                  {t.mapWins}–{t.maps - t.mapWins}
                </td>
                <td className={cn(NUM_CELL, rd > 0 ? "text-ok" : rd < 0 ? "text-danger" : "")}>
                  {t.roundsFor}–{t.roundsAgainst} <span className="text-fg-3">({pm(rd)})</span>
                </td>
                <td className={NUM_CELL}>{rounds ? fmt.pct((100 * t.roundsFor) / rounds) : "—"}</td>
                <td className={cn(NUM_CELL, "text-fg")}>{t.kills}</td>
                <td className={NUM_CELL}>{t.deaths}</td>
                <td className={cn(NUM_CELL, kd >= 1 ? "text-ok" : "text-danger")}>{kd.toFixed(2)}</td>
                <td className={NUM_CELL}>{t.rounds ? fmt.d1(t.damage / t.rounds) : "—"}</td>
                <td className={NUM_CELL}>{t.kills ? fmt.pct((100 * t.hs) / t.kills) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RatingExplainer() {
  return (
    <details className="group rounded-surface border border-line-subtle bg-surface px-6 lg:px-8">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15px] font-semibold text-fg-2 transition-colors hover:text-fg focus-visible:outline-none">
        Как считаются F16 Rating, Swing и MVP
        <span className="grid size-8 place-items-center rounded-full border border-line text-fg-3 transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="max-w-[760px] space-y-3 pb-7 text-[14px] leading-relaxed text-fg-2">
        <p>
          F16 Rating v1 зафиксирован до начала турниров. Основа — открытая формула в духе HLTV Rating 2.0, вклад
          в раунды расширен входами, клатчами, мультикиллами и трейдами. Средний игрок — около 1.00.
        </p>
        <pre className="num overflow-x-auto rounded-control border border-line-subtle bg-shell p-4 text-[12px] text-fg-2">
{`Impact = 2.13·KPR + 0.42·APR − 0.41
       + (первые убийства − первые смерти) / раунды
       + 1.5 · выигранные клатчи / раунды
       + (0.25·2K + 0.5·3K + 4K + 2·5K) / раунды
       + 0.5 · трейды / раунды

Rating = 0.0073·KAST% + 0.3591·KPR − 0.5329·DPR
       + 0.2372·Impact + 0.0032·ADR + 0.1587`}
        </pre>
        <p className="pt-2 font-semibold text-fg">Swing</p>
        <p>
          Swing — средний вклад игрока в шанс команды выиграть раунд, в процентных пунктах за раунд. Каждое событие
          меняет вероятность победы: убийство (убийце +Δ, при ассисте 75/25), смерть (−Δ), плент, дефьюз. Остаток до
          исхода раунда делится между выжившими. Шанс победы считается по числу живых с каждой стороны и состоянию
          бомбы (модель v1; откалибруем на собственных раундах F16).
        </p>
        <p>
          <span className="text-fg">MVP турнира</span> — лучший Swing среди игроков, сыгравших не меньше половины
          карт своей команды (минимум 2 карты). Если данных Swing нет — по F16 Rating.
        </p>
      </div>
    </details>
  );
}
