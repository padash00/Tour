import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ExternalLink, Gamepad2, Swords, Users } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
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
import { matchStage, visibleMatches } from "@/components/match-bits";
import { MatchListRow } from "@/components/match-row";
import { MapTile } from "@/components/competition/map-tile";
import { RecapView } from "@/components/competition/recap-view";
import { AdminControlLink, HeroCta, MobileCta, MyRequirements, ParticipationPanel, type TournamentLite } from "@/components/competition/tournament-viewer";
import { ClientTabs, TabPanel } from "@/components/public/client-tabs";
import { getTournamentRecap } from "@/lib/recap";
import { getLastDraw } from "@/lib/draw-log";
import { drawOrderText } from "@/lib/draw";
import { TournamentLifecycle, nextStepText } from "@/components/competition/tournament-lifecycle";
import {
  Avatar,
  Button,
  Callout,
  Container,
  EmptyState,
  FaceitLevel,
  Facts,
  RowList,
  Section,
  SectionTitle,
  Stack,
  Status,
  SubsectionTitle,
  TeamLogo,
  tournamentStatus,
} from "@/components/ds";
import { Check } from "lucide-react";

const real = (v: string | null | undefined) => !!v && !/^\s*0+\s*$/.test(v);
const modeShort = (format: string) => {
  const s = modeOf(format).size;
  return s === 5 ? "5v5" : s === 2 ? "2v2" : "1v1";
};

/**
 * Страница турнира. Одинакова для всех зрителей — отдаётся из кэша CDN (ISR);
 * «моё участие» (панель, кнопки, требования) — клиентские острова из tournament-viewer.
 * Структура: шапка турнира → липкие вкладки (ClientTabs, мгновенные) → содержимое.
 */
