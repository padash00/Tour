/* eslint-disable @next/next/no-img-element -- логотипы и аватары: внешние картинки Steam/Supabase */
import type { ReactNode } from "react";
import { formatTime, mapName } from "@/lib/format";
import type { MatchWithTeams } from "@/lib/matches";
import type { StandingRow } from "@/lib/formats";
import type { MatchStatus, Team } from "@/lib/types";
import { matchStage } from "../match-bits";
import { cn } from "../ui";

/*
 * Экраны режима ТВ. Размеры в vw/vh: страница рассчитана на телевизор 16:9 и читается с 5+ метров.
 */

export type TvMap = { match_id: string; map_number: number; map_name: string; status: string; team1_score: number; team2_score: number };
type MiniTeam = Pick<Team, "id" | "name" | "tag" | "logo_url">;

function Logo({ team, size }: { team: MiniTeam | null; size: string }) {
  if (team?.logo_url) return <img src={team.logo_url} alt="" className="shrink-0 rounded-[0.6vw] object-contain" style={{ width: size, height: size }} />;
  return (
    <span
      className="shrink-0 grid place-items-center rounded-[0.6vw] bg-surface-3 font-bold text-fg-2"
      style={{ width: size, height: size, fontSize: `calc(${size} * 0.32)` }}
    >
      {(team?.tag ?? "?").slice(0, 4).toUpperCase()}
    </span>
  );
}

