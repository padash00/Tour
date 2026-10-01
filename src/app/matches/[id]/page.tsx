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
import { ServerPreparing, ServerReady, connectHref } from "@/components/competition/server-block";
import { VetoBoard } from "@/components/competition/veto-board";
import { MatchProgress } from "@/components/competition/match-progress";
import { cn } from "@/components/ui";
import { Button, EmptyCard, Eyebrow, FormField, StatusChip, Textarea, WRAP, btnClass } from "@/components/primitives";
import { MobileStickyCta } from "@/components/public/callout";

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
      <Eyebrow className="mb-6">{m.status === "finished" ? "Итоги серии" : "Карты серии"}</Eyebrow>
      <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 px-6 lg:px-8">
        {m.maps.map((map) => {
          const w1 = map.status === "finished" && map.team1_score > map.team2_score;
          const w2 = map.status === "finished" && map.team2_score > map.team1_score;
          return (
            <div key={map.id} className="grid grid-cols-[56px_1fr_auto] sm:grid-cols-[90px_1fr_auto_140px] items-center gap-4 h-16 lg:h-[72px] border-b border-white/[0.06] last:border-0">
              <span className="text-[13px] text-fg-3">Карта {map.map_number}</span>
              <span className="font-semibold text-[16px] lg:text-[20px]">{mapName(map.map_name)}</span>
              <span className="hidden sm:block text-[13px] text-fg-3">
                {map.picked_by ? `пик ${map.picked_by === m.team1_id ? m.team1?.tag : m.team2?.tag}` : "decider"}
              </span>
              {map.status === "pending" ? (
                <span className="text-[13px] text-fg-3 text-right">—</span>
              ) : (
                <span className="num text-right text-lg lg:text-[24px] font-semibold">
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
      <Eyebrow>Статистика</Eyebrow>
      {[...new Set(statRows.map((r) => r.map_number))]
        .sort((a, b) => a - b)
        .map((n) => {
          const map = m.maps.find((x) => x.map_number === n);
          const rows = statRows.filter((r) => r.map_number === n);
          const rosterPlayers = [...rosters.team1, ...rosters.team2].map((r) => r.player);
          return (
            <div key={n} className="space-y-6">
              <div className="text-[15px] text-fg-2">
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
                    <div className="mb-3 text-[18px] lg:text-[20px] font-semibold">{team?.name}</div>
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
      {["upcoming", "veto", "ready", "live"].includes(m.status) && <LiveRefresh watch={`match:${m.id}`} intervalMs={m.status === "veto" ? 1500 : 2500} />}

      <MatchHero m={m} stage={stage} adminHref={admin ? `/admin/matches/${m.id}` : undefined} />

      <div className={cn(WRAP, "pt-10 md:pt-14 space-y-16 lg:space-y-20")}>
        <MatchProgress status={m.status} singleMap={m.tournament.map_pool.length <= 1} />
        {/* ── главный блок по состоянию матча */}
        {m.status === "pending" || m.status === "upcoming" ? (
          <section className="grid sm:grid-cols-3 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
            <div className="p-7 lg:p-9">
              <Eyebrow>Начало</Eyebrow>
              <div className="mt-3 text-[20px] lg:text-[24px] font-semibold">{m.scheduled_at ? formatDateTime(m.scheduled_at) : "Будет объявлено"}</div>
            </div>
            <div className="p-7 lg:p-9">
              <Eyebrow>Формат</Eyebrow>
              <div className="mt-3 text-[20px] lg:text-[24px] font-semibold">BO{m.best_of}</div>
            </div>
            <div className="p-7 lg:p-9">
              <Eyebrow>Вето</Eyebrow>
              <div className="mt-3 text-[20px] lg:text-[24px] font-semibold">
                {m.status === "pending" ? "Ожидаем соперников" : "Ещё не началось"}
              </div>
              <div className="mt-2 text-[14px] text-fg-3">
                {m.status === "pending" ? "Команды определятся по итогам предыдущих матчей." : "Капитанам придёт уведомление."}
              </div>
            </div>
          </section>
        ) : m.status === "veto" ? (
          <section className={cn("relative -mx-2 rounded-[18px] p-2 sm:-mx-4 sm:p-4", myTurn && "bg-accent/[0.04] ring-1 ring-accent/25")}>
            <VetoBoard m={m} state={state} myTurn={myTurn} images={mapImages} />
          </section>
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
          <section className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-7 lg:p-10">
            <Eyebrow className="text-accent">Подготовка к матчу</Eyebrow>
            <div className="mt-3 text-[20px] lg:text-[26px] font-semibold">Игроки подключаются к серверу</div>
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
            <Eyebrow className="mb-4">Вето</Eyebrow>
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
              <Eyebrow className="mb-2">Состав</Eyebrow>
              <h3 className="text-[22px] lg:text-[28px] font-semibold tracking-[-0.015em] mb-4">{team?.name ?? "TBD"}</h3>
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
                <EmptyCard dashed title="Состав появится" text="Когда команда определится по итогам предыдущих матчей." />
              )}
            </div>
          ))}
        </section>

        {!player && m.status === "veto" && (
          <Button href={`/login?next=/matches/${m.id}`} variant="secondary" size="md">
            Войти — для капитанов
          </Button>
        )}

        {/* ── спор */}
        {(disputes.length > 0 || (isCaptain && ["ready", "live", "finished"].includes(m.status))) && (
          <section className="max-w-2xl">
            <Eyebrow className="mb-4">Спор по матчу</Eyebrow>
            {disputes.length > 0 && (
              <div className="mb-6 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 px-6">
                {disputes.map((d) => (
                  <div key={d.id} className="py-5 border-b border-white/[0.05] last:border-0 text-sm">
                    <div className="flex justify-between gap-2 text-[13px] text-fg-3">
                      <span>
                        {d.team_id === m.team1_id ? m.team1?.name : d.team_id === m.team2_id ? m.team2?.name : "Администратор"} ·{" "}
                        {formatDateTime(d.created_at)}
                      </span>
                      <StatusChip tone={d.status === "open" ? "warn" : d.status === "resolved" ? "ok" : "muted"} size="sm">
                        {d.status === "open" ? "рассматривается" : d.status === "resolved" ? "принят" : "отклонён"}
                      </StatusChip>
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
                <FormField label="Что произошло" hint="Раунд, время, игроки. Результат не изменится без решения администратора.">
                  <Textarea name="reason" rows={4} required minLength={10} placeholder="Например: 14-й раунд, у игрока X пропал звук…" />
                </FormField>
                <div className="mt-4">
                  <SubmitButton variant="secondary" confirm="Открыть спор? Матч будет помечен «На рассмотрении».">
                    Открыть спор
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
          </section>
        )}
      </div>
      {serverPhase && (inRoster || admin) && m.server_address && m.status === "ready" && (
        <MobileStickyCta note="Сервер готов">
          <a href={connectHref(m.server_address, m.server_password)} className={btnClass("primary", "lg", "w-full")}>
            Подключиться
          </a>
        </MobileStickyCta>
      )}
    </>
  );
}
