import Link from "next/link";
import type { PlayerAgg } from "@/lib/stats";
import { Avatar, TeamLogo, cn } from "./ui";
import { DATA_TABLE, NUM_CELL, RankBadge, RatingBar, SortedHead } from "./public/data-table";

type Row = PlayerAgg & {
  team?: { name: string; tag: string } | null;
  player?: { nickname: string; avatar_url: string | null; steam_id: string } | null;
};

export function ratingColor(r: number) {
  if (r >= 1.2) return "text-ok";
  if (r >= 1.0) return "text-fg";
  if (r >= 0.85) return "text-fg-2";
  return "text-danger";
}

export function swingColor(s: number | null) {
  if (s == null) return "text-fg-3";
  return s >= 1 ? "text-ok" : s <= -1 ? "text-danger" : "text-fg-2";
}

export const fmt = {
  swing: (s: number | null) => (s == null ? "—" : `${s > 0 ? "+" : ""}${s.toFixed(1)}%`),
  r: (n: number) => n.toFixed(2),
  d1: (n: number) => n.toFixed(1),
  pct: (n: number) => `${Math.round(n)}%`,
};

/**
 * Таблица игроков: рейтинг, K-D-A, ADR, KAST, HS, entry, клатчи.
 * sticky — своя вертикальная прокрутка с закреплённой шапкой (для длинных рейтингов).
 */
