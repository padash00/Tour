import Link from "next/link";
import type { StandingRow } from "@/lib/formats";
import type { Match, Team } from "@/lib/types";
import { MatchStatusBadge } from "./match-bits";
import { SubsectionTitle, TeamLogo, cn } from "./ds";

type StageMatchRow = Match & { maps: { team1_score: number; team2_score: number; winner_id: string | null; status: string }[] };
type TeamMap = Map<string, Pick<Team, "id" | "name" | "tag" | "logo_url">>;

const diff = (n: number) => (n > 0 ? `+${n}` : String(n));

function TeamCell({ team }: { team?: Pick<Team, "name" | "tag" | "logo_url"> }) {
  if (!team) return <span className="text-fg-3">TBD</span>;
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <TeamLogo src={team.logo_url} tag={team.tag} size="xs" />
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
      className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-control border border-line-subtle bg-surface px-4 text-[14px] transition-colors duration-[var(--dur-hover)] hover:border-line-strong hover:bg-surface-2"
    >
      <span className={cn("truncate", finished && m.winner_id !== m.team1_id ? "text-fg-3" : "text-fg")}>{t1?.name ?? (finished ? "Бай" : "TBD")}</span>
      <span className="text-center">
        {finished || m.status === "live" ? (
          <span className="num font-semibold">
            {m.team1_score}:{m.team2_score}
          </span>
        ) : (
          <MatchStatusBadge status={m.status} compact />
        )}
      </span>
      <span className={cn("truncate text-right", finished && m.winner_id !== m.team2_id ? "text-fg-3" : "text-fg")}>{t2?.name ?? (finished ? "Бай" : "TBD")}</span>
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
    <div className="overflow-x-auto">
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
              <tr key={r.teamId}>
                <td className="relative num text-fg-3">
                  {qualifies && <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-ok" />}
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

/**
 * Шахматка круговой системы: участники по строкам и столбцам (в порядке таблицы),
 * в клетке — счёт их встречи глазами участника строки; справа — итог.
 */
function CrossTable({
  rows,
  matches,
  teams,
  advance,
  solo,
}: {
  rows: StandingRow[];
  matches: StageMatchRow[];
  teams: TeamMap;
  advance?: number;
  solo?: boolean;
}) {
  const ids = rows.map((r) => r.teamId);
  const meet = (a: string, b: string) => matches.find((m) => (m.team1_id === a && m.team2_id === b) || (m.team1_id === b && m.team2_id === a));
  return (
    <div className="overflow-x-auto rounded-surface border border-line-subtle bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.14em] text-fg-3">
            <th className="w-8 px-3 py-3 text-left font-medium">#</th>
            <th className="px-3 py-3 text-left font-medium">{solo ? "Участник" : "Команда"}</th>
            {ids.map((id, j) => (
              <th key={id} className="w-[76px] px-1 py-3 text-center font-medium" title={teams.get(id)?.name}>
                <span className="inline-flex flex-col items-center gap-1">
                  <TeamLogo src={teams.get(id)?.logo_url ?? null} tag={teams.get(id)?.tag ?? "?"} size="xs" />
                  <span className="num">{j + 1}</span>
                </span>
              </th>
            ))}
            <th className="px-3 py-3 text-right font-medium">В–П</th>
            <th className="px-3 py-3 text-right font-medium">Карты</th>
            <th className="px-3 py-3 text-right font-medium">Раунды</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const qualifies = advance != null && i < advance;
            return (
              <tr key={r.teamId} className="border-t border-line-subtle">
                <td className="relative px-3 py-2.5 num text-fg-3">
                  {qualifies && <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-ok" />}
                  {i + 1}
                </td>
                <td className="px-3 py-2.5 max-w-[220px]">
                  <TeamCell team={teams.get(r.teamId)} />
                </td>
                {ids.map((col) => {
                  if (col === r.teamId) return <td key={col} className="p-1"><div className="h-10 rounded-[6px] bg-white/[0.03] [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.03)_6px_7px)]" /></td>;
                  const m = meet(r.teamId, col);
                  if (!m) return <td key={col} className="p-1" />;
                  const mine = m.team1_id === r.teamId;
                  const a = mine ? m.team1_score : m.team2_score;
                  const b = mine ? m.team2_score : m.team1_score;
                  const done = m.status === "finished";
                  const live = m.status === "live";
                  const won = done && m.winner_id === r.teamId;
                  const lost = done && !!m.winner_id && m.winner_id !== r.teamId;
                  return (
                    <td key={col} className="p-1">
                      <Link
                        href={`/matches/${m.id}`}
                        title={`${teams.get(r.teamId)?.name ?? ""} — ${teams.get(col)?.name ?? ""}`}
                        className={cn(
                          "grid h-10 place-items-center rounded-[6px] border num text-[14px] font-semibold transition-colors",
                          won && "border-ok/30 bg-ok/[0.10] text-ok hover:bg-ok/[0.16]",
                          lost && "border-danger/25 bg-danger/[0.08] text-danger/90 hover:bg-danger/[0.14]",
                          live && "border-accent/40 bg-accent/[0.10] text-accent hover:bg-accent/[0.16]",
                          !done && !live && "border-line-subtle text-fg-3 hover:border-line-strong",
                        )}
                      >
                        {done || live ? (
                          <span className="leading-none text-center">
                            {a}:{b}
                            {live && <span className="block mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em]">live</span>}
                          </span>
                        ) : (
                          <span className="text-[12px] font-normal">—</span>
                        )}
                      </Link>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right num font-semibold text-fg">
                  {r.wins}–{r.losses}
                </td>
                <td className="px-3 py-2.5 text-right num text-fg-2">{diff(r.mapWins - r.mapLosses)}</td>
                <td className="px-3 py-2.5 text-right num text-fg-2">{diff(r.roundsFor - r.roundsAgainst)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Группы / круговая система: шахматка и матчи по турам */
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
          <section key={g.label ?? "A"} className="min-w-0 space-y-4">
            <SubsectionTitle action={advance != null ? <span className="text-meta text-fg-3">выходят {advance} лучших</span> : undefined}>
              {single ? "Матчи по турам" : `Группа ${g.label}`}
            </SubsectionTitle>
            <CrossTable rows={g.table} matches={g.matches} teams={teams} advance={advance} solo={solo} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-3">
              <span>В клетке — счёт по картам глазами участника строки</span>
              <span><span className="text-ok">■</span> победа</span>
              <span><span className="text-danger">■</span> поражение</span>
              <span><span className="text-accent">■</span> идёт</span>
            </div>
            <div className={cn("grid gap-4", single && "md:grid-cols-2 lg:grid-cols-3")}>
              {rounds.map((r) => (
                <div key={r}>
                  <div className="mb-2 text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">Тур {r}</div>
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
                <div className="text-[12px] text-fg-3">Раунд {r}</div>
                {ordered.map(([rec, ms]) => (
                  <div key={rec} className="rounded-surface border border-line-subtle bg-surface p-2.5">
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
        <h3 className="mb-4 text-title text-fg">Таблица</h3>
        <StandingsTable rows={table} teams={teams} swiss solo={solo} />
      </div>
    </div>
  );
}