export async function TournamentView({ t }: { t: Tournament }) {
  const finished = t.status === "finished";
  // у завершённого турнира по умолчанию открываются итоги
  const defaultTab = finished ? "recap" : "overview";

  const [regs, matches, mapImages, recap, draw] = await Promise.all([
    getTournamentRegistrations(t.id),
    getTournamentMatches(t.id),
    getMapImages(),
    finished ? getTournamentRecap(t) : Promise.resolve(null),
    t.bracket_published_at ? getLastDraw(t.id) : Promise.resolve(null),
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
    checkin_opens_at: t.checkin_opens_at,
    checkin_closes_at: t.checkin_closes_at,
  };
  const base = `/tournaments/${t.slug}`;
  const places = t.prize_distribution.filter((p) => real(p.prize));
  const hasPrize = real(t.prize_pool) || places.length > 0;

  return (
    <>
      {["registration", "checkin", "live"].includes(t.status) && <LiveRefresh watch={`tournament:${t.id}`} intervalMs={5000} />}

      {/* ── шапка турнира: обложка — фон, а не главный объект */}
      <section className="relative overflow-hidden border-b border-line-subtle">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <Image src={t.cover_url ?? "/home/tournament.jpg"} alt="" fill priority sizes="100vw" className="object-cover object-[60%_30%] opacity-35" unoptimized={!!t.cover_url} />
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/90 to-bg/55" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg to-transparent" />
        </div>
        <Container className="relative pb-8 pt-5 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/tournaments" className="inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
              <ArrowLeft className="size-4" /> Турниры
            </Link>
            <AdminControlLink t={lite} />
          </div>
          {t.status === "draft" && (
            <Callout tone="warn" title="Черновик" className="mt-4 max-w-2xl">
              Страницу видят только администраторы. Откройте регистрацию, чтобы опубликовать турнир.
            </Callout>
          )}
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Status info={tournamentStatus[t.status]} />
              <h1 className="mt-3 break-words text-[30px] font-semibold leading-tight tracking-[-0.018em] text-fg sm:text-[38px]">{t.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-2">
                {[t.game, modeShort(t.format), bracketLabel[t.bracket_type] ?? t.bracket_type, t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн")]
                  .filter(Boolean)
                  .map((x, i) => (
                    <span key={i} className="flex items-center gap-3">
                      {i > 0 && <span className="text-fg-4" aria-hidden>·</span>}
                      {x}
                    </span>
                  ))}
              </div>
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-micro text-fg-3">Старт</dt>
                  <dd className="text-[15px] font-medium text-fg">{t.starts_at ? formatDateTime(t.starts_at) : "Дата уточняется"}</dd>
                </div>
                <div>
                  <dt className="text-micro text-fg-3">{solo ? "Участники" : "Команды"}</dt>
                  <dd className="num text-[15px] font-medium text-fg">
                    {approved.length} / {t.max_teams}
                  </dd>
                </div>
                {real(t.prize_pool) && (
                  <div>
                    <dt className="text-micro text-fg-3">Призовой фонд</dt>
                    <dd className="text-[15px] font-medium text-fg">{t.prize_pool}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <div className="hidden sm:block">
                <HeroCta t={lite} approvedCount={approved.length} />
              </div>
              <p className="max-w-sm text-meta text-fg-3 lg:text-right">{nextStepText(t)}</p>
            </div>
          </div>
          <div className="mt-7 max-w-4xl">
            <TournamentLifecycle t={t} />
          </div>
        </Container>
      </section>

      {/* ── вкладки (липкие) + содержимое: общий контейнер, чтобы вкладки держались при прокрутке */}
      <Container>
        <ClientTabs
          scope="tournament"
          defaultKey={defaultTab}
          sticky
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

        <div className="pt-10" data-tabs-scope="tournament">
          {finished && recap && (
            <TabPanel tab="recap" defaultKey={defaultTab}>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-fg-3">Отдельная страница итогов — её удобно отправить в чат или соцсети.</p>
                <Button href={`${base}/recap`} variant="secondary" iconRight={<ExternalLink />}>
                  Страница итогов
                </Button>
              </div>
              <RecapView recap={recap} solo={solo} imageBase={`${base}/recap/image`} />
            </TabPanel>
          )}

          <TabPanel tab="overview" defaultKey={defaultTab}>
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
              <div className="min-w-0">
                {["live", "finished"].includes(t.status) && <MvpBlock tournamentId={t.id} finished={finished} />}
                <Overview t={t} lite={lite} mapImages={mapImages} />
              </div>
              <aside className="space-y-8 lg:sticky lg:top-[calc(var(--shell-h)+72px)]">
                <ParticipationPanel t={lite} approvedCount={approved.length} />
                <div>
                  <SubsectionTitle>Даты</SubsectionTitle>
                  <dl className="divide-y divide-line-subtle text-[14px]">
                    {[
                      ["Регистрация", t.registration_opens_at || t.registration_closes_at ? `${formatDate(t.registration_opens_at)} — ${formatDate(t.registration_closes_at)}` : "уточняется"],
                      ["Check-in", t.checkin_opens_at ? formatDateTime(t.checkin_opens_at) : "перед стартом"],
                      ["Старт", t.starts_at ? formatDateTime(t.starts_at) : "уточняется"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2.5">
                        <dt className="text-fg-3">{k}</dt>
                        <dd className="text-right text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {hasPrize && (
                  <div>
                    <SubsectionTitle>Призовой фонд</SubsectionTitle>
                    {real(t.prize_pool) && <div className="text-heading text-fg">{t.prize_pool}</div>}
                    {places.length > 0 && (
                      <dl className="mt-2 divide-y divide-line-subtle text-[14px]">
                        {places.map((p) => (
                          <div key={p.place} className="flex justify-between gap-4 py-2.5">
                            <dt className="text-fg-3">{p.place}</dt>
                            <dd className="text-fg">{p.prize}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
                {(t.entry_fee || t.discord_url || t.contact) && (
                  <div>
                    <SubsectionTitle>Организатор</SubsectionTitle>
                    <dl className="divide-y divide-line-subtle text-[14px]">
                      {t.entry_fee && (
                        <div className="flex justify-between gap-4 py-2.5">
                          <dt className="text-fg-3">Взнос</dt>
                          <dd className="text-fg">{t.entry_fee}</dd>
                        </div>
                      )}
                      {t.contact && (
                        <div className="flex justify-between gap-4 py-2.5">
                          <dt className="text-fg-3">Контакт</dt>
                          <dd className="text-right text-fg">{t.contact}</dd>
                        </div>
                      )}
                    </dl>
                    {t.discord_url && (
                      <Button href={t.discord_url} external variant="secondary" block className="mt-3" iconRight={<ExternalLink />}>
                        Discord турнира
                      </Button>
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
            {matches.length > 0 && draw && (
              <p className="mb-8 max-w-read text-meta text-fg-3">
                Посев определён жеребьёвкой {formatDateTime(draw.at)}. Порядок: {drawOrderText(draw)}.
              </p>
            )}
            {matches.length ? (
              <StagesTab t={t} matches={matches} />
            ) : (
              <EmptyState
                icon={<Swords />}
                title="Сетки пока нет"
                text={`${bracketLabel[t.bracket_type] ?? t.bracket_type} на ${t.max_teams} ${solo ? "участников" : "команд"}. Посев опубликуют после check-in.`}
                next={t.starts_at ? formatDateTime(t.starts_at) : undefined}
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
            <div className="max-w-read">
              {t.rules ? (
                <div className="prose-f16">{t.rules}</div>
              ) : (
                <EmptyState
                  title="Регламент турнира ещё не опубликован"
                  text="Пока действуют общие правила платформы."
                  action={
                    <Button href="/rules" variant="secondary" size="sm">
                      Общие правила
                    </Button>
                  }
                />
              )}
              <HelpHint topics={["register-tournament", "change-application", "checkin"]} className="mt-8" />
            </div>
          </TabPanel>
        </div>
      </Container>
      <MobileCta t={lite} approvedCount={approved.length} />
    </>
  );
}

function Overview({ t, lite, mapImages }: { t: Tournament; lite: TournamentLite; mapImages: Record<string, string> }) {
  const mode = modeOf(t.format);
  const bo = t.default_best_of === t.final_best_of ? `BO${t.default_best_of}` : `BO${t.default_best_of} → BO${t.final_best_of} в финале`;
  return (
    <Stack>
      {t.stream_url && (
        <Section
          title="Трансляция"
          action={
            <a href={t.stream_url} target="_blank" rel="noreferrer" className="text-meta font-medium text-accent hover:text-accent-strong">
              Открыть отдельно ↗
            </a>
          }
        >
          <StreamEmbed url={t.stream_url} />
        </Section>
      )}

      {t.description && (
        <Section title="О турнире">
          <div className="prose-f16 max-w-read">{t.description}</div>
        </Section>
      )}

      <Section title="Формат турнира" description="Как будет проходить соревнование">
        {/* главное — сразу, крупно */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-heading text-fg">
          <span>{mode.size === 1 ? "1 на 1" : `${mode.size} на ${mode.size}`}</span>
          <span className="text-fg-4" aria-hidden>·</span>
          <span>{bracketLabel[t.bracket_type] ?? t.bracket_type}</span>
          <span className="text-fg-4" aria-hidden>·</span>
          <span className="num">{bo}</span>
        </div>
        <Facts
          columns={4}
          className="mt-6 border-t border-line-subtle pt-6"
          items={[
            { label: "Стороны", value: t.knife_round ? "Ножевой раунд" : "Фиксированные" },
            { label: "Овертайм", value: t.overtime ? `MR3 при ${mode.size === 2 ? "8:8" : "12:12"}` : "Нет" },
            { label: "Тактические паузы", value: <span className="num">{t.timeouts_per_team} × {t.timeout_seconds} с</span> },
            { label: "Технические паузы", value: <span className="num">{t.tech_pauses} × {Math.round(t.tech_pause_seconds / 60)} мин</span> },
            ...(t.map_pool.some((map) => /^de_/i.test(map.split("@")[0]))
              ? [{ label: "Голос на смене сторон", value: "Обе команды на de-картах" }]
              : []),
            ...(t.match_format ? [{ label: "Матчи", value: t.match_format }] : []),
          ]}
        />
      </Section>

      <Section title="Маппул" description={`${t.map_pool.length} ${t.map_pool.length === 1 ? "карта" : t.map_pool.length < 5 ? "карты" : "карт"}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {t.map_pool.map((m) => (
            <MapTile key={m} map={m} image={mapImages[m]} className="!h-24 sm:!h-28" />
          ))}
        </div>
        <span className="sr-only">{t.map_pool.map(mapName).join(", ")}</span>
      </Section>

      <Section title="Требования">
        {t.requirements ? (
          <div className="prose-f16 max-w-read">{t.requirements}</div>
        ) : (
          <ul className="max-w-read space-y-2.5">
            {[
              "Вход на платформу через Steam у каждого игрока",
              `${mode.title}: в основе ${mainPlayersLabel(mode.size)}${mode.subs ? `, до ${mode.subs} запасных` : ""}`,
              "Один игрок — одна команда в рамках турнира",
              "Check-in капитаном в отведённое время",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2.5 text-[14px] text-fg-2">
                <Check className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        )}
        <MyRequirements t={lite} />
      </Section>

      {t.sponsors?.length > 0 && (
        <Section title="Партнёры">
          <div className="flex flex-wrap gap-x-10 gap-y-3 text-title text-fg-2">
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
        </Section>
      )}
    </Stack>
  );
}

function TeamsTab({ approved, pendingCount, solo }: { approved: Awaited<ReturnType<typeof getTournamentRegistrations>>; pendingCount: number; solo: boolean }) {
  if (approved.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={solo ? "Пока нет участников" : "Пока нет одобренных команд"}
        text={pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "заявка ожидает" : "заявки ожидают"} подтверждения.` : "Станьте первыми, кто подаст заявку."}
      />
    );
  }
  return (
    <Section title={solo ? "Участники" : "Команды"} description={`${approved.length} ${solo ? "участников" : "команд"}${pendingCount > 0 ? ` · ещё на рассмотрении: ${pendingCount}` : ""}`}>
      <RowList>
        {approved.map((r) => (
          <div key={r.id} className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              {r.seed && <span className="num w-6 text-meta text-fg-3">{r.seed}</span>}
              <TeamLogo src={r.team.logo_url} tag={r.team.tag} size="md" />
              <div className="min-w-0 flex-1">
                <Link href={`/teams/${encodeURIComponent(r.team.tag)}`} className="block truncate text-[15px] font-semibold text-fg hover:text-accent">
                  {r.team.name}
                </Link>
                <div className="text-meta text-fg-3">
                  {r.team.tag}
                  {r.team.region ? ` · ${r.team.region}` : ""}
                </div>
              </div>
              {r.checked_in_at && <Status info={{ label: "Check-in пройден", tone: "ok" }} size="sm" />}
            </div>
            {!solo && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:pl-[60px]">
                {[...r.roster]
                  .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
                  .map((rp) => (
                    <Link key={rp.id} href={`/players/${rp.player.steam_id}`} className="flex items-center gap-2 text-meta text-fg-2 hover:text-fg">
                      <Avatar src={rp.player.avatar_url} name={rp.player.nickname} size="xs" />
                      <span className="max-w-[140px] truncate">{rp.player.nickname}</span>
                      <FaceitLevel level={rp.player.faceit_level} className="!size-5 !text-[10px]" />
                      {rp.role === "sub" && <span className="text-micro text-fg-3">запас</span>}
                    </Link>
                  ))}
              </div>
            )}
          </div>
        ))}
      </RowList>
    </Section>
  );
}

function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyState icon={<Gamepad2 />} title="Матчей пока нет" text="Расписание появится вместе с сеткой турнира." />;
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
    <Stack className="max-w-[1100px]">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            <RowList>
              {g.items.map((m) => (
                <MatchListRow key={m.id} m={m} meta={`${matchStage(m, matches)} · BO${m.best_of}${m.scheduled_at && m.status !== "finished" ? ` · ${formatDateTime(m.scheduled_at)}` : ""}`} />
              ))}
            </RowList>
          </Section>
        ))}
    </Stack>
  );
}

async function StatsTab({ tournamentId, solo }: { tournamentId: string; solo: boolean }) {
  // getPlayerLeaderboard кэширован на запрос — getTeamStats и MvpBlock берут ту же таблицу, а не считают заново
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
                <EmptyState compact title="Появится после первого сыгранного матча" text="Победы, карты, раунды и сумма по игрокам." />
              )}
            </TabPanel>
          </div>
        </div>
      ) : (
        <EmptyState title="Статистика появится после первого матча" text="Убийства, ADR, KAST и F16 Rating считаются с наших серверов автоматически." />
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
    <section className="mb-12">
      <SectionTitle>{finished ? "MVP турнира" : mvp.by === "swing" ? "Лидер по Swing" : "Лидер по рейтингу"}</SectionTitle>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={mvp.player?.avatar_url} name={nick} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-heading text-fg">
              {mvp.player ? (
                <Link href={`/players/${mvp.player.steam_id}`} className="hover:text-accent">
                  {nick}
                </Link>
              ) : (
                nick
              )}
            </div>
            <div className="text-meta text-fg-3">{mvp.team?.name ?? ""}</div>
          </div>
        </div>
        <dl className="flex flex-wrap gap-8">
          {[
            { l: "Swing", v: fmt.swing(mvp.swing), c: "text-ok" },
            { l: "Rating", v: fmt.r(mvp.rating) },
            { l: "ADR", v: fmt.d1(mvp.adr) },
            { l: "K/D", v: mvp.kd.toFixed(2) },
            { l: "Карты", v: String(mvp.maps) },
          ].map((x) => (
            <div key={x.l}>
              <dd className={`num text-title ${x.c ?? "text-fg"}`}>{x.v}</dd>
              <dt className="text-micro text-fg-3">{x.l}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

async function StagesTab({ t, matches }: { t: Tournament; matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const teams = new Map(matches.flatMap((m) => [m.team1, m.team2]).filter((x): x is NonNullable<typeof x> => !!x).map((x) => [x.id, x]));
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
          <GroupStageView groups={groups} teams={teams} advance={t.bracket_type === "groups_playoff" ? t.advance_per_group : undefined} solo={t.format === "1v1"} />
        ))}
      {playoff.length > 0 ? (
        <div>
          {hasStage && <SectionTitle>Плей-офф</SectionTitle>}
          <BracketView matches={playoff} />
        </div>
      ) : (
        hasStage &&
        (t.bracket_type === "groups_playoff" || t.bracket_type === "swiss_playoff") && <EmptyState compact title="Плей-офф" text="Сетка плей-офф появится автоматически после групповой стадии." />
      )}
    </div>
  );
}
