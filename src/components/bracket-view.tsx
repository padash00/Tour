import Link from "next/link";
import { Info, MoveHorizontal } from "lucide-react";
import { THIRD_PLACE_TITLE, roundTitle } from "@/lib/bracket";
import { liveMapOf, mapLabel } from "@/lib/maps";
import type { MatchWithTeams } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { SectionTitle, TeamLogo, cn } from "./ds";
import { BracketHover } from "./competition/bracket-hover";

// размеры сетки: карточки матчей покрупнее (читаемо любому), линии между колонками
const W = 244;
const H = 104;
const GAP_Y = 18;
const GAP_X = 44;
const HEAD = 52;

/** Подписи пустых мест: «победитель матча 3», «проигравший матча 13» — кто сюда придёт */
type SlotHints = Map<string, string>;

function slotHints(all: MatchWithTeams[]): SlotHints {
  const hints: SlotHints = new Map();
  for (const f of all) {
    if (f.winner_to_match && f.winner_to_slot) hints.set(`${f.winner_to_match}:${f.winner_to_slot}`, `победитель матча ${f.number}`);
    if (f.loser_to_match && f.loser_to_slot) hints.set(`${f.loser_to_match}:${f.loser_to_slot}`, `проигравший матча ${f.number}`);
  }
  return hints;
}

function Slot({ team, hint, score, winner, loser, showScore }: { team: Team | null; hint?: string; score: number; winner: boolean; loser: boolean; showScore: boolean }) {
  return (
    <div
      data-team={team?.id}
      className={cn(
        "relative flex h-[38px] items-center gap-2.5 px-3 transition-[opacity,background-color] duration-[var(--dur-hover)]",
        winner ? "text-accent" : loser ? "text-fg-3" : team ? "text-fg" : "text-fg-4",
      )}
    >
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size="xs" /> : <span className="size-6 shrink-0 rounded-[6px] border border-dashed border-line-strong" />}
      <span className={cn("flex-1 truncate", team ? "text-[15px]" : "text-[13.5px]", winner ? "font-extrabold" : team ? "font-semibold" : "font-medium")}>{team?.name ?? hint ?? "ждёт соперника"}</span>
      {showScore && <span className={cn("num min-w-6 text-right text-[16px]", winner ? "font-extrabold" : "font-semibold")}>{score}</span>}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  pending: "ждёт соперников",
  upcoming: "скоро",
  veto: "выбор карт",
  ready: "готовим сервер",
  live: "идёт",
  finished: "окончен",
};

