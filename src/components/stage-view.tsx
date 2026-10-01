import Link from "next/link";
import type { StandingRow } from "@/lib/formats";
import type { Match, Team } from "@/lib/types";
import { MatchStatusBadge } from "./match-bits";
import { TeamLogo, cn } from "./ui";

type StageMatchRow = Match & { maps: { team1_score: number; team2_score: number; winner_id: string | null; status: string }[] };
type TeamMap = Map<string, Pick<Team, "id" | "name" | "tag" | "logo_url">>;

const diff = (n: number) => (n > 0 ? `+${n}` : String(n));

function TeamCell({ team }: { team?: Pick<Team, "name" | "tag" | "logo_url"> }) {
  if (!team) return <span className="text-fg-3">TBD</span>;
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <TeamLogo src={team.logo_url} tag={team.tag} size={24} />
      <span className="truncate font-medium text-fg">{team.name}</span>
    </span>
  );
}

/** Компактная строка матча стадии */
function StageMatchLine({ m, teams }: { m: StageMatchRow; teams: TeamMap }) {
  const finished = m.status === "finished";
  const t1 = m.team1_id ? teams.get(m.team1_id) : undefined;
  const t2 = m.team2_id ? teams.get(m.team2_id) : undefined;
  return (
    <Link
      href={`/matches/${m.id}`}
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-line bg-surface px-3 h-11 text-[13px] hover:border-line-strong transition"
    >
      <span className={cn("truncate", finished && m.winner_id !== m.team1_id ? "text-fg-3" : "text-fg")}>{t1?.name ?? "TBD"}</span>
      <span className="text-center">
        {finished || m.status === "live" ? (
          <span className="num font-semibold">
            {m.team1_score}:{m.team2_score}
          </span>
        ) : (
          <MatchStatusBadge status={m.status} compact />
        )}
      </span>
      <span className={cn("truncate text-right", finished && m.winner_id !== m.team2_id ? "text-fg-3" : "text-fg")}>{t2?.name ?? "TBD"}</span>
    </Link>
  );
}

function StandingsTable({
  rows,
  teams,
  advance,
  swiss,
  solo,
}: {
  rows: StandingRow[];
  teams: TeamMap;
  advance?: number;
  swiss?: boolean;
  solo?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="tbl min-w-[520px] text-[13px]">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>{solo ? "Участник" : "Команда"}</th>
            <th className="text-right">И</th>
            <th className="text-right">{swiss ? "Счёт" : "В–П"}</th>
            <th className="text-right">Карты</th>
            <th className="text-right">Раунды</th>
            {swiss && <th className="text-right" title="Бухгольц: сила соперников">Бх</th>}
            {swiss && <th className="text-right">Статус</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const qualifies = advance != null && i < advance;
            return (
              <tr key={r.teamId} className={cn(qualifies && "bg-ok-dim/40")}>
                <td className="relative num text-fg-3">
                  {qualifies && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-ok" />}
                  {i + 1}
                </td>
                <td>
                  <TeamCell team={teams.get(r.teamId)} />
                </td>
                <td className="text-right num">{r.played}</td>
                <td className="text-right num font-semibold text-fg">
                  {r.wins}–{r.losses}
                </td>
                <td className="text-right num">{diff(r.mapWins - r.mapLosses)}</td>
                <td className="text-right num">{diff(r.roundsFor - r.roundsAgainst)}</td>
                {swiss && <td className="text-right num text-fg-3">{diff(r.buchholz)}</td>}
                {swiss && (
                  <td className="text-right">
                    {r.status === "advanced" ? (
                      <span className="text-ok text-xs font-semibold">Вышел</span>
                    ) : r.status === "eliminated" ? (
                      <span className="text-danger text-xs">Выбыл</span>
                    ) : (
                      <span className="text-fg-3 text-xs">в игре</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Группы / круговая система: таблица и матчи по турам */
export function GroupStageView({
  groups,
  teams,
  advance,
  solo,
}: {
  groups: { label: string | null; table: StandingRow[]; matches: StageMatchRow[] }[];
  teams: TeamMap;
  advance?: number;
  solo?: boolean;
}) {
  const single = groups.length === 1;
  return (
    <div className={cn("grid gap-8", !single && "xl:grid-cols-2")}>
      {groups.map((g) => {
        const rounds = [...new Set(g.matches.map((m) => m.round))].sort((a, b) => a - b);
        return (
          <section key={g.label ?? "A"} className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold tracking-tight">{single ? "Таблица" : `Группа ${g.label}`}</h3>
              {advance != null && <span className="text-xs text-fg-3">выходят {advance} лучших</span>}
            </div>
            <StandingsTable rows={g.table} teams={teams} advance={advance} solo={solo} />
            <div className={cn("grid gap-4", single && "md:grid-cols-2 lg:grid-cols-3")}>
              {rounds.map((r) => (
                <div key={r}>
                  <div className="label mb-2">Тур {r}</div>
                  <div className="space-y-1.5">
                    {g.matches
                      .filter((m) => m.round === r)
                      .map((m) => (
                        <StageMatchLine key={m.id} m={m} teams={teams} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Швейцарская система: раунды колонками, внутри — пулы по счёту; таблица со статусами */
export function SwissView({
  table,
  matches,
  teams,
  wins,
  solo,
}: {
  table: StandingRow[];
  matches: StageMatchRow[];
  teams: TeamMap;
  wins: number;
  solo?: boolean;
}) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  // счёт команды перед раундом r: победы/поражения в раундах < r
  const recordBefore = (teamId: string, r: number) => {
    let w = 0;
    let l = 0;
    for (const m of matches) {
      if (m.round >= r || m.status !== "finished" || !m.winner_id) continue;
      if (m.team1_id !== teamId && m.team2_id !== teamId) continue;
      if (m.winner_id === teamId) w++;
      else l++;
    }
    return `${w}–${l}`;
  };
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto pb-2 -mx-4 px-4">
        <div className="flex gap-5 min-w-max">
          {rounds.map((r) => {
            const list = matches.filter((m) => m.round === r);
            const pools = new Map<string, StageMatchRow[]>();
            for (const m of list) {
              const key = m.team1_id ? recordBefore(m.team1_id, r) : "—";
              if (!pools.has(key)) pools.set(key, []);
              pools.get(key)!.push(m);
            }
            const ordered = [...pools.entries()].sort(([a], [b]) => {
              const [aw, al] = a.split("–").map(Number);
              const [bw, bl] = b.split("–").map(Number);
              return bw - aw || al - bl;
            });
            return (
              <div key={r} className="w-[260px] space-y-4">
                <div className="text-xs font-medium text-fg-2">Раунд {r}</div>
                {ordered.map(([rec, ms]) => (
                  <div key={rec} className="rounded-xl border border-line bg-bg-2/60 p-2.5">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="num font-semibold text-fg-2">{rec}</span>
                      <span className="text-fg-3">
                        {rec.startsWith(`${wins - 1}–`) ? "матч за выход" : rec.endsWith(`–${wins - 1}`) ? "матч на вылет" : ""}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {ms.map((m) => (
                        <StageMatchLine key={m.id} m={m} teams={teams} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="mb-4 text-lg font-bold tracking-tight">Таблица</h3>
        <StandingsTable rows={table} teams={teams} swiss solo={solo} />
      </div>
    </div>
  );
}
