import type { Metadata } from "next";
import { getMapImages } from "@/lib/settings";
import { notFound } from "next/navigation";
import { openDispute } from "@/app/actions/dispute";
import { db } from "@/lib/supabase";
import type { Dispute } from "@/lib/types";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { formatDateTime, mapName } from "@/lib/format";
import { applyVetoTimeouts, getMatch, getMatchRosters, getTournamentMatches } from "@/lib/matches";
import { aggregatePlayers, getStatRows } from "@/lib/stats";
import { vetoState } from "@/lib/veto";
import { PlayerStatsTable } from "@/components/stats-table";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { matchStage } from "@/components/match-bits";
import { RosterList } from "@/components/roster-list";
import { MatchHero } from "@/components/competition/match-hero";
import { ServerPreparing, ServerReady } from "@/components/competition/server-block";
import { VetoBoard } from "@/components/competition/veto-board";
import { ButtonLink, Container, EmptyState, Pill, cn } from "@/components/ui";

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

  const mapImages = await getMapImages();
  const [player, all, rosters, statRows] = await Promise.all([
    getCurrentPlayer(),
    getTournamentMatches(m.tournament_id),
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
  ]);
  const { data: disputeRows } = await db().from("disputes").select("*").eq("match_id", m.id).order("created_at");
  const disputes = (disputeRows ?? []) as Dispute[];
  const myTeam = player ? (m.team1?.captain_id === player.id ? m.team1 : m.team2?.captain_id === player.id ? m.team2 : null) : null;
  const isCaptain = !!myTeam;
  const inRoster = [...rosters.team1, ...rosters.team2].some((r) => r.player.id === player?.id);
  const admin = isAdmin(player);
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  const turnTeam = state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  const myTurn = m.status === "veto" && isCaptain && turnTeam?.id === myTeam?.id;
  const stage = matchStage(m, all);
  const serverPhase = ["ready", "live"].includes(m.status);
  const currentMap = m.maps.find((x) => x.status === "live") ?? m.maps.find((x) => x.status === "pending");

  const seriesMaps = m.maps.length > 0 && (
    <section>
      <h2 className="text-[22px] font-bold tracking-[-0.025em] mb-5">{m.status === "finished" ? "Итоги серии" : "Карты серии"}</h2>
      <div>
        {m.maps.map((map) => {
          const w1 = map.status === "finished" && map.team1_score > map.team2_score;
          const w2 = map.status === "finished" && map.team2_score > map.team1_score;
          return (
            <div key={map.id} className="grid grid-cols-[56px_1fr_auto] sm:grid-cols-[72px_1fr_auto_120px] items-center gap-4 h-14 border-b border-white/[0.05] last:border-0">
              <span className="text-[13px] text-fg-3">Карта {map.map_number}</span>
              <span className="font-semibold text-[16px]">{mapName(map.map_name)}</span>
              <span className="hidden sm:block text-[13px] text-fg-3">
                {map.picked_by ? `пик ${map.picked_by === m.team1_id ? m.team1?.tag : m.team2?.tag}` : "decider"}
              </span>
              {map.status === "pending" ? (
                <span className="text-[13px] text-fg-3 text-right">—</span>
              ) : (
                <span className="num text-right text-lg font-semibold">
                  {map.status === "live" && <span className="mr-2 inline-block size-1.5 rounded-full bg-danger animate-pulse align-middle" />}
                  <span className={cn(w2 && "text-fg-3")}>{map.team1_score}</span>
                  <span className="text-fg-3 mx-1">:</span>
                  <span className={cn(w1 && "text-fg-3")}>{map.team2_score}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const scoreboard = statRows.length > 0 && (
    <section className="space-y-10">
      <h2 className="text-[22px] font-bold tracking-[-0.025em]">Статистика</h2>
      {[...new Set(statRows.map((r) => r.map_number))]
        .sort((a, b) => a - b)
        .map((n) => {
          const map = m.maps.find((x) => x.map_number === n);
          const rows = statRows.filter((r) => r.map_number === n);
          const rosterPlayers = [...rosters.team1, ...rosters.team2].map((r) => r.player);
          return (
            <div key={n} className="space-y-6">
              <div className="text-sm text-fg-3">
                Карта {n}
                {map ? ` · ${mapName(map.map_name)} · ${map.team1_score}:${map.team2_score}` : ""}
              </div>
              {[m.team1, m.team2].map((team, i) => {
                const teamRows = aggregatePlayers(rows.filter((r) => r.team_id === team?.id))
                  .map((a) => ({ ...a, player: rosterPlayers.find((p) => p.steam_id === a.steam_id) ?? null }))
                  .sort((a, b) => b.rating - a.rating);
                if (!teamRows.length) return null;
                return (
                  <div key={i}>
                    <div className="mb-2 font-semibold">{team?.name}</div>
                    <PlayerStatsTable rows={teamRows} showTeam={false} compact rank={false} />
                  </div>
                );
              })}
            </div>
          );
        })}
    </section>
  );

  return (
    <>
      {["upcoming", "veto", "ready", "live"].includes(m.status) && <LiveRefresh intervalMs={m.status === "veto" ? 2000 : 5000} />}

      <MatchHero m={m} stage={stage} adminHref={admin ? `/admin/matches/${m.id}` : undefined} />

      <Container size="competition" className="pt-12 md:pt-16 space-y-16">
        {/* ── главный блок по состоянию матча */}
        {m.status === "pending" || m.status === "upcoming" ? (
          <section className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="label">Начало</div>
              <div className="mt-1.5 text-lg font-semibold">{m.scheduled_at ? formatDateTime(m.scheduled_at) : "Будет объявлено"}</div>
            </div>
            <div>
              <div className="label">Формат</div>
              <div className="mt-1.5 text-lg font-semibold">BO{m.best_of}</div>
            </div>
            <div>
              <div className="label">Вето</div>
              <div className="mt-1.5 text-lg font-semibold">
                {m.status === "pending" ? "Ожидаем соперников" : "Ещё не началось"}
              </div>
              <div className="mt-1 text-[13px] text-fg-3">
                {m.status === "pending" ? "Команды определятся по итогам предыдущих матчей." : "Капитанам придёт уведомление."}
              </div>
            </div>
          </section>
        ) : m.status === "veto" ? (
          <VetoBoard m={m} state={state} myTurn={myTurn} images={mapImages} />
        ) : serverPhase && (inRoster || admin) ? (
          m.server_address ? (
            <ServerReady
              address={m.server_address}
              password={m.server_password}
              readyAt={m.server_ready_at}
              waiting={m.status === "ready"}
              map={currentMap?.map_name}
            />
          ) : (
            <ServerPreparing loading={m.server_state === "loading"} />
          )
        ) : m.status === "ready" ? (
          <section className="flex items-center gap-3">
            <Pill tone="accent">Подготовка к матчу</Pill>
            <span className="text-sm text-fg-3">Игроки подключаются к серверу.</span>
          </section>
        ) : null}

        {m.status === "live" ? (
          <>
            {scoreboard}
            {seriesMaps}
          </>
        ) : (
          <>
            {seriesMaps}
            {scoreboard}
          </>
        )}

        {m.status !== "veto" && m.veto.length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold mb-3 text-fg-2">Вето</h2>
            <VetoBoard m={m} state={state} myTurn={false} compact images={mapImages} />
          </section>
        )}

        {/* ── составы */}
        <section className="grid md:grid-cols-2 gap-x-16 gap-y-10">
          {[
            { team: m.team1, roster: rosters.team1 },
            { team: m.team2, roster: rosters.team2 },
          ].map(({ team, roster }, i) => (
            <div key={i}>
              <h3 className="text-lg font-semibold tracking-[-0.015em] mb-3">{team?.name ?? "TBD"}</h3>
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
                <EmptyState compact title="Состав появится" description="Когда команда определится." />
              )}
            </div>
          ))}
        </section>

        {!player && m.status === "veto" && (
          <ButtonLink href={`/login?next=/matches/${m.id}`} variant="secondary">
            Войти — для капитанов
          </ButtonLink>
        )}

        {/* ── спор */}
        {(disputes.length > 0 || (isCaptain && ["ready", "live", "finished"].includes(m.status))) && (
          <section className="max-w-2xl">
            <h2 className="text-[15px] font-semibold text-fg-2 mb-4">Спор по матчу</h2>
            {disputes.length > 0 && (
              <div className="mb-6">
                {disputes.map((d) => (
                  <div key={d.id} className="py-4 border-b border-white/[0.05] last:border-0 text-sm">
                    <div className="flex justify-between gap-2 text-[13px] text-fg-3">
                      <span>
                        {d.team_id === m.team1_id ? m.team1?.name : d.team_id === m.team2_id ? m.team2?.name : "Администратор"} ·{" "}
                        {formatDateTime(d.created_at)}
                      </span>
                      <Pill tone={d.status === "open" ? "warn" : d.status === "resolved" ? "ok" : "neutral"}>
                        {d.status === "open" ? "рассматривается" : d.status === "resolved" ? "принят" : "отклонён"}
                      </Pill>
                    </div>
                    <p className="mt-2 text-fg whitespace-pre-line">{d.reason}</p>
                    {d.decision && <p className="mt-2 text-fg-2">Решение: {d.decision}</p>}
                  </div>
                ))}
              </div>
            )}
            {isCaptain && ["ready", "live", "finished"].includes(m.status) && (
              <ActionForm action={openDispute}>
                <input type="hidden" name="matchId" value={m.id} />
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Что произошло: раунд, время, игроки. Результат не изменится без решения администратора."
                  className="field resize-y text-sm"
                />
                <div className="mt-3">
                  <SubmitButton variant="secondary" confirm="Открыть спор? Матч будет помечен «На рассмотрении».">
                    Открыть спор
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
          </section>
        )}
      </Container>
    </>
  );
}
