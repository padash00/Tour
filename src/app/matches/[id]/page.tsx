import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Gamepad2 } from "lucide-react";
import { notFound } from "next/navigation";
import { SocialDownloads } from "@/components/social-downloads";
import { getMapImages } from "@/lib/settings";
import { openDispute } from "@/app/actions/dispute";
import { db } from "@/lib/supabase";
import type { Dispute } from "@/lib/types";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { formatDateTime, mapName } from "@/lib/format";
import { applyVetoTimeouts, getMatch, getMatchRosters, getTournamentMatches } from "@/lib/matches";
import { aggregatePlayers, getStatRows } from "@/lib/stats";
import { vetoState } from "@/lib/veto";
import { modeOf } from "@/lib/modes";
import { getMatchRounds } from "@/lib/rounds-data";
import { RoundTimeline } from "@/components/competition/round-timeline";
import { PlayerStatsTable } from "@/components/stats-table";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { matchStage } from "@/components/match-bits";
import { RosterList } from "@/components/roster-list";
import { MatchHero } from "@/components/competition/match-hero";
import { ServerPreparing, ServerReady, connectHref } from "@/components/competition/server-block";
import { VetoBoard } from "@/components/competition/veto-board";
import { MatchProgress } from "@/components/competition/match-progress";
import { MobileStickyCta } from "@/components/public/callout";
import {
  Button,
  Callout,
  Container,
  EmptyState,
  Facts,
  FeatureSurface,
  Panel,
  RowList,
  Section,
  Status,
  SubsectionTitle,
  Textarea,
  buttonClass,
  cn,
} from "@/components/ds";

export async function generateMetadata(props: PageProps<"/matches/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getMatch(id);
  const title = m ? `${m.team1?.name ?? "TBD"} vs ${m.team2?.name ?? "TBD"}` : "Матч";
  if (m?.status === "finished" && m.team1 && m.team2) {
    const image = { url: `/matches/${id}/image?f=wide`, width: 1200, height: 630 };
    return {
      title,
      openGraph: { title: `${title} · ${m.team1_score}:${m.team2_score}`, images: [image] },
      twitter: { card: "summary_large_image", images: [image.url] },
    };
  }
  return { title };
}

