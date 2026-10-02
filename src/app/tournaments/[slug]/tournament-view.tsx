import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { getTournamentRegistrations } from "@/lib/data";
import { getMapImages } from "@/lib/settings";
import { bracketLabel, formatDate, formatDateTime, mapName } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { getStandings, getTournamentMatches } from "@/lib/matches";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { getPlayerLeaderboard, getTeamStats, getTournamentMvp } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer, TeamStatsTable } from "@/components/stats-table";
import { fmt } from "@/components/stats-format";
import { StatLeaders } from "@/components/stat-leaders";
import { ShareButton, StreamEmbed } from "@/components/stream";
import { BracketView } from "@/components/bracket-view";
import { GroupStageView, SwissView } from "@/components/stage-view";
import { MatchRow, matchStage, visibleMatches } from "@/components/match-bits";

import { MapTile } from "@/components/competition/map-tile";
import { RecapView } from "@/components/competition/recap-view";
import { AdminControlLink, HeroCta, MobileCta, RegistrationBox, type TournamentLite } from "@/components/competition/tournament-viewer";
import { ClientTabs, TabPanel } from "@/components/public/client-tabs";
import { getTournamentRecap } from "@/lib/recap";
import { TournamentLifecycle, nextStepText } from "@/components/competition/tournament-lifecycle";
import Image from "next/image";
import {
  Button,
  EmptyCard,
  Eyebrow,
  StatusChip,
  TournamentStatusChip,
  WRAP,
  btnClass,
} from "@/components/primitives";
import { Callout } from "@/components/public/callout";
import { Avatar, FaceitLevel, IconArrow, KV, TeamLogo } from "@/components/ui";


/**
 * Страница турнира. Одинакова для всех зрителей — отдаётся из кэша CDN (ISR);
 * «моё участие» (кнопки, статус заявки) — клиентские острова из tournament-viewer.
 * Все вкладки уже в HTML, переключение мгновенное (ClientTabs).
 */