function Node({ m, hints }: { m: MatchWithTeams; hints: SlotHints }) {
  const finished = m.status === "finished";
  const bye = m.is_walkover && (!m.team1_id || !m.team2_id);
  if (m.status === "cancelled" || bye) {
    return (
      <div className="flex h-full items-center rounded-surface border border-dashed border-line bg-surface/70 px-4 text-meta text-fg-3">
        Матч {m.number} · {bye ? `${(m.team1 ?? m.team2)?.name ?? "—"} проходит дальше без игры` : "пустой матч"}
      </div>
    );
  }

  const live = m.status === "live";
  const active = live || m.status === "veto" || m.status === "ready";
  const showScore = finished || live;
  // идущая карта: в BO1 в строках — раунды (счёт серии до конца карты 0:0), в BO3 — серия, раунды в подписи
  const lm = liveMapOf(m);
  const rounds = lm && m.best_of === 1;
  const s1 = rounds ? lm.team1_score : m.team1_score;
  const s2 = rounds ? lm.team2_score : m.team2_score;
  const map = lm ? mapLabel(lm.map_name) : null;

  return (
    <Link
      href={`/matches/${m.id}`}
      data-node=""
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-surface border bg-surface transition-[border-color,background-color,box-shadow] duration-[var(--dur-hover)] hover:bg-surface-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        live ? "border-live shadow-[inset_0_0_0_1px_var(--color-live)]" : active ? "border-warn/60" : "border-line-subtle hover:border-line-strong",
      )}
    >
      <div className={cn("flex h-[26px] items-center justify-between gap-2 px-3 pt-1 text-[12.5px] font-semibold", live ? "text-live" : active ? "text-warn" : "text-fg-3")}>
        <span className="truncate">
          {live && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-live align-middle animate-pulse" aria-hidden />}
          {STATUS_TEXT[m.status] ?? ""}
          {map && ` · ${map}`}
          {lm && !rounds && ` ${lm.team1_score}:${lm.team2_score}`}
        </span>
        <span className="num shrink-0 font-medium text-fg-3">
          №{m.number} · {m.best_of === 1 ? "до 1 победы" : `до ${Math.ceil(m.best_of / 2)} побед`}
        </span>
      </div>
      <Slot team={m.team1} hint={hints.get(`${m.id}:1`)} score={s1} winner={finished && m.winner_id === m.team1_id} loser={finished && !!m.winner_id && m.winner_id !== m.team1_id} showScore={showScore} />
      <div className="mx-3 h-px bg-line-subtle" />
      <Slot team={m.team2} hint={hints.get(`${m.id}:2`)} score={s2} winner={finished && m.winner_id === m.team2_id} loser={finished && !!m.winner_id && m.winner_id !== m.team2_id} showScore={showScore} />
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
  hints,
}: {
  title: string;
  matches: MatchWithTeams[];
  totalUpper: number;
  totalLower: number;
  hints: SlotHints;
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
    const y1 = p.y + H / 2 + 13;
    const x2 = to.x;
    const y2 = to.y + H / 2 + 13;
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
                className={line.done ? "stroke-accent/60" : "stroke-line-strong"}
                strokeWidth="1.5"
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
                  "absolute flex h-9 items-center justify-between gap-2 whitespace-nowrap px-1 text-[15px] font-bold",
                  active ? "text-fg" : done ? "text-fg-3" : "text-fg-2",
                )}
                style={{ left: col * (W + GAP_X), top: 0, width: W }}
              >
                <span className="truncate">{roundTitle(inRound[0]?.bracket ?? side, r, totalUpper, totalLower)}</span>
                <span className="num text-meta font-medium text-fg-3">
                  {active && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-live align-middle animate-pulse" aria-hidden />}
                  {inRound.length} {inRound.length === 1 ? "матч" : inRound.length < 5 ? "матча" : "матчей"}
                </span>
              </div>
            );
          })}

          {all.map((p) => (
            <div key={p.m.id} className="absolute" style={{ left: p.x, top: p.y, width: W, height: H }}>
              <Node m={p.m} hints={hints} />
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
  const hints = slotHints(playoff);
  const bo = [...new Set(playoff.map((m) => m.best_of))].sort((a, b) => a - b);

  return (
    <BracketHover>
      <div className="space-y-10 lg:space-y-14">
        <div className="space-y-3">
          <div className="flex gap-3 rounded-surface bg-accent-dim px-4 py-3.5 text-[15px] text-fg-2 sm:px-5">
            <Info className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p>
              <b className="block text-fg">Как читать сетку</b>
              {bo.length > 1 ? `Ранние матчи — до ${Math.ceil(bo[0] / 2)} победы, решающие — до ${Math.ceil(bo[bo.length - 1] / 2)} побед.` : bo[0] === 1 ? "Каждый матч — одна карта." : `Каждый матч — до ${Math.ceil(bo[0] / 2)} побед.`}{" "}
              Победитель идёт в следующий столбец, проигравший выбывает.{" "}
              <span className="hidden md:inline">Наведите на команду — подсветится её путь.</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-meta text-fg-2">
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-[4px] bg-accent" aria-hidden /> победитель
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-[4px] border-2 border-live" aria-hidden /> идёт сейчас
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 rounded-[4px] border border-dashed border-line-strong" aria-hidden /> ещё не определён
            </span>
            <span className="inline-flex items-center gap-2 md:hidden">
              <MoveHorizontal className="size-4" aria-hidden /> листайте сетку в сторону
            </span>
          </div>
        </div>

        {upper.length > 0 && (
          <BracketSection
            title={lower.length ? "Верхняя сетка" : "Плей-офф"}
            matches={upper}
            totalUpper={totalUpper}
            totalLower={totalLower}
            hints={hints}
          />
        )}

        {lower.length > 0 && (
          <BracketSection title="Нижняя сетка" matches={lower} totalUpper={totalUpper} totalLower={totalLower} hints={hints} />
        )}

        {grandFinal.length > 0 && (
          <BracketSection title="Гранд-финал" matches={grandFinal} totalUpper={totalUpper} totalLower={totalLower} hints={hints} />
        )}

        {/* проигравшие полуфиналов играют за 3-е место */}
        {thirdPlace.length > 0 && (
          <BracketSection title={THIRD_PLACE_TITLE} matches={thirdPlace} totalUpper={totalUpper} totalLower={totalLower} hints={hints} />
        )}
      </div>
    </BracketHover>
  );
}
