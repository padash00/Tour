import Link from "next/link";
import { roundTitle } from "@/lib/bracket";
import type { MatchWithTeams } from "@/lib/matches";
import type { BracketSide, Team } from "@/lib/types";
import { TeamLogo, cn } from "./ui";
import { MatchStatusBadge } from "./match-bits";

function Slot({
  team,
  score,
  winner,
  showScore,
  placeholder,
}: {
  team: Team | null;
  score: number;
  winner: boolean;
  showScore: boolean;
  placeholder: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 h-9 px-2.5", winner ? "text-fg" : team ? "text-fg-2" : "text-fg-3")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size={20} /> : <span className="size-5 rounded-md border border-dashed border-line-strong" />}
      <span className={cn("flex-1 truncate text-[13px]", winner && "font-semibold")}>{team?.name ?? placeholder}</span>
      {showScore && <span className={cn("num text-[13px] w-4 text-right", winner ? "text-accent" : "text-fg-3")}>{score}</span>}
    </div>
  );
}

function Node({ m }: { m: MatchWithTeams }) {
  const finished = m.status === "finished";
  const bye = m.is_walkover && (!m.team1_id || !m.team2_id);
  if (m.status === "cancelled" || bye) {
    return (
      <div className="w-[220px] rounded-lg border border-dashed border-line/70 px-3 py-2 text-[11px] text-fg-3">
        #{m.number} · {bye ? `${(m.team1 ?? m.team2)?.name ?? "—"} проходит дальше` : "пустой матч"}
      </div>
    );
  }
  const live = m.status === "live" || m.status === "veto";
  return (
    <Link
      href={`/matches/${m.id}`}
      className={cn(
        "block w-[220px] rounded-lg border bg-surface transition hover:border-line-strong",
        live ? "border-[#ef7a7a55]" : "border-line",
      )}
    >
      <div className="flex items-center justify-between px-2.5 pt-1.5 text-[10px] text-fg-3">
        <span className="num">#{m.number} · BO{m.best_of}</span>
        <MatchStatusBadge status={m.status} compact />
      </div>
      <Slot
        team={m.team1}
        score={m.team1_score}
        winner={finished && m.winner_id === m.team1_id}
        showScore={finished || m.status === "live"}
        placeholder="TBD"
      />
      <div className="h-px bg-line mx-2.5" />
      <Slot
        team={m.team2}
        score={m.team2_score}
        winner={finished && m.winner_id === m.team2_id}
        showScore={finished || m.status === "live"}
        placeholder="TBD"
      />
    </Link>
  );
}

function Section({ title, matches, side, totalUpper, totalLower }: {
  title: string;
  matches: MatchWithTeams[];
  side: BracketSide;
  totalUpper: number;
  totalLower: number;
}) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <section>
      <div className="label mb-4">{title}</div>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="flex gap-6 min-w-max">
          {rounds.map((r) => {
            const list = matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
            return (
              <div key={r} className="flex flex-col">
                <div className="mb-3 text-xs font-medium text-fg-2 whitespace-nowrap">
                  {roundTitle(side, r, totalUpper, totalLower)}
                </div>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {list.map((m) => (
                    <Node key={m.id} m={m} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function BracketView({ matches }: { matches: MatchWithTeams[] }) {
  const upper = matches.filter((m) => m.bracket === "upper");
  const lower = matches.filter((m) => m.bracket === "lower");
  const gf = matches.filter((m) => m.bracket === "grand_final");
  const totalUpper = Math.max(0, ...upper.map((m) => m.round));
  const totalLower = Math.max(0, ...lower.map((m) => m.round));

  return (
    <div className="space-y-10">
      <Section title={lower.length ? "Верхняя сетка" : "Сетка"} matches={upper} side="upper" totalUpper={totalUpper} totalLower={totalLower} />
      {lower.length > 0 && (
        <Section title="Нижняя сетка" matches={lower} side="lower" totalUpper={totalUpper} totalLower={totalLower} />
      )}
      {gf.length > 0 && (
        <Section title="Финал" matches={gf} side="grand_final" totalUpper={totalUpper} totalLower={totalLower} />
      )}
    </div>
  );
}
