import Link from "next/link";
import { MoveHorizontal } from "lucide-react";
import { THIRD_PLACE_TITLE, roundTitle } from "@/lib/bracket";
import type { MatchWithTeams } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { MatchStatusBadge } from "./match-bits";
import { SectionTitle, TeamLogo, cn } from "./ds";
import { BracketHover } from "./competition/bracket-hover";

// размеры сетки: компактные узлы, линии между колонками
const W = 256;
const H = 78;
const GAP_Y = 18;
const GAP_X = 72;
const HEAD = 46;

function Slot({ team, score, winner, loser, showScore }: { team: Team | null; score: number; winner: boolean; loser: boolean; showScore: boolean }) {
  return (
    <div
      data-team={team?.id}
      className={cn(
        "relative flex h-[31px] items-center gap-2.5 rounded-[6px] px-3 transition-[opacity,background-color] duration-[var(--dur-hover)]",
        winner ? "text-fg" : loser ? "text-fg-3" : team ? "text-fg-2" : "text-fg-4",
      )}
    >
      {winner && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" />}
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size="xs" /> : <span className="size-5 rounded-[5px] border border-dashed border-line" />}
      <span className={cn("flex-1 truncate text-[14px]", winner && "font-semibold")}>{team?.name ?? "TBD"}</span>
      {showScore && (
        <span
          className={cn(
            "num grid h-6 min-w-6 place-items-center rounded-[5px] px-1 text-[13px]",
            winner ? "bg-accent-dim font-semibold text-accent" : "text-fg-3",
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function Node({ m }: { m: MatchWithTeams }) {
  const finished = m.status === "finished";
  const bye = m.is_walkover && (!m.team1_id || !m.team2_id);
  if (m.status === "cancelled" || bye) {
    return (
      <div className="flex h-full items-center rounded-surface border border-dashed border-line-subtle bg-surface/60 px-3 text-micro text-fg-3">
        #{m.number} · {bye ? `${(m.team1 ?? m.team2)?.name ?? "—"} проходит дальше` : "пустой матч"}
      </div>
    );
  }

  const live = m.status === "live" || m.status === "veto" || m.status === "ready";
  const showScore = finished || m.status === "live";

  return (
    <Link
      href={`/matches/${m.id}`}
      data-node=""
      className={cn(
        "block h-full rounded-surface border bg-surface px-1 transition-[border-color,background-color] duration-[var(--dur-hover)] hover:bg-surface-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        live ? "border-live/40" : "border-line-subtle hover:border-line-strong",
      )}
    >
      <div className="flex h-[14px] items-center justify-between px-2 pt-1 text-[10px] text-fg-3">
        <span className="num">
          #{m.number} · BO{m.best_of}
        </span>
        <MatchStatusBadge status={m.status} compact />
      </div>
      <Slot team={m.team1} score={m.team1_score} winner={finished && m.winner_id === m.team1_id} loser={finished && !!m.winner_id && m.winner_id !== m.team1_id} showScore={showScore} />
      <Slot team={m.team2} score={m.team2_score} winner={finished && m.winner_id === m.team2_id} loser={finished && !!m.winner_id && m.winner_id !== m.team2_id} showScore={showScore} />
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
    const column = list.map((m) => placed.get(m.id)!).sort((a, b) => a.y - b.y);
    for (let i = 1; i < column.length; i++) {
      if (column[i].y < column[i - 1].y + H + GAP_Y) column[i].y = column[i - 1].y + H + GAP_Y;
    }
  });

  return { placed, rounds };
}

function BracketSection({
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
  const width = Math.max(W, rounds.length * (W + GAP_X) - GAP_X);
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
    <section aria-label={title}>
      <SectionTitle className="mb-4">{title}</SectionTitle>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-4 touch-pan-x sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {lines.map((line) => (
              <path
                key={line.key}
                d={line.d}
                fill="none"
                className={line.done ? "stroke-accent/45" : "stroke-line-strong"}
                strokeWidth="1.25"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {rounds.map((r, col) => {
            const inRound = matches.filter((m) => m.round === r);
            const done = inRound.every((m) => m.status === "finished" || m.status === "cancelled");
            const active = inRound.some((m) => ["live", "veto", "ready"].includes(m.status));
            return (
              <div
                key={r}
                className={cn(
                  "absolute flex h-8 items-center justify-between gap-2 whitespace-nowrap rounded-control border bg-shell/95 px-3 text-micro font-semibold uppercase tracking-[0.12em]",
                  active ? "border-live/35 text-fg" : done ? "border-line-subtle text-fg-3" : "border-line text-fg-2",
                )}
                style={{ left: col * (W + GAP_X), top: 0, width: W }}
              >
                <span className="truncate">{roundTitle(inRound[0]?.bracket ?? side, r, totalUpper, totalLower)}</span>
                <span className="num font-normal normal-case tracking-normal text-fg-3">
                  {active && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-live align-middle animate-pulse" />}
                  {inRound.length}
                </span>
              </div>
            );
          })}

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

/** Сетка на выбывание: верхняя, нижняя, гранд-финал и матч за 3-е место — отдельные понятные области. */
export function BracketView({ matches }: { matches: MatchWithTeams[] }) {
  const playoff = matches.filter((m) => (m.stage ?? "playoff") === "playoff");
  const upper = playoff.filter((m) => m.bracket === "upper");
  const lower = playoff.filter((m) => m.bracket === "lower");
  const grandFinal = playoff.filter((m) => m.bracket === "grand_final");
  const thirdPlace = playoff.filter((m) => m.bracket === "third_place");
  const totalUpper = Math.max(0, ...upper.map((m) => m.round));
  const totalLower = Math.max(0, ...lower.map((m) => m.round));

  if (playoff.length === 0) return null;

  return (
    <BracketHover>
      <div className="space-y-12 lg:space-y-16">
        <div className="text-meta text-fg-3">
          <span className="hidden md:inline">Наведите на команду, чтобы увидеть её путь по сетке.</span>
          <span className="inline-flex items-center gap-2 md:hidden">
            <MoveHorizontal className="size-4" aria-hidden /> Проведите по сетке в сторону, чтобы увидеть следующие раунды.
          </span>
        </div>

        {upper.length > 0 && (
          <BracketSection
            title={lower.length ? "Верхняя сетка" : "Плей-офф"}
            matches={upper}
            totalUpper={totalUpper}
            totalLower={totalLower}
          />
        )}

        {lower.length > 0 && (
          <BracketSection title="Нижняя сетка" matches={lower} totalUpper={totalUpper} totalLower={totalLower} />
        )}

        {grandFinal.length > 0 && (
          <BracketSection title="Гранд-финал" matches={grandFinal} totalUpper={totalUpper} totalLower={totalLower} />
        )}

        {/* проигравшие полуфиналов играют за 3-е место */}
        {thirdPlace.length > 0 && (
          <BracketSection title={THIRD_PLACE_TITLE} matches={thirdPlace} totalUpper={totalUpper} totalLower={totalLower} />
        )}
      </div>
    </BracketHover>
  );
}