export async function TournamentView({ t }: { t: Tournament }) {
  const finished = t.status === "finished";
  // у завершённого турнира по умолчанию открываются итоги
  const defaultTab = finished ? "recap" : "overview";

  const [regs, matches, mapImages, recap] = await Promise.all([
    getTournamentRegistrations(t.id),
    getTournamentMatches(t.id),
    getMapImages(),
    finished ? getTournamentRecap(t) : Promise.resolve(null),
  ]);
  const approved = regs.filter((r) => r.status === "approved");
  const pending = regs.filter((r) => r.status === "pending");
  const solo = t.format === "1v1";
  const lite: TournamentLite = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    format: t.format,
    max_teams: t.max_teams,
    registration_closes_at: t.registration_closes_at,
  };

  const base = `/tournaments/${t.slug}`;

  return (
    <>
      <section className="relative overflow-hidden">
        {/* фото события: обложка турнира или кадр из утверждённого макета */}
        <div className="pointer-events-none absolute inset-0">
          <Image
            src={t.cover_url ?? "/home/tournament.jpg"}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[60%_30%] opacity-70"
            unoptimized={!!t.cover_url}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/30" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg to-transparent" />
        </div>
        <div className={`${WRAP} relative pt-10 pb-12 lg:pt-12 lg:pb-16`}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/tournaments" className="inline-flex min-h-11 items-center lg:min-h-0 text-fg-2 hover:text-fg">
              ← Турниры
            </Link>
            <AdminControlLink t={lite} />
          </div>
          {["registration", "checkin", "live"].includes(t.status) && <LiveRefresh watch={`tournament:${t.id}`} intervalMs={5000} />}
          {t.status === "draft" && (
            <div className="mt-6 max-w-2xl">
              <Callout tone="warn" title="Черновик">
                Страницу видят только администраторы. Откройте регистрацию, чтобы опубликовать турнир.
              </Callout>
            </div>
          )}
          <div className="mt-16 lg:mt-24 max-w-[900px]">
            <Eyebrow>{t.status === "draft" ? "Черновик турнира" : "Турнир F16 Arena"}</Eyebrow>
            <h1 className="mt-6 text-[44px] sm:text-[60px] lg:text-[76px] font-semibold leading-[1.02] tracking-[-0.015em]">{t.name}</h1>
            <div className="mt-8 flex flex-wrap items-center gap-y-3 text-[15px] lg:text-[18px] text-fg">
              {[
                t.starts_at ? formatDate(t.starts_at) : null,
                t.game,
                modeOf(t.format).size === 5 ? "5v5" : modeOf(t.format).size === 2 ? "2v2" : "1v1",
                bracketLabel[t.bracket_type] ?? t.bracket_type,
                t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"),
              ]
                .filter(Boolean)
                .map((x, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="mx-3 h-4 w-px bg-white/20 sm:mx-5" />}
                  {x}
                </span>
              ))}
            </div>
            <p className="mt-6 max-w-[640px] text-[16px] lg:text-[18px] text-fg-2">{nextStepText(t)}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <span className="hidden sm:contents">
                <HeroCta t={lite} />
              </span>
              <TournamentStatusChip status={t.status} />
            </div>
          </div>
          <div className="mt-12 lg:mt-16 max-w-[1000px]">
            <TournamentLifecycle t={t} />
          </div>
        </div>
        <div className={`${WRAP} relative`}>
          <ClientTabs
            scope="tournament"
            defaultKey={defaultTab}
            items={[
              ...(finished ? [{ key: "recap", label: "Итоги" }] : []),
              { key: "overview", label: "Обзор" },
              { key: "teams", label: solo ? "Участники" : "Команды" },
              { key: "bracket", label: "Сетка" },
              { key: "matches", label: "Матчи" },
              { key: "stats", label: "Статистика" },
              { key: "rules", label: "Правила" },
            ]}
          />
        </div>
      </section>

      <div className={`${WRAP} pt-14`} data-tabs-scope="tournament">
        {finished && recap && (
          <TabPanel tab="recap" defaultKey={defaultTab}>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <p className="text-fg-3 text-[15px]">Отдельная страница итогов — её удобно отправить в чат или соцсети.</p>
              <Button href={`${base}/recap`} variant="secondary" size="md" iconRight={<IconArrow />}>
                Страница итогов
              </Button>
            </div>
            <RecapView recap={recap} solo={solo} />
          </TabPanel>
        )}
        <TabPanel tab="overview" defaultKey={defaultTab}>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-x-16 gap-y-12 items-start">
            <div className="min-w-0">
              {["live", "finished"].includes(t.status) && <MvpBlock tournamentId={t.id} finished={t.status === "finished"} />}
              <Overview t={t} mapImages={mapImages} />
            </div>
              <aside className="lg:sticky lg:top-28 space-y-10 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-8">
                <RegistrationBox t={lite} approvedCount={approved.length} />
                <div>
                  <Eyebrow className="mb-3">Даты</Eyebrow>
                  <KV label="Регистрация">
                    {formatDate(t.registration_opens_at)} — {formatDate(t.registration_closes_at)}
                  </KV>
                  <KV label="Check-in">{t.checkin_opens_at ? formatDateTime(t.checkin_opens_at) : "—"}</KV>
                  <KV label="Старт">{formatDateTime(t.starts_at)}</KV>
                </div>
                {(() => {
                  // «0» и пустые строки — призов нет, блок не показываем
                  const real = (v: string | null | undefined) => !!v && !/^\s*0+\s*$/.test(v);
                  const places = t.prize_distribution.filter((p) => real(p.prize));
                  if (!real(t.prize_pool) && !places.length) return null;
                  return (
                    <div>
                      <Eyebrow className="mb-3">Призовой фонд</Eyebrow>
                      {real(t.prize_pool) && <div className="text-[26px] font-semibold tracking-[-0.02em]">{t.prize_pool}</div>}
                      {places.length > 0 && (
                        <div className="mt-3">
                          {places.map((p) => (
                            <KV key={p.place} label={p.place}>
                              {p.prize}
                            </KV>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(t.entry_fee || t.discord_url || t.contact) && (
                  <div>
                    {t.entry_fee && <KV label="Взнос">{t.entry_fee}</KV>}
                    {t.contact && <KV label="Организатор">{t.contact}</KV>}
                    {t.discord_url && (
                      <a href={t.discord_url} target="_blank" rel="noreferrer" className={btnClass("secondary", "md", "mt-4 w-full")}>
                        Discord турнира ↗
                      </a>
                    )}
                  </div>
                )}
                <ShareButton title={t.name} />
              </aside>
          </div>
        </TabPanel>
        <TabPanel tab="teams" defaultKey={defaultTab}>
          <TeamsTab approved={approved} pendingCount={pending.length} solo={solo} />
        </TabPanel>
        <TabPanel tab="bracket" defaultKey={defaultTab}>
          {matches.length ? (
            <StagesTab t={t} matches={matches} />
          ) : (
            <EmptyCard
              dashed
              title="Сетка появится после check-in"
              text={`${bracketLabel[t.bracket_type] ?? t.bracket_type} на ${t.max_teams} ${solo ? "участников" : "команд"}. Посев будет опубликован после check-in.`}
            />
          )}
        </TabPanel>
        <TabPanel tab="matches" defaultKey={defaultTab}>
          <MatchesTab matches={matches} />
        </TabPanel>
        <TabPanel tab="stats" defaultKey={defaultTab}>
          <StatsTab tournamentId={t.id} solo={solo} />
        </TabPanel>
        <TabPanel tab="rules" defaultKey={defaultTab}>
          <div className="max-w-[780px]">
            {t.rules ? (
              <div className="prose-f16">{t.rules}</div>
            ) : (
              <EmptyCard
                dashed
                title="Регламент будет опубликован до начала регистрации"
                text="Пока действуют общие правила платформы."
                action={
                  <Button href="/rules" variant="secondary" size="md" iconRight={<IconArrow />}>
                    Общие правила
                  </Button>
                }
              />
            )}
          </div>
        </TabPanel>
      </div>
      <MobileCta t={lite} />
    </>
  );
}

function Overview({ t, mapImages }: { t: Tournament; mapImages: Record<string, string> }) {
  const mode = modeOf(t.format);
  return (
    <div className="space-y-14">
      {t.stream_url && (
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <Eyebrow>Трансляция</Eyebrow>
            <a href={t.stream_url} target="_blank" rel="noreferrer" className="text-sm text-fg-3 hover:text-fg">
              Открыть отдельно ↗
            </a>
          </div>
          <StreamEmbed url={t.stream_url} />
        </section>
      )}

      {t.description && (
        <section>
          <Eyebrow className="mb-6">О турнире</Eyebrow>
          <div className="prose-f16 max-w-[720px]">{t.description}</div>
        </section>
      )}

      <section>
        <Eyebrow className="mb-6">Формат</Eyebrow>
        <div className="grid sm:grid-cols-2 gap-x-12">
          <div>
            <KV label="Игра">{t.game}</KV>
            <KV label="Режим">{mode.title}</KV>
            <KV label="Сетка">{bracketLabel[t.bracket_type] ?? t.bracket_type}</KV>
            <KV label="Матчи">{t.match_format ?? "—"}</KV>
          </div>
          <div>
            <KV label="Стороны">{t.knife_round ? "Ножевой раунд" : "Фиксированные"}</KV>
            <KV label="Овертайм">{t.overtime ? "MR3 при 12:12" : "Нет"}</KV>
            <KV label="Тактические паузы">
              {t.timeouts_per_team} × {t.timeout_seconds} с
            </KV>
            <KV label="Технические паузы">
              {t.tech_pauses} × {Math.round(t.tech_pause_seconds / 60)} мин
            </KV>
          </div>
        </div>
      </section>

      <section>
        <Eyebrow className="mb-6">Маппул</Eyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {t.map_pool.map((m) => (
            <MapTile key={m} map={m} image={mapImages[m]} />
          ))}
        </div>
        <span className="sr-only">{t.map_pool.map(mapName).join(", ")}</span>
      </section>

      <section>
        <Eyebrow className="mb-6">Требования</Eyebrow>
        {t.requirements ? (
          <div className="prose-f16 max-w-[720px]">{t.requirements}</div>
        ) : (
          <ul className="space-y-3 text-fg-2 max-w-[720px]">
            <li>Вход на платформу через Steam у каждого игрока</li>
            <li>
              {mode.title}: в основе {mainPlayersLabel(mode.size)}
              {mode.subs ? `, до ${mode.subs} запасн.` : ""}
            </li>
            <li>Один игрок — одна команда в рамках турнира</li>
            <li>Check-in капитаном в отведённое время</li>
          </ul>
        )}
      </section>

      {t.sponsors?.length > 0 && (
        <section>
          <Eyebrow className="mb-5">Партнёры</Eyebrow>
          <div className="flex flex-wrap gap-x-10 gap-y-3 text-lg font-semibold text-fg-2">
            {t.sponsors.map((sp) =>
              sp.url ? (
                <a key={sp.name} href={sp.url} target="_blank" rel="noreferrer" className="hover:text-fg">
                  {sp.name}
                </a>
              ) : (
                <span key={sp.name}>{sp.name}</span>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function TeamsTab({
  approved,
  pendingCount,
  solo,
}: {
  approved: Awaited<ReturnType<typeof getTournamentRegistrations>>;
  pendingCount: number;
  solo: boolean;
}) {
  if (approved.length === 0) {
    return (
      <EmptyCard
        dashed
        title={solo ? "Пока нет участников" : "Пока нет одобренных команд"}
        text={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "заявка ожидает" : "заявки ожидают"} подтверждения.`
            : "Станьте первыми, кто подаст заявку."
        }
      />
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[14px] lg:text-[15px] text-fg-3">
          {approved.length} {solo ? "участников" : "команд"}
          {pendingCount > 0 && ` · ещё на рассмотрении: ${pendingCount}`}
        </div>
      </div>
      <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 px-5 sm:px-7">
      {approved.map((r) => (
        <div key={r.id} className="py-6 border-b border-white/[0.06] last:border-0">
          <div className="flex items-center gap-4">
            {r.seed && <span className="num text-sm text-fg-3 w-6">{r.seed}</span>}
            <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={48} />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${r.team.tag}`} className="text-[18px] lg:text-[21px] font-semibold hover:text-accent-strong">
                {r.team.name}
              </Link>
              <div className="text-[13px] text-fg-3">
                {r.team.tag}
                {r.team.region ? ` · ${r.team.region}` : ""}
              </div>
            </div>
            {r.checked_in_at && (
              <StatusChip tone="ok" size="sm">
                Check-in
              </StatusChip>
            )}
          </div>
          {!solo && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 sm:pl-[64px]">
              {r.roster
                .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
                .map((rp) => (
                  <Link key={rp.id} href={`/players/${rp.player.steam_id}`} className="flex items-center gap-2 text-sm text-fg-2 hover:text-fg">
                    <Avatar src={rp.player.avatar_url} name={rp.player.nickname} size={22} />
                    <span className="max-w-[140px] truncate">{rp.player.nickname}</span>
                    <FaceitLevel level={rp.player.faceit_level} />
                    {rp.role === "sub" && <span className="text-[11px] text-fg-3">запасной</span>}
                  </Link>
                ))}
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyCard dashed title="Матчей пока нет" text="Расписание появится вместе с сеткой турнира." />;
  }
  // предстоящие — по дням расписания, без времени — отдельной группой
  const upcoming = list
    .filter((m) => ["upcoming", "pending"].includes(m.status))
    .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") || a.number - b.number);
  const byDay = new Map<string, typeof upcoming>();
  for (const m of upcoming) {
    const key = m.scheduled_at ? formatDate(m.scheduled_at) : "Время не назначено";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }
  const groups = [
    { title: "Сейчас", items: list.filter((m) => ["veto", "ready", "live"].includes(m.status)) },
    ...[...byDay].map(([day, items]) => ({ title: day, items })),
    { title: "Сыгранные", items: list.filter((m) => m.status === "finished").reverse() },
  ];
  return (
    <div className="space-y-14 max-w-[1100px]">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <Eyebrow className="mb-4">{g.title}</Eyebrow>
            <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 px-1 py-1">
              {g.items.map((m) => (
                <MatchRow key={m.id} m={m} stage={matchStage(m, matches)} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

async function StatsTab({ tournamentId, solo }: { tournamentId: string; solo: boolean }) {
  const [rows, teams] = await Promise.all([getPlayerLeaderboard(tournamentId), getTeamStats(tournamentId)]);
  return (
    <div className="space-y-10">
      {rows.length ? (
        <div className="space-y-6">
          <ClientTabs
            scope="tstats"
            param="stat"
            defaultKey="players"
            items={[
              { key: "players", label: "Игроки" },
              { key: "teams", label: solo ? "Участники" : "Команды" },
            ]}
          />
          <div data-tabs-scope="tstats">
            <TabPanel tab="players" defaultKey="players" className="space-y-6">
              <StatLeaders rows={rows} />
              <PlayerStatsTable rows={rows} solo={solo} showTeam={!solo} />
            </TabPanel>
            <TabPanel tab="teams" defaultKey="players">
              {teams.length ? (
                <TeamStatsTable rows={teams} solo={solo} />
              ) : (
                <EmptyCard dashed title="Появится после первого сыгранного матча" text="Победы, карты, раунды и сумма по игрокам." />
              )}
            </TabPanel>
          </div>
        </div>
      ) : (
        <EmptyCard dashed title="Статистика появится после первого матча" text="Убийства, ADR, KAST и F16 Rating считаются с наших серверов автоматически." />
      )}
      <RatingExplainer />
    </div>
  );
}

async function MvpBlock({ tournamentId, finished }: { tournamentId: string; finished: boolean }) {
  const mvp = await getTournamentMvp(tournamentId);
  if (!mvp) return null;
  const nick = mvp.player?.nickname ?? mvp.name;
  return (
    <section className="mb-14 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-8 lg:p-10">
      <Eyebrow>{finished ? "MVP турнира" : mvp.by === "swing" ? "Лидер по Swing" : "Лидер по рейтингу"}</Eyebrow>
      <div className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar src={mvp.player?.avatar_url} name={nick} size={56} />
          <div className="min-w-0">
            <div className="text-[30px] lg:text-[36px] font-semibold tracking-[-0.015em] truncate">
              {mvp.player ? (
                <Link href={`/players/${mvp.player.steam_id}`} className="hover:text-accent-strong">
                  {nick}
                </Link>
              ) : (
                nick
              )}
            </div>
            <div className="text-sm text-fg-3">{mvp.team?.name ?? ""}</div>
          </div>
        </div>
        <div className="flex gap-8">
          {[
            { l: "Swing", v: fmt.swing(mvp.swing), c: "text-ok" },
            { l: "Rating", v: fmt.r(mvp.rating) },
            { l: "ADR", v: fmt.d1(mvp.adr) },
            { l: "K/D", v: mvp.kd.toFixed(2) },
            { l: "Карты", v: String(mvp.maps) },
          ].map((x) => (
            <div key={x.l}>
              <div className={`num text-xl font-semibold ${x.c ?? ""}`}>{x.v}</div>
              <div className="mt-1 text-[12px] text-fg-3">{x.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function StagesTab({ t, matches }: { t: Tournament; matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const teams = new Map(
    matches.flatMap((m) => [m.team1, m.team2]).filter((x): x is NonNullable<typeof x> => !!x).map((x) => [x.id, x]),
  );
  const hasStage = matches.some((m) => m.stage === "group" || m.stage === "swiss");
  const playoff = matches.filter((m) => (m.stage ?? "playoff") === "playoff");
  const swiss = t.bracket_type === "swiss" || t.bracket_type === "swiss_playoff";
  const groups = hasStage ? await getStandings(t) : [];
  return (
    <div className="space-y-16">
      {hasStage &&
        (swiss ? (
          <SwissView table={groups[0]?.table ?? []} matches={groups[0]?.matches ?? []} teams={teams} wins={t.swiss_wins} solo={t.format === "1v1"} />
        ) : (
          <GroupStageView
            groups={groups}
            teams={teams}
            advance={t.bracket_type === "groups_playoff" ? t.advance_per_group : undefined}
            solo={t.format === "1v1"}
          />
        ))}
      {playoff.length > 0 ? (
        <div>
          {hasStage && <Eyebrow className="mb-8">Плей-офф</Eyebrow>}
          <BracketView matches={playoff} />
        </div>
      ) : (
        hasStage &&
        (t.bracket_type === "groups_playoff" || t.bracket_type === "swiss_playoff") && (
          <EmptyCard dashed title="Плей-офф" text="Сетка плей-офф появится автоматически после групповой стадии." />
        )
      )}
    </div>
  );
}