export function PlayerStatsTable({
  rows,
  showTeam = true,
  compact,
  rank = true,
  sticky,
  solo,
}: {
  rows: Row[];
  showTeam?: boolean;
  compact?: boolean;
  rank?: boolean;
  sticky?: boolean;
  /** дуэль 1×1: каждый выигранный раунд MatchZy считает клатчем 1v1 — колонка бессмысленна */
  solo?: boolean;
}) {
  // MatchZy присылает KAST и первые убийства не всегда — пустые колонки не показываем
  const showKast = rows.some((p) => p.kastRounds > 0);
  const showEntry = !compact && !solo && rows.some((p) => p.firstKills + p.firstDeaths > 0);
  const showClutch = !compact && !solo;
  return (
    <div className={sticky ? "max-h-[min(78vh,960px)] overflow-auto overscroll-contain" : "overflow-x-auto"}>
      <table className={cn(DATA_TABLE, compact ? "min-w-[640px] text-[13px] [&_td]:h-12" : "min-w-[960px]")}>
        <thead>
          <tr>
            {rank && <th className="w-14">#</th>}
            <th>Игрок</th>
            {showTeam && <th>Команда</th>}
            {!compact && <th className="!text-right">Карты</th>}
            <th className="!text-right">K</th>
            <th className="!text-right">D</th>
            <th className="!text-right">A</th>
            <th className="!text-right">±</th>
            <th className="!text-right">ADR</th>
            {showKast && <th className="!text-right">KAST</th>}
            {!compact && <th className="!text-right">HS</th>}
            {showEntry && <th className="!text-right">Entry</th>}
            {showClutch && <th className="!text-right">Клатчи</th>}
            <th className="!text-right" title="Средний вклад в шанс победы раунда">
              Swing
            </th>
            <th className="!text-right">{rank ? <SortedHead title="Отсортировано по рейтингу">Rating</SortedHead> : "Rating"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const nick = p.player?.nickname ?? p.name;
            const diff = p.kills - p.deaths;
            const name = (
              <span className="flex items-center gap-3">
                <Avatar src={p.player?.avatar_url} name={nick} size={compact ? 24 : 32} />
                <span className="max-w-[180px] truncate font-semibold text-fg">{nick}</span>
              </span>
            );
            return (
              <tr key={p.steam_id}>
                {rank && (
                  <td>
                    <RankBadge n={i + 1} />
                  </td>
                )}
                <td>
                  {p.player ? (
                    <Link href={`/players/${p.player.steam_id}`} className="rounded-[6px] transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </td>
                {showTeam && (
                  <td className="text-[13px]">
                    {p.team ? (
                      <Link href={`/teams/${p.team.tag}`} className="hover:text-fg">
                        {p.team.name}
                      </Link>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </td>
                )}
                {!compact && <td className={NUM_CELL}>{p.maps}</td>}
                <td className={cn(NUM_CELL, "text-fg")}>{p.kills}</td>
                <td className={NUM_CELL}>{p.deaths}</td>
                <td className={NUM_CELL}>{p.assists}</td>
                <td className={cn(NUM_CELL, diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "")}>{diff > 0 ? `+${diff}` : diff}</td>
                <td className={NUM_CELL}>{fmt.d1(p.adr)}</td>
                {showKast && <td className={NUM_CELL}>{fmt.pct(p.kast)}</td>}
                {!compact && <td className={NUM_CELL}>{fmt.pct(p.hsPct)}</td>}
                {showEntry && (
                  <td className={NUM_CELL}>
                    {p.firstKills}
                    <span className="text-fg-3">/{p.firstDeaths}</span>
                  </td>
                )}
                {showClutch && <td className={NUM_CELL}>{p.clutches}</td>}
                <td className={cn(NUM_CELL, swingColor(p.swing))}>{fmt.swing(p.swing)}</td>
                <td className={cn(NUM_CELL, ratingColor(p.rating))}>
                  <span className="block text-[15px] font-semibold leading-none">{fmt.r(p.rating)}</span>
                  {!compact && <RatingBar value={p.rating} className="mt-1.5" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type TeamStatRow = {
  team: { id: string; name: string; tag: string; logo_url: string | null };
  matches: number;
  wins: number;
  maps: number;
  mapWins: number;
  roundsFor: number;
  roundsAgainst: number;
  kills: number;
  deaths: number;
  damage: number;
  hs: number;
  /** сколько игроков команды играли */
  players: number;
  /** сумма раундов, сыгранных игроками команды — ADR = урон / эти раунды */
  rounds: number;
};

/** Статистика команд турнира: результаты серий и карт, раунды, и сумма по игрокам — K/D, ADR, HS */
export function TeamStatsTable({ rows, solo }: { rows: TeamStatRow[]; solo?: boolean }) {
  const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <div className="overflow-x-auto">
      <table className={cn(DATA_TABLE, "min-w-[900px]")}>
        <thead>
          <tr>
            <th className="w-14">#</th>
            <th>{solo ? "Участник" : "Команда"}</th>
            <th className="!text-right">Матчи</th>
            <th className="!text-right">
              <SortedHead title="Отсортировано по победам">В–П</SortedHead>
            </th>
            <th className="!text-right">Карты</th>
            <th className="!text-right">Раунды</th>
            <th className="!text-right" title="Доля выигранных раундов">
              % раундов
            </th>
            <th className="!text-right">K</th>
            <th className="!text-right">D</th>
            <th className="!text-right">K/D</th>
            <th className="!text-right" title="Средний урон за раунд">
              ADR
            </th>
            <th className="!text-right">HS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const rounds = t.roundsFor + t.roundsAgainst;
            const rd = t.roundsFor - t.roundsAgainst;
            const kd = t.deaths ? t.kills / t.deaths : t.kills;
            return (
              <tr key={t.team.id}>
                <td>
                  <RankBadge n={i + 1} />
                </td>
                <td>
                  <Link href={`/teams/${t.team.tag}`} className="flex items-center gap-3 hover:text-accent">
                    <TeamLogo src={t.team.logo_url} tag={t.team.tag} size={32} />
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
    <details className="group rounded-[12px] border border-white/[0.08] bg-[#0b1420]/60 px-6 lg:px-8">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15px] font-semibold text-fg-2 transition-colors hover:text-fg focus-visible:outline-none">
        Как считаются F16 Rating, Swing и MVP
        <span className="grid size-8 place-items-center rounded-full border border-white/[0.1] text-fg-3 transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="max-w-[760px] space-y-3 pb-7 text-[14px] leading-relaxed text-fg-2">
        <p>
          F16 Rating v1 зафиксирован до начала турниров. Основа — открытая формула в духе HLTV Rating 2.0, вклад
          в раунды расширен входами, клатчами, мультикиллами и трейдами. Средний игрок — около 1.00.
        </p>
        <pre className="num overflow-x-auto rounded-[8px] border border-white/[0.06] bg-bg-2 p-4 text-[12px] text-fg-2">
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
