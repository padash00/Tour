import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { notFound } from "next/navigation";
import { SocialDownloads } from "@/components/social-downloads";
import { getMapImages } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { getMatchDemos } from "@/lib/demos";
import { analysesOfMatch } from "@/lib/analysis";
import { openDispute } from "@/app/actions/dispute";
import { db } from "@/lib/supabase";
import type { Dispute } from "@/lib/types";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { formatDateTime, mapName } from "@/lib/format";
import { applyVetoTimeouts, getMatch, getMatchRosters } from "@/lib/matches";
import { getStageRounds } from "@/lib/match-stage";
import { aggregatePlayers, getStatRows } from "@/lib/stats";
import { vetoState } from "@/lib/veto";
import { modeOf } from "@/lib/modes";
import { getMatchRounds } from "@/lib/rounds-data";
import { RoundTimeline } from "@/components/competition/round-timeline";
import { PlayerStatsTable } from "@/components/stats-table";
import { ClientTabs } from "@/components/public/client-tabs";
import { MatchMvp } from "@/components/competition/match-mvp";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Countdown, LiveRefresh } from "@/components/live-refresh";
import { hallReady } from "@/app/actions/match";
import { matchHall } from "@/lib/hall";
import { blockById } from "@/lib/hall-core";
import { HallMap } from "@/components/hall-map";
import { matchStage } from "@/components/match-bits";
import { RosterList } from "@/components/roster-list";
import { MatchHero } from "@/components/competition/match-hero";
import { MatchExplain } from "@/components/competition/match-explain";
import { MatchServerPanel, VetoSummary } from "@/components/competition/match-side";
import { CopyConnect } from "@/components/copy-connect";
import { VetoBoard } from "@/components/competition/veto-board";
import { MatchProgress } from "@/components/competition/match-progress";
import { MobileStickyCta } from "@/components/public/callout";
import {
  Button,
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
  TeamLogo,
  cn,
} from "@/components/ds";

export async function generateMetadata(props: PageProps<"/matches/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getMatch(id);
  const t = await getT();
  const title = m ? `${m.team1?.name ?? "TBD"} vs ${m.team2?.name ?? "TBD"}` : t("Матч");
  const description = m
    ? `${title} — матч турнира «${m.tournament.name}» по CS2 на F16 Arena${m.status === "finished" ? `, счёт ${m.team1_score}:${m.team2_score}` : ""}: карты, раунды и статистика игроков.`
    : undefined;
  if (m?.status === "finished" && m.team1 && m.team2) {
    const image = { url: `/matches/${id}/image?f=wide`, width: 1200, height: 630 };
    return {
      title,
      description,
      alternates: { canonical: `/matches/${id}` },
      openGraph: { title: `${title} · ${m.team1_score}:${m.team2_score}`, images: [image] },
      twitter: { card: "summary_large_image", images: [image.url] },
    };
  }
  return { title, description, alternates: { canonical: `/matches/${id}` } };
}

