import Link from "next/link";
import { roundTitle } from "@/lib/bracket";
import type { MatchWithTeams } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { MatchStatusBadge } from "./match-bits";
import { TeamLogo, cn } from "./ui";

// размеры сетки
const W = 236; // ширина карточки матча
const H = 74; // высота карточки
const GAP_Y = 18; // зазор между матчами первого раунда
const GAP_X = 64; // расстояние между колонками (место под линии)
const HEAD = 34; // заголовок колонки

function Slot({ team, score, winner, loser, showScore }: { team: Team | null; score: number; winner: boolean; loser: boolean; showScore: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 h-[26px] px-2.5", winner ? "text-fg" : loser ? "text-fg-3" : team ? "text-fg-2" : "text-fg-3")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size={18} /> : <span className="size-[18px] rounded-md border border-dashed border-line-strong" />}
      <span className={cn("flex-1 truncate text-[13px]", winner && "font-semibold")}>{team?.name ?? "TBD"}</span>
      {showScore && <span className={cn("num text-[13px] w-4 text-right", winner ? "text-accent font-semibold" : "text-fg-3")}>{score}</span>}
    </div>
  );
}

function Node({ m }: { m: MatchWithTeams }) {
  const finished = m.status === "finished";
  const bye = m.is_walkover && (!m.team1_id || !m.team2_id);
  if (m.status === "cancelled" || bye) {
    return (
      <div className="h-full rounded-lg border border-dashed border-line/70 px-3 flex items-center text-[11px] text-fg-3">
        #{m.number} · {bye ? `${(m.team1 ?? m.team2)?.name ?? "—"} проходит дальше` : "пустой матч"}
      </div>
    );
  }
  const live = m.status === "live" || m.status === "veto";
  const showScore = finished || m.status === "live";
  return (
    <Link
      href={`/matches/${m.id}`}
      className={cn(
        "block h-full rounded-lg border bg-surface transition hover:border-line-strong hover:bg-surface-2",
        live ? "border-[#ef7a7a66] shadow-[0_0_0_1px_#ef7a7a22]" : "border-line",
      )}
    >
      <div className="flex items-center justify-between px-2.5 h-[20px] text-[10px] text-fg-3">
        <span className="num">#{m.number} · BO{m.best_of}</span>
        <MatchStatusBadge status={m.status} compact />
      </div>
      <Slot team={m.team1} score={m.team1_score} winner={finished && m.winner_id === m.team1_id} loser={finished && m.winner_id !== m.team1_id} showScore={showScore} />
      <Slot team={m.team2} score={m.team2_score} winner={finished && m.winner_id === m.team2_id} loser={finished && m.winner_id !== m.team2_id} showScore={showScore} />
    </Link>
  );
}

type Placed = { m: MatchWithTeams; x: number; y: number };

/**
 * Раскладка колонок: матч ставится по центру между матчами-источниками (winner_to из предыдущего раунда).
 * Если источников нет (первый раунд или раунд нижней сетки с «падающими» командами) — по порядку.
 */
function layout(matches: MatchWithTeams[], xOffset = 0, yOffset = 0) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const placed = new Map<string, Placed>();
  rounds.forEach((r, col) => {
    const list = matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
    const x = xOffset + col * (W + GAP_X);
    list.forEach((m, i) => {
      const feeders = matches.filter((f) => f.winner_to_match === m.id && placed.has(f.id)).map((f) => placed.get(f.id)!);
      let y: number;
      if (feeders.length >= 2) y = (Math.min(...feeders.map((f) => f.y)) + Math.max(...feeders.map((f) => f.y))) / 2;
      else if (feeders.length === 1) y = feeders[0].y;
      else y = yOffset + HEAD + i * (H + GAP_Y);
      placed.set(m.id, { m, x, y });
    });
    // не даём карточкам наехать друг на друга
    const col_ = list.map((m) => placed.get(m.id)!).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col_.length; i++) {
      if (col_[i].y < col_[i - 1].y + H + GAP_Y) col_[i].y = col_[i - 1].y + H + GAP_Y;
    }
  });
  return { placed, rounds };
}

function Section({
  title,
  matches,
  totalUpper,
  totalLower,
}: {
  title: string;
  matches: MatchWithTeams[];
  totalUpper: number;
  totalLower: number;
}) {
  const { placed, rounds } = layout(matches);
  const all = [...placed.values()];
  const width = rounds.length * (W + GAP_X) - GAP_X;
  const height = Math.max(...all.map((p) => p.y + H), HEAD + H) + 4;
  const side = matches[0]?.bracket ?? "upper";

  const lines = all.flatMap((p) => {
    const to = p.m.winner_to_match ? placed.get(p.m.winner_to_match) : null;
    if (!to) return [];
    const x1 = p.x + W;
    const y1 = p.y + H / 2 + 10;
    const x2 = to.x;
    const y2 = to.y + H / 2 + 10;
    const mid = x1 + GAP_X / 2;
    const done = p.m.status === "finished";
    return [{ key: p.m.id, d: `M${x1} ${y1} H${mid} V${y2} H${x2}`, done }];
  });

  return (
    <section>
      <div className="label mb-3">{title}</div>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="relative" style={{ width, height }}>
          <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden>
            {lines.map((l) => (
              <path key={l.key} d={l.d} fill="none" stroke={l.done ? "#3a4c6a" : "#1c2738"} strokeWidth="1.5" />
            ))}
          </svg>
          {rounds.map((r, col) => (
            <div
              key={r}
              className="absolute text-xs font-medium text-fg-2 whitespace-nowrap"
              style={{ left: col * (W + GAP_X), top: 0, width: W }}
            >
              {roundTitle(matches.find((m) => m.round === r)?.bracket ?? side, r, totalUpper, totalLower)}
            </div>
          ))}
          {all.map((p) => (
            <div key={p.m.id} className="absolute" style={{ left: p.x, top: p.y, width: W, height: H }}>
              <Node m={p.m} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Сетка на выбывание: верхняя, нижняя, финал — с соединительными линиями */
export function BracketView({ matches }: { matches: MatchWithTeams[] }) {
  const playoff = matches.filter((m) => (m.stage ?? "playoff") === "playoff");
  const upper = playoff.filter((m) => m.bracket === "upper");
  const lower = playoff.filter((m) => m.bracket === "lower");
  const gf = playoff.filter((m) => m.bracket === "grand_final");
  const totalUpper = Math.max(0, ...upper.map((m) => m.round));
  const totalLower = Math.max(0, ...lower.map((m) => m.round));
  if (playoff.length === 0) return null;

  // гранд-финал ставим колонкой справа от финала верхней сетки
  const upperWithFinal = gf.length ? [...upper, ...gf.map((m) => ({ ...m, round: totalUpper + 1 }))] : upper;

  return (
    <div className="space-y-10">
      <Section
        title={lower.length ? "Верхняя сетка" : "Плей-офф"}
        matches={upperWithFinal}
        totalUpper={totalUpper}
        totalLower={totalLower}
      />
      {lower.length > 0 && <Section title="Нижняя сетка" matches={lower} totalUpper={totalUpper} totalLower={totalLower} />}
    </div>
  );
}