export function TvEmpty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="h-full grid place-items-center text-center">
      <div>
        <img src="/brand/f16-symbol.svg" alt="" className="mx-auto h-[14vh] w-auto opacity-80" />
        <div className="mt-[3vh] text-[3.4vw] font-semibold tracking-[-0.02em]">{title}</div>
        {text && <div className="mt-[1.4vh] text-[1.5vw] text-fg-2">{text}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── LIVE

export function LivePanel({ matches, maps, all }: { matches: MatchWithTeams[]; maps: TvMap[]; all: MatchWithTeams[] }) {
  const big = matches.length === 1;
  return (
    <div className={cn("h-full grid gap-[2vh]", big ? "grid-rows-1" : matches.length === 2 ? "grid-rows-2" : "grid-cols-2 auto-rows-fr")}>
      {matches.slice(0, 4).map((m) => {
        const ms = maps.filter((x) => x.match_id === m.id).sort((a, b) => a.map_number - b.map_number);
        const cur = ms.find((x) => x.status === "live") ?? ms.find((x) => x.status !== "finished") ?? ms.at(-1);
        return (
          <div key={m.id} className="relative overflow-hidden rounded-[1vw] border border-white/[0.08] bg-[#0b1420]/85 px-[3vw] flex flex-col justify-center">
            <div className="absolute left-0 inset-y-0 w-[0.35vw] bg-danger" />
            <div className="flex items-center justify-between text-[1.2vw] text-fg-3">
              <span className="inline-flex items-center gap-[0.6vw] font-semibold uppercase tracking-[0.2em] text-danger">
                <span className="size-[0.8vw] rounded-full bg-danger animate-pulse" /> Live
              </span>
              <span className="uppercase tracking-[0.2em]">
                {matchStage(m, all)} · BO{m.best_of}
              </span>
            </div>
            <div className="mt-[2vh] grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw]">
              <TeamSide team={m.team1} size={big ? "9vw" : "5vw"} big={big} />
              <div className="text-center">
                <div className={cn("num font-semibold leading-none tracking-[-0.03em]", big ? "text-[10vw]" : "text-[5vw]")}>
                  {cur ? (
                    <>
                      {cur.team1_score}
                      <span className="text-fg-3">:</span>
                      {cur.team2_score}
                    </>
                  ) : (
                    "0:0"
                  )}
                </div>
                <div className={cn("mt-[1vh] text-fg-2", big ? "text-[1.8vw]" : "text-[1.15vw]")}>
                  {cur ? `${mapName(cur.map_name)} · карта ${cur.map_number}` : "Карта"}
                  {m.best_of > 1 && (
                    <span className="ml-[0.8vw] num text-fg">
                      серия {m.team1_score}:{m.team2_score}
                    </span>
                  )}
                </div>
              </div>
              <TeamSide team={m.team2} size={big ? "9vw" : "5vw"} big={big} right />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamSide({ team, size, big, right }: { team: MiniTeam | null; size: string; big: boolean; right?: boolean }) {
  return (
    <div className={cn("flex items-center gap-[1.6vw] min-w-0", right && "flex-row-reverse text-right")}>
      <Logo team={team} size={size} />
      <div className={cn("min-w-0 font-semibold tracking-[-0.02em] leading-[1.05] line-clamp-2 break-words", big ? "text-[3.6vw]" : "text-[2.2vw]")}>{team?.name ?? "TBD"}</div>
    </div>
  );
}

// ───────────────────────── сетка

export function BracketPanel({ matches }: { matches: MatchWithTeams[] }) {
  const playoff = matches.filter((m) => (m.stage ?? "playoff") === "playoff");
  const upper = playoff.filter((m) => m.bracket === "upper");
  const lower = playoff.filter((m) => m.bracket === "lower");
  const gf = playoff.filter((m) => m.bracket === "grand_final");
  const totalUpper = Math.max(0, ...upper.map((m) => m.round));
  const upperCols = groupRounds([...upper, ...gf.map((m) => ({ ...m, round: totalUpper + 1 }))]);
  const lowerCols = groupRounds(lower);
  return (
    <div className="h-full flex flex-col gap-[2.4vh]">
      <BracketRow title={lower.length ? "Верхняя сетка" : null} cols={upperCols} all={playoff} grow={lower.length ? 1.25 : 1} />
      {lower.length > 0 && <BracketRow title="Нижняя сетка" cols={lowerCols} all={playoff} grow={1} />}
    </div>
  );
}

function groupRounds(list: MatchWithTeams[]) {
  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((r) => list.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
}

function BracketRow({ title, cols, all, grow }: { title: string | null; cols: MatchWithTeams[][]; all: MatchWithTeams[]; grow: number }) {
  return (
    <div className="min-h-0 flex flex-col" style={{ flexGrow: grow }}>
      {title && <div className="mb-[1vh] text-[1vw] uppercase tracking-[0.3em] text-fg-3">{title}</div>}
      <div className="flex-1 min-h-0 grid gap-[1.4vw]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map((col, i) => (
          <div key={i} className="min-h-0 flex flex-col">
            <div className="mb-[0.8vh] truncate text-[0.85vw] uppercase tracking-[0.18em] text-fg-3">{col[0] ? matchStage(col[0], all) : ""}</div>
            <div className="flex-1 min-h-0 flex flex-col justify-around gap-[0.8vh]">
              {col.map((m) => (
                <BracketNode key={m.id} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketNode({ m }: { m: MatchWithTeams }) {
  const fin = m.status === "finished";
  const live = m.status === "live";
  const row = (team: MiniTeam | null, score: number, won: boolean) => (
    <div className={cn("flex items-center gap-[0.6vw] px-[0.7vw] h-[3.4vh]", fin && !won && "opacity-45")}>
      <Logo team={team} size="2.2vh" />
      <span className={cn("flex-1 min-w-0 truncate text-[1vw]", won ? "font-semibold text-fg" : "text-fg-2")}>
        {team?.name ?? (fin ? "бай" : "TBD")}
      </span>
      {(fin || live) && <span className={cn("num text-[1vw]", won ? "text-accent font-semibold" : "text-fg-3")}>{score}</span>}
    </div>
  );
  return (
    <div
      className={cn(
        "rounded-[0.5vw] border bg-[#0b1420]/90 divide-y divide-white/[0.06] overflow-hidden",
        live ? "border-danger/60" : "border-white/[0.08]",
      )}
    >
      {row(m.team1, m.team1_score, fin && m.winner_id === m.team1_id)}
      {row(m.team2, m.team2_score, fin && m.winner_id === m.team2_id)}
    </div>
  );
}

// ───────────────────────── таблицы групп / швейцарки

export function StandingsPanel({
  groups,
  teams,
  swiss,
}: {
  groups: { label: string | null; table: StandingRow[] }[];
  teams: Map<string, MiniTeam>;
  swiss: boolean;
}) {
  return (
    <div className={cn("h-full grid gap-[2vw]", groups.length > 1 && "grid-cols-2")}>
      {groups.slice(0, 4).map((g) => (
        <div key={g.label ?? "A"} className="min-h-0 overflow-hidden rounded-[1vw] border border-white/[0.08] bg-[#0b1420]/85 p-[1.6vw]">
          {groups.length > 1 && <div className="mb-[1.2vh] text-[1.1vw] uppercase tracking-[0.3em] text-fg-3">Группа {g.label}</div>}
          <table className="w-full">
            <thead>
              <tr className="text-left text-[0.95vw] uppercase tracking-[0.18em] text-fg-3">
                <th className="pb-[1vh] font-medium w-[3vw]">#</th>
                <th className="pb-[1vh] font-medium">{swiss ? "Участник" : "Команда"}</th>
                <th className="pb-[1vh] font-medium text-right">В–П</th>
                <th className="pb-[1vh] font-medium text-right">Карты</th>
                <th className="pb-[1vh] font-medium text-right">Раунды</th>
              </tr>
            </thead>
            <tbody>
              {g.table.slice(0, groups.length > 1 ? 6 : 12).map((r, i) => {
                const t = teams.get(r.teamId) ?? null;
                return (
                  <tr key={r.teamId} className={cn("border-t border-white/[0.06]", r.status === "eliminated" && "opacity-45")}>
                    <td className="py-[0.9vh] num text-[1.3vw] text-fg-3">{i + 1}</td>
                    <td className="py-[0.9vh]">
                      <span className="flex items-center gap-[0.8vw]">
                        <Logo team={t} size="3.4vh" />
                        <span className="truncate text-[1.5vw] font-semibold">{t?.name ?? "—"}</span>
                        {r.status === "advanced" && <span className="text-[0.9vw] uppercase tracking-[0.2em] text-ok">прошёл</span>}
                      </span>
                    </td>
                    <td className="py-[0.9vh] num text-right text-[1.4vw]">
                      {r.wins}–{r.losses}
                    </td>
                    <td className="py-[0.9vh] num text-right text-[1.3vw] text-fg-2">
                      {r.mapWins}:{r.mapLosses}
                    </td>
                    <td className="py-[0.9vh] num text-right text-[1.3vw] text-fg-2">
                      {r.roundsFor - r.roundsAgainst > 0 ? "+" : ""}
                      {r.roundsFor - r.roundsAgainst}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── ближайшие матчи

const STATUS: Partial<Record<MatchStatus, { text: string; cls: string }>> = {
  veto: { text: "Вето карт", cls: "text-warn border-warn/40 bg-warn/[0.08]" },
  ready: { text: "Сервер готов", cls: "text-accent border-accent/40 bg-accent/[0.08]" },
  upcoming: { text: "Ждёт старта", cls: "text-fg-2 border-white/15 bg-white/[0.03]" },
  pending: { text: "Ждёт соперника", cls: "text-fg-3 border-white/10 bg-white/[0.02]" },
};

export function UpcomingPanel({ matches, all }: { matches: MatchWithTeams[]; all: MatchWithTeams[] }) {
  return (
    <div className="h-full grid grid-cols-2 auto-rows-fr gap-[1.6vh] content-start" style={{ gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
      {matches.slice(0, 6).map((m) => {
        const st = STATUS[m.status];
        return (
          <div key={m.id} className="rounded-[1vw] border border-white/[0.08] bg-[#0b1420]/85 px-[2vw] flex flex-col justify-center">
            <div className="flex items-center justify-between gap-[1vw] text-[1vw]">
              <span className="truncate uppercase tracking-[0.2em] text-fg-3">
                #{m.number} · {matchStage(m, all)} · BO{m.best_of}
              </span>
              {st && <span className={cn("shrink-0 inline-flex items-center rounded-[0.4vw] border px-[0.8vw] py-[0.3vh]", st.cls)}>{st.text}</span>}
            </div>
            <div className="mt-[1.4vh] grid grid-cols-[1fr_auto_1fr] items-center gap-[1.4vw]">
              <span className="flex items-center gap-[1vw] min-w-0">
                <Logo team={m.team1} size="5vh" />
                <span className="truncate text-[1.9vw] font-semibold">{m.team1?.name ?? "TBD"}</span>
              </span>
              <span className="num text-[1.6vw] text-fg-3">{m.scheduled_at ? formatTime(m.scheduled_at) : "vs"}</span>
              <span className="flex items-center justify-end gap-[1vw] min-w-0 text-right">
                <span className="truncate text-[1.9vw] font-semibold">{m.team2?.name ?? "TBD"}</span>
                <Logo team={m.team2} size="5vh" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── лидеры статистики

export type TvLeader = { name: string; avatar: string | null; team: string | null; rating: number; kd: number; adr: number; maps: number };

export function LeadersPanel({ leaders, mvp }: { leaders: TvLeader[]; mvp: (TvLeader & { by: "swing" | "rating"; swing: number | null }) | null }) {
  return (
    <div className="h-full grid grid-cols-[1fr_1.35fr] gap-[2vw]">
      <div className="relative overflow-hidden rounded-[1vw] border border-accent/30 bg-[#0b1420]/85 p-[2.4vw] flex flex-col justify-center">
        {mvp ? (
          <>
            <div className="text-[1.1vw] uppercase tracking-[0.3em] text-accent">MVP турнира</div>
            <div className="mt-[3vh] flex items-center gap-[1.6vw]">
              {mvp.avatar ? (
                <img src={mvp.avatar} alt="" className="size-[12vh] rounded-full object-cover" />
              ) : (
                <span className="size-[12vh] rounded-full bg-surface-3" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[3.2vw] font-semibold tracking-[-0.02em]">{mvp.name}</div>
                {mvp.team && <div className="text-[1.4vw] text-fg-2">{mvp.team}</div>}
              </div>
            </div>
            <div className="mt-[4vh] grid grid-cols-3 gap-[1vw]">
              <Big label="F16 Rating" value={mvp.rating.toFixed(2)} />
              <Big label="ADR" value={mvp.adr.toFixed(0)} />
              <Big label={mvp.by === "swing" && mvp.swing != null ? "Swing" : "K/D"} value={mvp.by === "swing" && mvp.swing != null ? `${mvp.swing > 0 ? "+" : ""}${mvp.swing.toFixed(1)}` : mvp.kd.toFixed(2)} />
            </div>
          </>
        ) : (
          <div className="text-[1.6vw] text-fg-2">MVP появится, когда игроки сыграют достаточно карт.</div>
        )}
      </div>
      <div className="rounded-[1vw] border border-white/[0.08] bg-[#0b1420]/85 p-[2vw]">
        <div className="mb-[1.6vh] grid grid-cols-[3vw_1fr_7vw_6vw_6vw] text-[0.95vw] uppercase tracking-[0.18em] text-fg-3">
          <span>#</span>
          <span>Игрок</span>
          <span className="text-right">Rating</span>
          <span className="text-right">K/D</span>
          <span className="text-right">ADR</span>
        </div>
        {leaders.slice(0, 8).map((p, i) => (
          <div key={p.name + i} className="grid grid-cols-[3vw_1fr_7vw_6vw_6vw] items-center border-t border-white/[0.06] py-[1.05vh]">
            <span className={cn("num text-[1.4vw]", i < 3 ? "text-accent font-semibold" : "text-fg-3")}>{i + 1}</span>
            <span className="flex items-center gap-[0.8vw] min-w-0">
              {p.avatar ? <img src={p.avatar} alt="" className="size-[3.6vh] rounded-full object-cover" /> : <span className="size-[3.6vh] rounded-full bg-surface-3" />}
              <span className="truncate text-[1.5vw] font-semibold">{p.name}</span>
              {p.team && <span className="truncate text-[1vw] text-fg-3">{p.team}</span>}
            </span>
            <span className="num text-right text-[1.5vw] font-semibold">{p.rating.toFixed(2)}</span>
            <span className="num text-right text-[1.3vw] text-fg-2">{p.kd.toFixed(2)}</span>
            <span className="num text-right text-[1.3vw] text-fg-2">{p.adr.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="num text-[3vw] font-semibold leading-none">{value}</div>
      <div className="mt-[1vh] text-[0.95vw] uppercase tracking-[0.2em] text-fg-3">{label}</div>
    </div>
  );
}

// ───────────────────────── чемпион

export type TvPlace = { place: string; team: MiniTeam; roster: string[] };

export function ChampionPanel({ places, mvpName }: { places: TvPlace[]; mvpName: string | null }) {
  const champ = places.find((p) => p.place === "1");
  const rest = places.filter((p) => p.place !== "1");
  if (!champ) return <TvEmpty title="Турнир завершён" text="Итоги появятся после подсчёта результатов." />;
  return (
    <div className="h-full grid grid-rows-[1.6fr_1fr] gap-[2.4vh]">
      <div className="relative overflow-hidden rounded-[1.2vw] border border-accent/30 bg-[#0b1420]/85 px-[4vw] flex items-center gap-[3vw]">
        <div className="absolute -right-[4vw] -top-[6vh] text-[22vw] font-bold leading-none text-white/[0.03] select-none">1</div>
        <Logo team={champ.team} size="22vh" />
        <div className="min-w-0">
          <div className="text-[1.4vw] uppercase tracking-[0.34em] text-accent">Чемпион</div>
          <div className="mt-[1.4vh] truncate text-[5.6vw] font-semibold leading-none tracking-[-0.03em]">{champ.team.name}</div>
          {champ.roster.length > 0 && <div className="mt-[2.2vh] truncate text-[1.5vw] text-fg-2">{champ.roster.join(" · ")}</div>}
          {mvpName && (
            <div className="mt-[1.6vh] text-[1.3vw] text-fg-3">
              MVP турнира: <span className="text-fg font-semibold">{mvpName}</span>
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-[2vw]" style={{ gridTemplateColumns: `repeat(${Math.max(1, rest.length)}, minmax(0,1fr))` }}>
        {rest.map((p) => (
          <div key={p.place + p.team.id} className="rounded-[1vw] border border-white/[0.08] bg-[#0b1420]/85 px-[2.4vw] flex items-center gap-[1.6vw]">
            <span className="num text-[4vw] font-semibold text-fg-3">{p.place}</span>
            <Logo team={p.team} size="9vh" />
            <div className="min-w-0">
              <div className="truncate text-[2.2vw] font-semibold">{p.team.name}</div>
              {p.roster.length > 0 && <div className="truncate text-[1.05vw] text-fg-3">{p.roster.join(" · ")}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