export default async function MatchPage(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  await applyVetoTimeouts(id);
  const m = await getMatch(id);
  if (!m || m.tournament.status === "draft") notFound();

  const serverNow = serverTime();
  const mapImages = await getMapImages();
  const [player, all, rosters, statRows] = await Promise.all([
    getCurrentPlayer(),
    getTournamentMatches(m.tournament_id),
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
  ]);

  const roundMaps = ["live", "finished"].includes(m.status)
    ? await getMatchRounds(
        m.id,
        { team1: rosters.team1.map((r) => r.player.steam_id), team2: rosters.team2.map((r) => r.player.steam_id) },
        modeOf(m.tournament.format).size,
      )
    : [];
  const liveMapNumber = m.maps.find((x) => x.status === "live")?.map_number ?? null;
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
    <Section title={m.status === "finished" ? "Итоги серии" : "Карты серии"}>
      <RowList>
        {m.maps.map((map) => {
          const w1 = map.status === "finished" && map.team1_score > map.team2_score;
          const w2 = map.status === "finished" && map.team2_score > map.team1_score;
          return (
            <div key={map.id} className="grid min-h-14 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[80px_minmax(0,1fr)_120px_auto] sm:px-5">
              <span className="text-meta text-fg-3">Карта {map.map_number}</span>
              <span className="truncate text-[15px] font-medium text-fg">{mapName(map.map_name)}</span>
              <span className="hidden truncate text-meta text-fg-3 sm:block">
                {map.picked_by ? `пик ${map.picked_by === m.team1_id ? m.team1?.tag : m.team2?.tag}` : "decider"}
              </span>
              {map.status === "pending" ? (
                <span className="text-right text-meta text-fg-3">—</span>
              ) : (
                <span className="num text-right text-[17px] font-semibold">
                  {map.status === "live" && <span className="mr-2 inline-block size-1.5 rounded-full bg-live align-middle animate-pulse" />}
                  <span className={cn(w2 && "text-fg-3")}>{map.team1_score}</span>
                  <span className="mx-1 text-fg-4">:</span>
                  <span className={cn(w1 && "text-fg-3")}>{map.team2_score}</span>
                </span>
              )}
            </div>
          );
        })}
      </RowList>
      {m.status === "finished" && m.team1 && m.team2 && (
        <div className="mt-5">
          <SocialDownloads base={`/matches/${m.id}/image`} title="Картинка матча" text="Счёт, карты и MVP — для поста, сторис или превью ссылки." />
        </div>
      )}
    </Section>
  );

  const roundsBlock = roundMaps.some((x) => x.rounds.length > 0) && (
    <Section title="Раунды">
      <RoundTimeline
        maps={roundMaps}
        mapNames={Object.fromEntries(m.maps.map((x) => [x.map_number, x.map_name]))}
        team1={m.team1?.name ?? "Команда 1"}
        team2={m.team2?.name ?? "Команда 2"}
        liveMap={m.status === "live" ? liveMapNumber : null}
      />
    </Section>
  );

  const scoreboard = statRows.length > 0 && (
    <Section title="Статистика">
      <div className="space-y-10">
        {[...new Set(statRows.map((r) => r.map_number))]
          .sort((a, b) => a - b)
          .map((n) => {
            const map = m.maps.find((x) => x.map_number === n);
            const rows = statRows.filter((r) => r.map_number === n);
            const rosterPlayers = [...rosters.team1, ...rosters.team2].map((r) => r.player);
            return (
              <div key={n} className="space-y-5">
                <SubsectionTitle>
                  Карта {n}
                  {map ? ` · ${mapName(map.map_name)} · ${map.team1_score}:${map.team2_score}` : ""}
                </SubsectionTitle>
                {[m.team1, m.team2].map((team, i) => {
                  const teamRows = aggregatePlayers(rows.filter((r) => r.team_id === team?.id))
                    .map((a) => ({ ...a, player: rosterPlayers.find((p) => p.steam_id === a.steam_id) ?? null }))
                    .sort((a, b) => b.rating - a.rating);
                  if (!teamRows.length) return null;
                  return (
                    <div key={i}>
                      <div className="mb-3 text-title text-fg">{team?.name}</div>
                      <PlayerStatsTable rows={teamRows} showTeam={false} compact rank={false} />
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </Section>
  );

  const currentState =
    m.status === "pending" || m.status === "upcoming" ? (
      <FeatureSurface>
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">Следующий шаг</div>
        <h2 className="mt-2 text-heading text-fg">{m.status === "pending" ? "Ожидаем соперников" : "Матч назначен"}</h2>
        <p className="mt-2 max-w-read text-[14px] text-fg-2">
          {m.status === "pending"
            ? "Команды определятся по итогам предыдущих матчей. Match Room обновится автоматически."
            : m.tournament.map_pool.length <= 1
              ? "Вето не требуется. Когда сервер будет готов, здесь появится подключение."
              : "Капитанам придёт уведомление о начале вето карт."}
        </p>
        <Facts
          className="mt-6"
          items={[
            { label: "Начало", value: m.scheduled_at ? formatDateTime(m.scheduled_at) : "Будет объявлено" },
            { label: "Формат", value: `BO${m.best_of}` },
            { label: "Стадия", value: stage },
          ]}
        />
      </FeatureSurface>
    ) : m.status === "veto" ? (
      <>
        <VetoBoard m={m} state={state} myTurn={myTurn} images={mapImages} serverNow={serverNow} />
        {!player && (
          <div className="mt-4">
            <Button href={`/login?next=/matches/${m.id}`} variant="secondary">
              Войти через Steam
            </Button>
          </div>
        )}
      </>
    ) : serverPhase && (inRoster || admin) ? (
      m.server_address ? (
        <ServerReady
          address={m.server_address}
          password={m.server_password}
          readyAt={m.server_ready_at}
          waiting={m.status === "ready"}
          map={currentMap?.map_name}
          serverNow={serverNow}
        />
      ) : (
        <ServerPreparing loading={m.server_state === "loading"} />
      )
    ) : m.status === "ready" ? (
      <FeatureSurface>
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">Сервер готовится</div>
        <h2 className="mt-2 text-heading text-fg">Игроки подключаются</h2>
        <p className="mt-2 text-[14px] text-fg-2">Адрес сервера видят только участники состава матча и администраторы.</p>
      </FeatureSurface>
    ) : m.status === "live" ? (
      <FeatureSurface>
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-live">LIVE</div>
        <h2 className="mt-2 text-heading text-fg">Матч идёт</h2>
        <p className="mt-2 text-[14px] text-fg-2">
          {currentMap ? `Сейчас: ${mapName(currentMap.map_name)} · ${currentMap.team1_score}:${currentMap.team2_score}.` : "Счёт и статистика обновляются автоматически."}
        </p>
      </FeatureSurface>
    ) : m.status === "finished" ? (
      <FeatureSurface>
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-ok">Итог</div>
        <h2 className="mt-2 text-heading text-fg">
          {m.winner_id === m.team1_id ? m.team1?.name : m.winner_id === m.team2_id ? m.team2?.name : "Матч завершён"}
          {m.winner_id ? " — победитель" : ""}
        </h2>
        <p className="mt-2 text-[14px] text-fg-2">
          Серия завершена со счётом <span className="num font-medium text-fg">{m.team1_score}:{m.team2_score}</span>.
          {m.under_review ? " Результат находится на проверке администратора." : " Результат учтён в сетке турнира."}
        </p>
      </FeatureSurface>
    ) : (
      <Callout tone="danger" title="Матч отменён">Этот матч больше не будет сыгран.</Callout>
    );

  const vetoHistory =
    m.status !== "veto" && m.veto.length > 0 ? (
      <Section title="Вето карт">
        <VetoBoard m={m} state={state} myTurn={false} compact images={mapImages} serverNow={serverNow} />
      </Section>
    ) : null;

  const rostersBlock = (
    <Section title="Составы" description="Основной состав и запасные, заявленные на этот турнир.">
      <div className="grid gap-10 md:grid-cols-2 md:gap-12">
        {[
          { team: m.team1, roster: rosters.team1 },
          { team: m.team2, roster: rosters.team2 },
        ].map(({ team, roster }, i) => (
          <div key={i}>
            <SubsectionTitle>{team?.name ?? "TBD"}</SubsectionTitle>
            {roster.length ? (
              <RosterList
                items={[...roster]
                  .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
                  .map((r) => ({
                    key: r.player.id,
                    player: r.player,
                    role: r.player.id === team?.captain_id ? "captain" : r.role,
                  }))}
              />
            ) : (
              <EmptyState compact icon={<Gamepad2 />} title="Состав появится" text="Когда команда определится по итогам предыдущих матчей." />
            )}
          </div>
        ))}
      </div>
    </Section>
  );

  const disputeBlock =
    disputes.length > 0 || (isCaptain && ["ready", "live", "finished"].includes(m.status)) ? (
      <Section title="Спор по матчу" description="Используйте только для проблем, которые могут повлиять на официальный результат.">
        <div className="max-w-3xl space-y-6">
          {disputes.length > 0 && (
            <RowList>
              {disputes.map((d) => {
                const info =
                  d.status === "open"
                    ? { label: "Рассматривается", tone: "warn" as const }
                    : d.status === "resolved"
                      ? { label: "Принят", tone: "ok" as const }
                      : { label: "Отклонён", tone: "neutral" as const };
                return (
                  <div key={d.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-meta text-fg-3">
                        {d.team_id === m.team1_id ? m.team1?.name : d.team_id === m.team2_id ? m.team2?.name : "Администратор"} · {formatDateTime(d.created_at)}
                      </div>
                      <Status info={info} size="sm" />
                    </div>
                    <p className="mt-2 whitespace-pre-line text-[14px] text-fg">{d.reason}</p>
                    {d.decision && <p className="mt-2 text-[14px] text-fg-2">Решение: {d.decision}</p>}
                  </div>
                );
              })}
            </RowList>
          )}

          {isCaptain && ["ready", "live", "finished"].includes(m.status) && (
            <Panel>
              <ActionForm action={openDispute}>
                <input type="hidden" name="matchId" value={m.id} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dispute-reason" className="text-meta font-medium text-fg-2">Что произошло</label>
                  <Textarea
                    id="dispute-reason"
                    name="reason"
                    rows={4}
                    required
                    minLength={10}
                    placeholder="Например: 14-й раунд, у игрока X пропал звук…"
                    aria-describedby="dispute-reason-hint"
                  />
                  <p id="dispute-reason-hint" className="text-meta text-fg-3">
                    Укажите раунд, время и игроков. Само обращение не меняет результат.
                  </p>
                </div>
                <div className="mt-4">
                  <SubmitButton variant="secondary" confirm="Открыть спор? Матч будет помечен «На рассмотрении».">
                    Открыть спор
                  </SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          )}
        </div>
      </Section>
    ) : null;

  const detailBlocks =
    m.status === "live"
      ? [
          { key: "rounds", node: roundsBlock },
          { key: "stats", node: scoreboard },
          { key: "series", node: seriesMaps },
        ]
      : [
          { key: "series", node: seriesMaps },
          { key: "rounds", node: roundsBlock },
          { key: "stats", node: scoreboard },
        ];

  const matchBands = [
    ...detailBlocks,
    { key: "veto", node: vetoHistory },
    { key: "rosters", node: rostersBlock },
    { key: "dispute", node: disputeBlock },
  ].filter((band) => Boolean(band.node));

  return (
    <>
      {["upcoming", "veto", "ready", "live"].includes(m.status) && (
        <LiveRefresh watch={`match:${m.id}`} intervalMs={m.status === "veto" ? 1000 : 2500} />
      )}

      <MatchHero m={m} stage={stage} adminHref={admin ? `/admin/matches/${m.id}` : undefined} />

      <Container width="wide" className="py-6 sm:py-8">
        <div className="mx-auto max-w-[1100px]">
          <MatchProgress status={m.status} singleMap={m.tournament.map_pool.length <= 1} />
          <section aria-label="Текущее состояние матча" className="mt-8">
            {currentState}
          </section>
        </div>
      </Container>

      {matchBands.map((band, index) => (
        <MatchBand key={band.key} tone={index % 2 === 0 ? "section" : "base"}>
          {band.node}
        </MatchBand>
      ))}

      {serverPhase && (inRoster || admin) && m.server_address && m.status === "ready" && (
        <MobileStickyCta note="Сервер готов">
          <a href={connectHref(m.server_address, m.server_password)} className={buttonClass("primary", "lg", "w-full")}>
            Подключиться
          </a>
        </MobileStickyCta>
      )}
    </>
  );
}

function MatchBand({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "base" | "section";
}) {
  return (
    <div
      className={cn(
        "border-t border-line-subtle",
        tone === "section" ? "bg-section" : "bg-bg",
      )}
    >
      <Container width="wide" className="py-10 sm:py-12 lg:py-14">
        {children}
      </Container>
    </div>
  );
}

/** Время сервера для синхронизации countdown на момент SSR. */
function serverTime() {
  return Date.now();
}
