import Link from "next/link";
import type { PlayerAgg } from "@/lib/stats";
import { Avatar, cn } from "./ui";

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

/** Таблица игроков: рейтинг, K-D-A, ADR, KAST, HS, entry, клатчи */
export function PlayerStatsTable({
  rows,
  showTeam = true,
  compact,
  rank = true,
}: {
  rows: Row[];
  showTeam?: boolean;
  compact?: boolean;
  rank?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className={cn("tbl", compact ? "min-w-[640px] text-[13px]" : "min-w-[900px]")}>
        <thead>
          <tr>
            {rank && <th className="w-10">#</th>}
            <th>Игрок</th>
            {showTeam && <th>Команда</th>}
            {!compact && <th className="text-right">Карты</th>}
            <th className="text-right">K</th>
            <th className="text-right">D</th>
            <th className="text-right">A</th>
            <th className="text-right">±</th>
            <th className="text-right">ADR</th>
            <th className="text-right">KAST</th>
            {!compact && <th className="text-right">HS</th>}
            {!compact && <th className="text-right">Entry</th>}
            {!compact && <th className="text-right">Клатчи</th>}
            <th className="text-right" title="Средний вклад в шанс победы раунда">Swing</th>
            <th className="text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const nick = p.player?.nickname ?? p.name;
            const diff = p.kills - p.deaths;
            const name = (
              <span className="flex items-center gap-2.5">
                <Avatar src={p.player?.avatar_url} name={nick} size={compact ? 22 : 28} />
                <span className="font-medium text-fg truncate max-w-[160px]">{nick}</span>
              </span>
            );
            return (
              <tr key={p.steam_id}>
                {rank && <td className="num text-fg-3">{i + 1}</td>}
                <td>
                  {p.player ? (
                    <Link href={`/players/${p.player.steam_id}`} className="hover:text-accent">
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
                      "—"
                    )}
                  </td>
                )}
                {!compact && <td className="text-right num">{p.maps}</td>}
                <td className="text-right num text-fg">{p.kills}</td>
                <td className="text-right num">{p.deaths}</td>
                <td className="text-right num">{p.assists}</td>
                <td className={cn("text-right num", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "")}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td className="text-right num">{fmt.d1(p.adr)}</td>
                <td className="text-right num">{fmt.pct(p.kast)}</td>
                {!compact && <td className="text-right num">{fmt.pct(p.hsPct)}</td>}
                {!compact && (
                  <td className="text-right num">
                    {p.firstKills}
                    <span className="text-fg-3">/{p.firstDeaths}</span>
                  </td>
                )}
                {!compact && <td className="text-right num">{p.clutches}</td>}
                <td className={cn("text-right num", swingColor(p.swing))}>{fmt.swing(p.swing)}</td>
                <td className={cn("text-right num font-semibold", ratingColor(p.rating))}>{fmt.r(p.rating)}</td>
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
    <details className="card p-6 group">
      <summary className="list-none cursor-pointer flex items-center justify-between font-semibold">
        Как считаются F16 Rating, Swing и MVP
        <span className="text-fg-3 transition group-open:rotate-45 text-xl leading-none">+</span>
      </summary>
      <div className="mt-4 space-y-3 text-sm text-fg-2 leading-relaxed">
        <p>
          F16 Rating v1 зафиксирован до начала турниров. Основа — открытая формула в духе HLTV Rating 2.0, вклад
          в раунды расширен входами, клатчами, мультикиллами и трейдами. Средний игрок — около 1.00.
        </p>
        <pre className="num text-xs bg-bg-2 border border-line rounded-lg p-4 overflow-x-auto text-fg-2">
{`Impact = 2.13·KPR + 0.42·APR − 0.41
       + (первые убийства − первые смерти) / раунды
       + 1.5 · выигранные клатчи / раунды
       + (0.25·2K + 0.5·3K + 4K + 2·5K) / раунды
       + 0.5 · трейды / раунды

Rating = 0.0073·KAST% + 0.3591·KPR − 0.5329·DPR
       + 0.2372·Impact + 0.0032·ADR + 0.1587`}
        </pre>
        <p className="font-semibold text-fg pt-2">Swing</p>
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
