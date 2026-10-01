import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { vetoAct } from "@/app/actions/match";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { formatDateTime, mapName } from "@/lib/format";
import { applyVetoTimeouts, getMatch, getMatchRosters, getTournamentMatches } from "@/lib/matches";
import type { Team } from "@/lib/types";
import { aggregatePlayers, getStatRows } from "@/lib/stats";
import { vetoState } from "@/lib/veto";
import { PlayerStatsTable } from "@/components/stats-table";
import { ActionForm, CopyField } from "@/components/forms";
import { Countdown, LiveRefresh } from "@/components/live-refresh";
import { MatchStatusBadge, matchStage } from "@/components/match-bits";
import { RosterList } from "@/components/roster-list";
import { ButtonLink, Card, Container, EmptyState, Notice, SectionTitle, TeamLogo, buttonClass, cn } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/matches/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getMatch(id);
  return { title: m ? `${m.team1?.name ?? "TBD"} vs ${m.team2?.name ?? "TBD"}` : "Матч" };
}

export default async function MatchPage(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  await applyVetoTimeouts(id);
  const m = await getMatch(id);
  if (!m || m.tournament.status === "draft") notFound();

  const [player, all, rosters, statRows] = await Promise.all([
    getCurrentPlayer(),
    getTournamentMatches(m.tournament_id),
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
  ]);
  const membership = player ? await getActiveMembership(player.id) : null;
  const myTeam = membership && (membership.team.id === m.team1_id || membership.team.id === m.team2_id) ? membership.team : null;
  const isCaptain = !!myTeam && myTeam.captain_id === player?.id;
  const inRoster = [...rosters.team1, ...rosters.team2].some((r) => r.player.id === player?.id);
  const admin = isAdmin(player);
  const finished = m.status === "finished";
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  const turnTeam = state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  const myTurn = m.status === "veto" && isCaptain && turnTeam?.id === myTeam?.id;
  const stage = matchStage(m, all);

  return (
    <>
      {["upcoming", "veto", "ready", "live"].includes(m.status) && <LiveRefresh intervalMs={m.status === "veto" ? 2000 : 5000} />}

      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <Container className="relative pt-10 pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-3">
            <Link href={`/tournaments/${m.tournament.slug}?tab=bracket`} className="hover:text-fg-2">
              ← {m.tournament.name}
            </Link>
            <div className="flex items-center gap-3">
              <span>{stage}</span>
              <span className="num">#{m.number}</span>
              <span>BO{m.best_of}</span>
              <MatchStatusBadge status={m.status} />
              {admin && (
                <Link href={`/admin/matches/${m.id}`} className="text-accent hover:underline">
                  Управление →
                </Link>
              )}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-10">
            <TeamSide team={m.team1} align="left" winner={finished && m.winner_id === m.team1_id} dim={finished && m.winner_id !== m.team1_id} />
            <div className="text-center">
              {finished || m.status === "live" ? (
                <div className="num text-4xl sm:text-6xl font-bold tracking-tight">
                  <span className={cn(finished && m.winner_id !== m.team1_id && "text-fg-3")}>{m.team1_score}</span>
                  <span className="text-fg-3 mx-2 sm:mx-4">:</span>
                  <span className={cn(finished && m.winner_id !== m.team2_id && "text-fg-3")}>{m.team2_score}</span>
                </div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-fg-3">VS</div>
              )}
              {m.is_walkover && finished && <div className="mt-2 text-xs text-fg-3">техническая победа</div>}
              {m.scheduled_at && !finished && <div className="mt-2 text-xs text-fg-3">{formatDateTime(m.scheduled_at)}</div>}
            </div>
            <TeamSide team={m.team2} align="right" winner={finished && m.winner_id === m.team2_id} dim={finished && m.winner_id !== m.team2_id} />
          </div>
        </Container>
      </section>

      <Container className="pt-10 grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          {/* VETO */}
          {m.status === "pending" || m.status === "upcoming" ? (
            <EmptyState
              compact
              title={m.status === "pending" ? "Ожидаем соперников" : "Вето ещё не началось"}
              description={
                m.status === "pending"
                  ? "Команды определятся по итогам предыдущих матчей."
                  : "Администратор запустит вето, когда команды будут готовы. Капитанам придёт уведомление."
              }
            />
          ) : m.veto.length > 0 || m.status === "veto" ? (
            <Card className="p-6">
              <SectionTitle
                title="Вето карт"
                action={
                  m.status === "veto" && state.current && m.veto_deadline ? (
                    <div className="text-right">
                      <div className="text-xs text-fg-3">
                        {state.current.action === "ban" ? "Бан" : "Пик"} · {turnTeam?.name}
                      </div>
                      <div className="num text-xl font-bold">
                        <Countdown deadline={m.veto_deadline} />
                      </div>
                    </div>
                  ) : null
                }
              />
              {myTurn && (
                <div className="mb-4">
                  <Notice tone="warn">
                    Ваш ход: {state.current?.action === "ban" ? "забаньте" : "выберите"} карту. Если время выйдет — карта
                    выберется случайно.
                  </Notice>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {m.tournament.map_pool.map((map) => {
                  const act = m.veto.find((a) => a.map_name === map);
                  const by = act?.team_id === m.team1_id ? m.team1 : act?.team_id === m.team2_id ? m.team2 : null;
                  const available = !act && m.status === "veto";
                  const tile = (
                    <div
                      className={cn(
                        "relative h-20 rounded-xl border p-3 flex flex-col justify-between text-left transition w-full",
                        act?.action === "ban" && "border-line bg-bg-2 opacity-50",
                        act?.action === "pick" && "border-[#8bb8ff55] bg-accent-dim",
                        act?.action === "decider" && "border-[#6cc59a55] bg-ok-dim",
                        !act && "border-line bg-surface-2",
                        available && myTurn && "hover:border-accent cursor-pointer",
                      )}
                    >
                      <span className={cn("font-semibold", act?.action === "ban" && "line-through")}>{mapName(map)}</span>
                      <span className="text-[11px] text-fg-3">
                        {act
                          ? act.action === "decider"
                            ? "Decider"
                            : `${act.action === "ban" ? "Бан" : "Пик"} · ${by?.tag ?? "авто"}${act.auto ? " (таймер)" : ""}`
                          : " "}
                      </span>
                    </div>
                  );
                  return available && myTurn ? (
                    <ActionForm key={map} action={vetoAct}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <input type="hidden" name="map" value={map} />
                      <button type="submit" className="w-full">
                        {tile}
                      </button>
                    </ActionForm>
                  ) : (
                    <div key={map}>{tile}</div>
                  );
                })}
              </div>
              <ol className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
                {state.plan.map((s) => {
                  const done = m.veto.find((a) => a.step === s.step);
                  const t = s.team === 1 ? m.team1?.tag : s.team === 2 ? m.team2?.tag : null;
                  return (
                    <li key={s.step} className={cn(done ? "text-fg-2" : state.current?.step === s.step ? "text-warn" : "")}>
                      {s.step}. {t ?? ""} {s.action === "ban" ? "ban" : s.action === "pick" ? "pick" : "decider"}
                      {done ? ` · ${mapName(done.map_name)}` : ""}
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}

          {/* MAPS */}
          {m.maps.length > 0 && (
            <Card className="p-6">
              <SectionTitle title="Карты серии" />
              <div className="divide-y divide-line">
                {m.maps.map((map) => (
                  <div key={map.id} className="flex items-center gap-4 py-3">
                    <span className="num text-xs text-fg-3 w-12">Map {map.map_number}</span>
                    <span className="font-semibold flex-1">{mapName(map.map_name)}</span>
                    <span className="text-xs text-fg-3 hidden sm:block">
                      {map.picked_by ? `пик ${map.picked_by === m.team1_id ? m.team1?.tag : m.team2?.tag}` : "decider"}
                    </span>
                    {map.status === "pending" ? (
                      <span className="text-xs text-fg-3 w-16 text-right">—</span>
                    ) : (
                      <span className="num w-16 text-right font-semibold">
                        {map.status === "live" && <span className="mr-2 inline-block size-1.5 rounded-full bg-danger animate-pulse" />}
                        {map.team1_score}:{map.team2_score}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* SCOREBOARD */}
          {statRows.length > 0 && (
            <section className="space-y-6">
              {[...new Set(statRows.map((r) => r.map_number))]
                .sort((a, b) => a - b)
                .map((n) => {
                  const map = m.maps.find((x) => x.map_number === n);
                  const rows = statRows.filter((r) => r.map_number === n);
                  const rosterPlayers = [...rosters.team1, ...rosters.team2].map((r) => r.player);
                  return [m.team1, m.team2].map((team, i) => {
                    const teamRows = aggregatePlayers(rows.filter((r) => r.team_id === team?.id))
                      .map((a) => ({ ...a, player: rosterPlayers.find((p) => p.steam_id === a.steam_id) ?? null }))
                      .sort((a, b) => b.rating - a.rating);
                    if (!teamRows.length) return null;
                    return (
                      <div key={`${n}-${i}`}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-semibold">{team?.name}</span>
                          <span className="text-fg-3">
                            Map {n} · {map ? mapName(map.map_name) : ""} {map ? `· ${i === 0 ? map.team1_score : map.team2_score}` : ""}
                          </span>
                        </div>
                        <PlayerStatsTable rows={teamRows} showTeam={false} compact rank={false} />
                      </div>
                    );
                  });
                })}
            </section>
          )}

          {/* SERVER */}
          {["ready", "live"].includes(m.status) && (inRoster || admin) && (
            <Card className="p-6">
              <SectionTitle title="Подключение" />
              {m.server_address ? (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="label mb-2">Сервер</div>
                      <CopyField value={`connect ${m.server_address}${m.server_password ? `; password ${m.server_password}` : ""}`} />
                    </div>
                  </div>
                  <a
                    href={`steam://connect/${m.server_address}${m.server_password ? `/${m.server_password}` : ""}`}
                    className={buttonClass("primary", "lg")}
                  >
                    Подключиться
                  </a>
                  <p className="text-xs text-fg-3">
                    В разминке напишите <span className="num text-fg-2">.ready</span>. После ножевого раунда —{" "}
                    <span className="num text-fg-2">.stay</span> или <span className="num text-fg-2">.switch</span>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-fg-3">
                  {m.server_state === "loading"
                    ? "Сервер загружает матч и проверяет составы. Адрес появится здесь через несколько секунд."
                    : "Сервер готовится. Адрес появится здесь — страница обновится сама."}
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {[
            { team: m.team1, roster: rosters.team1 },
            { team: m.team2, roster: rosters.team2 },
          ].map(({ team, roster }, i) => (
            <Card key={i} className="p-6">
              <div className="label mb-2">{team?.name ?? "TBD"}</div>
              {roster.length ? (
                <RosterList
                  items={roster
                    .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
                    .map((r) => ({
                      key: r.player.id,
                      player: r.player,
                      role: r.player.id === team?.captain_id ? "captain" : r.role,
                    }))}
                />
              ) : (
                <p className="text-sm text-fg-3">Состав появится, когда команда определится.</p>
              )}
            </Card>
          ))}
          {!player && m.status === "veto" && (
            <ButtonLink href={`/login?next=/matches/${m.id}`} variant="secondary" className="w-full">
              Войти — для капитанов
            </ButtonLink>
          )}
        </div>
      </Container>
    </>
  );
}

function TeamSide({ team, align, winner, dim }: { team: Team | null; align: "left" | "right"; winner: boolean; dim: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 min-w-0", align === "right" && "flex-row-reverse text-right")}>
      {team ? <TeamLogo src={team.logo_url} tag={team.tag} size={72} /> : <div className="size-[72px] rounded-xl border border-dashed border-line-strong" />}
      <div className="min-w-0">
        {team ? (
          <Link href={`/teams/${team.tag}`} className={cn("block text-xl sm:text-3xl font-bold tracking-tight truncate hover:text-accent", dim && "text-fg-3")}>
            {team.name}
          </Link>
        ) : (
          <div className="text-xl sm:text-3xl font-bold text-fg-3">TBD</div>
        )}
        {winner && <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-accent">Победитель</div>}
      </div>
    </div>
  );
}