export default async function MatchPage(props: PageProps<"/matches/[id]">) {
  const { id } = await props.params;
  const t = await getT();
  await applyVetoTimeouts(id);
  const m = await getMatch(id);
  if (!m || m.tournament.status === "draft") notFound();

  const serverNow = serverTime();
  const mapImages = await getMapImages();
  const [player, stageRounds, rosters, statRows, demoInfo, analyses] = await Promise.all([
    getCurrentPlayer(),
    // для подписи стадии нужны только раунды сетки, а не все матчи турнира
    ["group", "swiss", "grand_final", "third_place"].includes(m.bracket) ? Promise.resolve([]) : getStageRounds(m.tournament_id),
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
    // демо карт лежат на серверном ПК; у будущих матчей их нет. Скачивание идёт напрямую с ПК клуба (через VPS
    // не пересылается) — в онлайн-турнире игрокам дома ссылки не работали бы, поэтому их не показываем
    ["live", "finished"].includes(m.status) && m.tournament.is_lan !== false ? getMatchDemos(m.matchzy_id) : Promise.resolve({ demos: [], online: false }),
    // разбор карт (2D-повтор) — появляется сам после каждой карты
    m.status === "finished" || m.status === "live" ? analysesOfMatch(m.id) : Promise.resolve([]),
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

  const hall = m.status === "upcoming" && m.tournament.is_lan !== false ? await matchHall(m.id) : null;
  const myTeam = player ? (m.team1?.captain_id === player.id ? m.team1 : m.team2?.captain_id === player.id ? m.team2 : null) : null;
  const isCaptain = !!myTeam;
  const inRoster = [...rosters.team1, ...rosters.team2].some((r) => r.player.id === player?.id);
  const admin = isAdmin(player);
  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  const turnTeam = state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  const myTurn = m.status === "veto" && isCaptain && turnTeam?.id === myTeam?.id;
  const stage = matchStage(m, stageRounds, t);
  const bestOfText = m.best_of === 1 ? t("до 1 победы") : t("до {n} побед", { n: Math.ceil(m.best_of / 2) });
  const serverPhase = ["ready", "live"].includes(m.status);
  // адрес сервера и подсказки «подключитесь» — только игрокам состава и администраторам
  const participant = inRoster || admin;
  // куда проходит победитель: стадия следующего матча сетки
  const nextMatch = m.winner_to_match ? await getMatch(m.winner_to_match) : null;
  const nextStage = nextMatch ? matchStage(nextMatch, stageRounds, t) : null;
  const winsToMap = modeOf(m.tournament.format).size === 2 ? 9 : 13;

  const seriesMaps = m.maps.length > 0 && (
    <Section title={m.status === "finished" ? t("Итоги серии") : t("Карты серии")}>
      <RowList>
        {m.maps.map((map) => {
          const w1 = map.status === "finished" && map.team1_score > map.team2_score;
          const w2 = map.status === "finished" && map.team2_score > map.team1_score;
          const mapDemos = map.status === "finished" ? demoInfo.demos.filter((d) => d.mapNumber === map.map_number) : [];
          const mapAnalysis = analyses.find((x) => x.map_number === map.map_number);
          return (
            <div key={map.id} className="grid min-h-14 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[80px_minmax(0,1fr)_120px_auto] sm:px-5">
              <span className="text-meta text-fg-3">{t("Карта {n}", { n: map.map_number })}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-fg">{mapName(map.map_name)}</span>
                {(mapDemos.length > 0 || mapAnalysis) && (
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-meta">
                    {mapAnalysis && (
                      <a href={`/analysis/${mapAnalysis.id}`} className="font-semibold text-accent hover:underline">
                        {t("Разбор карты")}
                      </a>
                    )}
                    {mapDemos.map((d) =>
                      demoInfo.online ? (
                        <a key={d.file} href={`/matches/${m.id}/demo?f=${encodeURIComponent(d.file)}`} rel="nofollow" className="text-accent hover:underline">
                          {d.parts > 1 ? t("Демо ч. {n}", { n: d.part }) : t("Демо")} · {t("{n} МБ", { n: Math.max(1, Math.round(d.size / 1e6)) })}
                        </a>
                      ) : (
                        <span key={d.file} className="text-fg-4">{d.parts > 1 ? t("Демо ч. {n}", { n: d.part }) : t("Демо")} — {t("сервер выключен")}</span>
                      ),
                    )}
                  </span>
                )}
              </span>
              <span className="hidden truncate text-meta text-fg-3 sm:block">
                {map.picked_by ? t("пик {tag}", { tag: map.picked_by === m.team1_id ? m.team1?.tag : m.team2?.tag }) : "decider"}
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
      {demoInfo.online && demoInfo.demos.length > 0 && (
        <p className="mt-3 text-meta text-fg-3">
          {t("Демо скачивается прямо с сервера клуба. Если браузер предупредит о небезопасной загрузке — выберите «Сохранить».")}{" "}
          {t("Открыть в CS2: положите файл в папку game\\csgo и введите в консоли playdemo имя_файла.")}
        </p>
      )}
      {(m.status === "finished" || (m.status === "live" && m.maps.some((x) => x.status === "finished"))) && m.team1 && m.team2 && (
        <div className="mt-5">
          <SocialDownloads
            base={`/matches/${m.id}/image`}
            title={t("Картинка матча")}
            text={t("Счёт, карты и MVP — для поста, сторис или превью ссылки.")}
            maps={m.maps
              .filter((x) => x.status === "finished")
              .sort((a, b) => a.map_number - b.map_number)
              .map((x) => ({ n: x.map_number, label: mapName(x.map_name) }))}
          />
        </div>
      )}
    </Section>
  );

  const shownRoundMaps = roundMaps.filter((x) => x.rounds.length > 0);
  const roundsDefault = `r${liveMapNumber ?? shownRoundMaps.at(-1)?.mapNumber ?? 1}`;
  const roundTimeline = (maps: typeof roundMaps) => (
    <RoundTimeline
      maps={maps}
      mapNames={Object.fromEntries(m.maps.map((x) => [x.map_number, x.map_name]))}
      team1={m.team1?.name ?? t("Команда 1")}
      team2={m.team2?.name ?? t("Команда 2")}
      liveMap={m.status === "live" ? liveMapNumber : null}
    />
  );
  const mapTabLabel = (n: number) => {
    const map = m.maps.find((x) => x.map_number === n);
    return map ? `${t("Карта {n}", { n })} · ${mapName(map.map_name)}${map.status !== "pending" ? ` ${map.team1_score}:${map.team2_score}` : ""}` : t("Карта {n}", { n });
  };
  const roundsBlock = shownRoundMaps.length > 0 && (
    <Section title={t("Раунды")}>
      {shownRoundMaps.length > 1 ? (
        <div className="space-y-4">
          <ClientTabs scope="match-rounds" param="rounds" defaultKey={roundsDefault} items={shownRoundMaps.map((x) => ({ key: `r${x.mapNumber}`, label: mapTabLabel(x.mapNumber) }))} />
          <div data-tabs-scope="match-rounds">
            {shownRoundMaps.map((x) => (
              <div key={x.mapNumber} data-tab={`r${x.mapNumber}`} hidden={`r${x.mapNumber}` !== roundsDefault}>
                {roundTimeline([x])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        roundTimeline(shownRoundMaps)
      )}
    </Section>
  );

  const rosterPlayers = [...rosters.team1, ...rosters.team2].map((r) => r.player);
  const teamOfId = (id: string | null) => (id === m.team1_id ? m.team1 : id === m.team2_id ? m.team2 : null);
  // MVP матча — лучший рейтинг по всем сыгранным картам
  const matchPlayers = aggregatePlayers(statRows).sort((a, b) => b.rating - a.rating);
  const mvp = matchPlayers[0] ?? null;
  const statMaps = [...new Set(statRows.map((r) => r.map_number))].sort((a, b) => a - b);
  const teamTables = (rows: typeof statRows, mapNumber: number | null) => {
    const map = mapNumber != null ? m.maps.find((x) => x.map_number === mapNumber) : null;
    return (
      <div className="space-y-5">
        {[m.team1, m.team2].map((team, i) => {
          const teamRows = aggregatePlayers(rows.filter((r) => r.team_id === team?.id))
            .map((a) => ({ ...a, player: rosterPlayers.find((p) => p.steam_id === a.steam_id) ?? null }))
            .sort((a, b) => b.rating - a.rating);
          if (!team || !teamRows.length) return null;
          const score = map ? (i === 0 ? map.team1_score : map.team2_score) : i === 0 ? m.team1_score : m.team2_score;
          const won = map ? (i === 0 ? map.team1_score > map.team2_score : map.team2_score > map.team1_score) && map.status === "finished" : m.winner_id === team.id;
          return (
            <div key={i}>
              <div className="mb-2.5 flex items-center gap-3">
                <TeamLogo src={team.logo_url} tag={team.tag} size="sm" />
                <span className={cn("min-w-0 flex-1 truncate text-[17px] font-bold", won ? "text-accent" : "text-fg")}>{team.name}</span>
                <span className={cn("num text-[20px] font-extrabold", won ? "text-accent" : "text-fg-3")}>{score}</span>
              </div>
              <PlayerStatsTable
                rows={teamRows}
                showTeam={false}
                compact
                rank={false}
                highlightSteamId={player?.steam_id}
                mvpSteamId={teamRows[0]?.steam_id}
              />
            </div>
          );
        })}
      </div>
    );
  };
  const scoreboard = statRows.length > 0 && (
    <Section title={t("Статистика")} description={t("У–С — убийства и смерти, Урон/р — средний урон за раунд, рейтинг: больше — лучше, средний игрок ~1.00.")}>
      {statMaps.length > 1 ? (
        <div className="space-y-4">
          <ClientTabs
            scope="match-stats"
            param="stats"
            defaultKey="all"
            items={[{ key: "all", label: t("Все карты") }, ...statMaps.map((n) => ({ key: `m${n}`, label: mapTabLabel(n) }))]}
          />
          <div data-tabs-scope="match-stats">
            <div data-tab="all">{teamTables(statRows, null)}</div>
            {statMaps.map((n) => (
              <div key={n} data-tab={`m${n}`} hidden>
                {teamTables(
                  statRows.filter((r) => r.map_number === n),
                  n,
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        teamTables(statRows, statMaps[0] ?? null)
      )}
    </Section>
  );

  const mvpBlock = mvp && ["live", "finished"].includes(m.status) && (
    <MatchMvp
      p={mvp}
      player={rosterPlayers.find((x) => x.steam_id === mvp.steam_id) ?? null}
      team={teamOfId(mvp.team_id)}
      live={m.status === "live"}
    />
  );

  // главный блок под плашкой: до вето — когда и как, во время вето — доска вето; дальше всё говорят плашка и колонка «Сервер»
  const currentState =
    hall && m.team1 && m.team2 ? (
      <FeatureSurface>
        <h2 className="text-heading text-fg">{t("Рассадка: садитесь за ПК")}</h2>
        {hall.vetoStarted ? (
          <p className="mt-1 text-[15px] font-semibold text-warn">{t("Бан-пик сброшен администратором — он запустит его снова. Оставайтесь на своих местах.")}</p>
        ) : (
          <p className="mt-1 text-[15px] text-fg-2">
            {t("Команды садятся, входят в свой Steam, и капитаны нажимают «Готов». Бан-пик начнётся, когда готовы оба — или сам через")}{" "}
            <b className="num">
              <Countdown deadline={hall.deadline} long />
            </b>
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {([
            [m.team1, hall.seat1, hall.ready1],
            [m.team2, hall.seat2, hall.ready2],
          ] as const).map(([team, seat, ready]) => {
            const b = blockById(seat);
            return (
              <div key={team.id} className={cn("rounded-control border p-4", ready ? "border-ok/40 bg-ok/10" : "border-line bg-surface-4")}>
                <div className="flex items-center gap-2.5">
                  <TeamLogo src={team.logo_url} tag={team.tag} size="sm" />
                  <span className="min-w-0 truncate text-[16px] font-bold text-fg">{team.name}</span>
                </div>
                <div className="mt-3 text-[28px] font-extrabold leading-none text-fg num">{b ? t("ПК {from}–{to}", { from: b.from, to: b.to }) : "—"}</div>
                <div className="mt-1 text-[14px] text-fg-3">{b?.zone === "premium" ? t("Зона Standart Premium") : t("Зона Standart")}</div>
                <div className={cn("mt-3 text-[14.5px] font-semibold", ready ? "text-ok" : "text-fg-2")}>{ready ? t("✅ Готовы") : t("⏳ Садятся…")}</div>
                {myTeam?.id === team.id && !ready && !hall.vetoStarted && (
                  <ActionForm action={hallReady} className="mt-3">
                    <input type="hidden" name="matchId" value={m.id} />
                    <SubmitButton size="lg">{t("Команда села — Готов")}</SubmitButton>
                  </ActionForm>
                )}
              </div>
            );
          })}
        </div>
        <HallMap
          className="mt-5"
          marks={(() => {
            const side = rosters.team1.some((r) => r.player.id === player?.id) ? 1 : rosters.team2.some((r) => r.player.id === player?.id) ? 2 : 0;
            return {
              [hall.seat1]: { tone: side === 1 ? "mine" : side === 2 ? "rival" : "busy", label: m.team1.name },
              [hall.seat2]: { tone: side === 2 ? "mine" : side === 1 ? "rival" : "busy", label: m.team2.name },
            } as const;
          })()}
        />
      </FeatureSurface>
    ) : m.status === "pending" || m.status === "upcoming" ? (
      <FeatureSurface>
        <h2 className="text-heading text-fg">{t("Когда и как играется")}</h2>
        <Facts
          className="mt-5"
          items={[
            { label: t("Начало"), value: m.scheduled_at ? formatDateTime(m.scheduled_at, t.lang) : t("Будет объявлено") },
            { label: t("Формат"), value: bestOfText },
            { label: t("Стадия"), value: stage },
          ]}
        />
      </FeatureSurface>
    ) : m.status === "veto" ? (
      <>
        <VetoBoard m={m} state={state} myTurn={myTurn} images={mapImages} serverNow={serverNow} />
        {!player && (
          <div className="mt-4">
            <Button href={`/login?next=/matches/${m.id}`} variant="secondary">
              {t("Войти через Steam")}
            </Button>
          </div>
        )}
      </>
    ) : null;

  const rostersBlock = (
    <Section title={t("Составы")} description={t("Основной состав и запасные, заявленные на этот турнир.")}>
      <div className="grid gap-8 md:grid-cols-2">
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
              <EmptyState compact icon={<Gamepad2 />} title={t("Состав появится")} text={t("Когда команда определится по итогам предыдущих матчей.")} />
            )}
          </div>
        ))}
      </div>
    </Section>
  );

  const disputeBlock =
    disputes.length > 0 || (isCaptain && ["ready", "live", "finished"].includes(m.status)) ? (
      <Section title={t("Спор по матчу")} description={t("Используйте только для проблем, которые могут повлиять на официальный результат.")}>
        <div className="max-w-3xl space-y-6">
          {disputes.length > 0 && (
            <RowList>
              {disputes.map((d) => {
                const info =
                  d.status === "open"
                    ? { label: t("Рассматривается"), tone: "warn" as const }
                    : d.status === "resolved"
                      ? { label: t("Принят"), tone: "ok" as const }
                      : { label: t("Отклонён"), tone: "neutral" as const };
                return (
                  <div key={d.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-meta text-fg-3">
                        {d.team_id === m.team1_id ? m.team1?.name : d.team_id === m.team2_id ? m.team2?.name : t("Администратор")} · {formatDateTime(d.created_at, t.lang)}
                      </div>
                      <Status info={info} size="sm" />
                    </div>
                    <p className="mt-2 whitespace-pre-line text-[14px] text-fg">{d.reason}</p>
                    {d.decision && <p className="mt-2 text-[14px] text-fg-2">{t("Решение: {text}", { text: d.decision })}</p>}
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
                  <label htmlFor="dispute-reason" className="text-meta font-medium text-fg-2">{t("Что произошло")}</label>
                  <Textarea
                    id="dispute-reason"
                    name="reason"
                    rows={4}
                    required
                    minLength={10}
                    placeholder={t("Например: 14-й раунд, у игрока X пропал звук…")}
                    aria-describedby="dispute-reason-hint"
                  />
                  <p id="dispute-reason-hint" className="text-meta text-fg-3">
                    {t("Укажите раунд, время и игроков. Само обращение не меняет результат.")}
                  </p>
                </div>
                <div className="mt-4">
                  <SubmitButton variant="secondary" confirm={t("Открыть спор? Матч будет помечен «На рассмотрении».")}>
                    {t("Открыть спор")}
                  </SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          )}
        </div>
      </Section>
    ) : null;

  // во время игры сначала раунды и статистика, после — итоги серии
  // разведка соперника: игрокам состава — на соперника, админам — на обе команды (до конца матча)
  const mySide = rosters.team1.some((r) => r.player.id === player?.id) ? 1 : rosters.team2.some((r) => r.player.id === player?.id) ? 2 : 0;
  const scoutTeams = !["finished", "cancelled"].includes(m.status) && m.team1 && m.team2 ? (admin ? [m.team1, m.team2] : mySide === 1 ? [m.team2] : mySide === 2 ? [m.team1] : []) : [];
  const scoutBlock = scoutTeams.length > 0 && (
    <Section title={t("Разведка соперника")}>
      <p className="text-[14px] text-fg-3">{t("Как команда играет по разборам её карт в клубе: где стоят, куда закладывают, какие гранаты, кто идёт первым и кто с AWP.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {scoutTeams.map((tm) => (
          <a key={tm.id} href={`/teams/${encodeURIComponent(tm.tag)}/scout`} className="rounded-lg bg-accent-dim px-3 py-2 text-[14px] font-semibold text-accent hover:opacity-90">
            {tm.name} →
          </a>
        ))}
      </div>
    </Section>
  );
  const detailBlocks = m.status === "live" ? [mvpBlock, roundsBlock, scoreboard, seriesMaps] : [mvpBlock, seriesMaps, roundsBlock, scoreboard];
  const mainBlocks = [scoutBlock, ...detailBlocks, rostersBlock, disputeBlock].filter(Boolean);

  return (
    <>
      {["upcoming", "veto", "ready", "live"].includes(m.status) && (
        <LiveRefresh watch={`match:${m.id}`} intervalMs={m.status === "veto" ? 1000 : 2500} />
      )}

      <MatchHero m={m} stage={stage} adminHref={admin ? `/admin/matches/${m.id}` : undefined} mapImages={mapImages} />

      <Container width="wide" className="pb-6 pt-4 sm:pb-10">
        <div className="flex flex-col gap-4">
          <MatchExplain
            m={m}
            turnTeam={turnTeam?.name ?? null}
            myTurn={myTurn}
            participant={participant}
            next={nextStage}
            winsToMap={winsToMap}
            serverNow={serverNow}
          />
          <MatchProgress status={m.status} singleMap={m.tournament.map_pool.length <= 1} />
        </div>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            {currentState && <section aria-label={t("Текущее состояние матча")}>{currentState}</section>}
            {mainBlocks.map((node, i) => (
              <div key={i} className="min-w-0">
                {node}
              </div>
            ))}
          </div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--shell-h)+16px)]" aria-label={t("Сервер и карта")}>
            <MatchServerPanel m={m} participant={participant} serverNow={serverNow} />
            {m.status !== "veto" && <VetoSummary m={m} />}
            <section className="rounded-surface border border-line-subtle bg-surface p-5" aria-label={t("О матче")}>
              <h2 className="text-heading text-fg">{t("О матче")}</h2>
              <dl className="mt-3 grid gap-2.5 text-[15px]">
                <div className="flex justify-between gap-3"><dt className="text-fg-3">{t("Турнир")}</dt><dd className="text-right font-semibold">{m.tournament.name}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-fg-3">{t("Стадия")}</dt><dd className="text-right font-semibold">{stage}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-fg-3">{t("Формат")}</dt><dd className="text-right font-semibold">{bestOfText}</dd></div>
                {m.scheduled_at && <div className="flex justify-between gap-3"><dt className="text-fg-3">{t("Начало")}</dt><dd className="text-right font-semibold">{formatDateTime(m.scheduled_at, t.lang)}</dd></div>}
              </dl>
            </section>
          </aside>
        </div>
      </Container>

      {serverPhase && participant && m.server_address && m.status === "ready" && (
        <MobileStickyCta note={t("Сервер готов")}>
          <CopyConnect address={m.server_address} password={m.server_password} block />
        </MobileStickyCta>
      )}
    </>
  );
}

/** Время сервера для синхронизации countdown на момент SSR. */
function serverTime() {
  return Date.now();
}
