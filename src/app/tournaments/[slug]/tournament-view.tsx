import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Crown, ExternalLink, Gamepad2, Swords, Users } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
import { LiveRefresh } from "@/components/live-refresh";
import { eloAverage, getTournamentRegistrations } from "@/lib/data";
import { getMapImages } from "@/lib/settings";
import { bracketLabel, formatDate, formatDateTime, mapName, formatMoney } from "@/lib/format";
import type { Tournament } from "@/lib/types";
import { getStandings, getTournamentMatches } from "@/lib/matches";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { getPlayerLeaderboard, getTeamStats, getTournamentMvp } from "@/lib/stats";
import { getTournamentDays } from "@/lib/top-players";
import { TopDownloads } from "@/components/top-downloads";
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
import { TournamentAwards } from "@/components/competition/tournament-awards";
import { getTournamentNominations } from "@/lib/nominations";
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
  CARD_SECTION,
  cn,
} from "@/components/ds";
import { Check } from "lucide-react";
import { groupSponsors } from "@/lib/sponsors";
import { tournamentForLang } from "@/lib/tournament-kk";
import { getT } from "@/lib/i18n/server";
import { tr, type T } from "@/lib/i18n/core";

const real = (v: string | null | undefined) => !!v && !/^\s*0+\s*$/.test(v);

/** Статус турнира словами — для баннера на тёмной обложке */
const STATUS_WORD: Record<Tournament["status"], { text: string; tone: "live" | "ok" | "warn" | "muted" }> = {
  draft: { text: tr("Черновик"), tone: "muted" },
  registration: { text: tr("Регистрация открыта"), tone: "ok" },
  registration_closed: { text: tr("Регистрация закрыта"), tone: "warn" },
  checkin: { text: tr("Идёт check-in"), tone: "warn" },
  live: { text: tr("Турнир идёт"), tone: "live" },
  finished: { text: tr("Турнир завершён"), tone: "muted" },
  cancelled: { text: tr("Турнир отменён"), tone: "muted" },
};

async function StatusWord({ status }: { status: Tournament["status"] }) {
  const tx = await getT();
  const s = STATUS_WORD[status];
  const color = { live: "text-live", ok: "text-ok", warn: "text-warn", muted: "text-fg-2" }[s.tone];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[13.5px] font-bold ${color}`}>
      {s.tone !== "muted" && <span className={`size-2 rounded-full bg-current ${s.tone === "live" ? "animate-pulse" : ""}`} aria-hidden />}
      {tx(s.text)}
    </span>
  );
}

const modeLabel = (format: string, tx: T) => tx(modeOf(format).label);

/** Медаль места: 1 — золото, 2 — серебро, 3 — бронза */
function Medal({ n }: { n: number }) {
  const tone = n === 1 ? "bg-gold/20 text-gold" : n === 2 ? "bg-silver/20 text-silver" : n === 3 ? "bg-bronze/20 text-bronze" : "bg-ink/[0.06] text-fg-3";
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${tone}`}>{n}</span>;
}

/**
 * Страница турнира. Одинакова для всех зрителей — отдаётся из кэша CDN (ISR);
 * «моё участие» (панель, кнопки, требования) — клиентские острова из tournament-viewer.
 * Структура: шапка турнира → липкие вкладки (ClientTabs, мгновенные) → содержимое.
 */
export async function TournamentView({ t: raw }: { t: Tournament }) {
  const tx = await getT();
  // по-казахски — регламент, требования и призы из блока «Қазақша» пульта
  const t = tournamentForLang(raw, tx.lang);
  const finished = t.status === "finished";
  // у завершённого турнира по умолчанию открываются итоги
  const defaultTab = finished ? "recap" : "overview";

  const [regs, matches, mapImages, recap, draw] = await Promise.all([
    getTournamentRegistrations(t.id),
    getTournamentMatches(t.id),
    getMapImages(),
    finished ? getTournamentRecap(t, tx) : Promise.resolve(null),
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
  // ход турнира: настоящие матчи (без отменённых и пропусков хода)
  const counted = matches.filter((m) => m.status !== "cancelled" && !(m.is_walkover && (!m.team1_id || !m.team2_id)));
  const progress = { played: counted.filter((m) => m.status === "finished").length, total: counted.length, now: counted.filter((m) => ["veto", "ready", "live"].includes(m.status)).length };

  return (
    <>
      {["registration", "checkin", "live"].includes(t.status) && <LiveRefresh watch={`tournament:${t.id}`} intervalMs={5000} />}

      {/* ── шапка турнира: баннер с обложкой, ниже — этапы турнира карточками */}
      <Container className="pt-4 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/tournaments" className="inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
            <ArrowLeft className="size-4" /> {tx("Турниры")}
          </Link>
          <AdminControlLink t={lite} />
        </div>
        {t.status === "draft" && (
          <Callout tone="warn" title={tx("Черновик")} className="mt-3 max-w-2xl">
            {tx("Страницу видят только администраторы. Откройте регистрацию, чтобы опубликовать турнир.")}
          </Callout>
        )}
        <section className="relative isolate mt-3 overflow-hidden rounded-feature bg-ink text-white">
          <Image src={t.cover_url ?? "/home/tournament.jpg"} alt="" fill priority sizes="(min-width: 1024px) 1100px, 100vw" className="-z-20 object-cover object-[60%_30%]" unoptimized={!!t.cover_url} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 to-ink/25" aria-hidden />
          <div className="flex min-h-[260px] flex-col justify-end gap-5 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusWord status={t.status} />
                {[t.game ? `${t.game} · ${modeLabel(t.format, tx)}` : modeLabel(t.format, tx), tx(bracketLabel[t.bracket_type] ?? t.bracket_type), t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? tx("Онлайн"))]
                  .filter(Boolean)
                  .map((x) => (
                    <span key={x} className="rounded-full bg-white/15 px-3 py-1 text-[13.5px] font-semibold backdrop-blur-sm">
                      {x}
                    </span>
                  ))}
              </div>
              <h1 className="mt-3 break-words text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">{t.name}</h1>
              <dl className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { k: tx("Старт"), v: t.starts_at ? formatDateTime(t.starts_at, tx.lang) : tx("дата уточняется") },
                  { k: solo ? tx("Участники") : tx("Команды"), v: tx("{a} из {b}", { a: approved.length, b: t.max_teams }) },
                  ...(real(t.prize_pool) ? [{ k: tx("Призовой фонд"), v: formatMoney(t.prize_pool) }] : places[0] ? [{ k: tx("Главный приз"), v: places[0].prize }] : []),
                ].map((f) => (
                  <div key={f.k} className="rounded-control bg-white/12 px-3.5 py-2 backdrop-blur-sm">
                    <dt className="text-[12px] font-semibold text-white/70">{f.k}</dt>
                    <dd className="text-[15.5px] font-bold">{f.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <div className="hidden sm:block">
                <HeroCta t={lite} approvedCount={approved.length} />
              </div>
              <p className="max-w-sm text-[14.5px] text-white/80 lg:text-right">{nextStepText(t, tx)}</p>
            </div>
          </div>
        </section>
        <div className="mt-3 mb-2">
          <TournamentLifecycle t={t} approvedCount={approved.length} played={progress.played} total={progress.total} />
        </div>
      </Container>

      {/* ── вкладки (липкие) + содержимое: общий контейнер, чтобы вкладки держались при прокрутке */}
      <Container>
        <ClientTabs
          scope="tournament"
          defaultKey={defaultTab}
          sticky
          items={[
            ...(finished ? [{ key: "recap", label: tx("Итоги") }] : []),
            { key: "overview", label: tx("Обзор") },
            { key: "teams", label: solo ? tx("Участники") : tx("Команды") },
            { key: "bracket", label: tx("Сетка") },
            { key: "matches", label: tx("Матчи") },
            { key: "stats", label: tx("Статистика") },
            { key: "rules", label: tx("Правила") },
          ]}
        />

        <div className="pt-10" data-tabs-scope="tournament">
          {finished && recap && (
            <TabPanel tab="recap" defaultKey={defaultTab}>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-fg-3">{tx("Отдельная страница итогов — её удобно отправить в чат или соцсети.")}</p>
                <Button href={`${base}/recap`} variant="secondary" iconRight={<ExternalLink />}>
                  {tx("Страница итогов")}
                </Button>
              </div>
              <RecapView recap={recap} solo={solo} imageBase={`${base}/recap/image`} />
            </TabPanel>
          )}

          <TabPanel tab="overview" defaultKey={defaultTab}>
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
              <div className="flex min-w-0 flex-col gap-5">
                {["live", "finished"].includes(t.status) && <MvpBlock tournamentId={t.id} finished={finished} />}
                <Overview t={t} lite={lite} mapImages={mapImages} />
              </div>
              <aside className="space-y-5 lg:sticky lg:top-[calc(var(--shell-h)+72px)]">
                <ParticipationPanel t={lite} approvedCount={approved.length} />
                <div className="rounded-surface border border-line-subtle bg-surface p-5">
                  <SubsectionTitle>{tx("Даты")}</SubsectionTitle>
                  <dl className="divide-y divide-line-subtle text-[14px]">
                    {[
                      [tx("Регистрация"), t.registration_opens_at || t.registration_closes_at ? `${formatDate(t.registration_opens_at, tx.lang)} — ${formatDate(t.registration_closes_at, tx.lang)}` : tx("уточняется")],
                      ["Check-in", t.checkin_opens_at ? formatDateTime(t.checkin_opens_at, tx.lang) : tx("перед стартом")],
                      [tx("Старт"), t.starts_at ? formatDateTime(t.starts_at, tx.lang) : tx("уточняется")],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2.5">
                        <dt className="text-fg-3">{k}</dt>
                        <dd className="text-right text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {progress.total > 0 && t.status !== "finished" && (
                  <div className="rounded-surface border border-line-subtle bg-surface p-5">
                    <SubsectionTitle>{tx("Ход турнира")}</SubsectionTitle>
                    <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.played} aria-label={tx("Сыграно матчей")}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((100 * progress.played) / progress.total)}%` }} />
                    </div>
                    <dl className="mt-3 divide-y divide-line-subtle text-[15px]">
                      <div className="flex justify-between gap-4 py-2.5">
                        <dt className="text-fg-3">{tx("Сыграно")}</dt>
                        <dd className="font-bold text-fg">
                          {tx("{a} из {b} матчей", { a: progress.played, b: progress.total })}
                        </dd>
                      </div>
                      {progress.now > 0 && (
                        <div className="flex justify-between gap-4 py-2.5">
                          <dt className="text-fg-3">{tx("Идут сейчас")}</dt>
                          <dd className="font-bold text-live">{progress.now}</dd>
                        </div>
                      )}
                    </dl>
                    <Button href={`${base}?tab=bracket`} variant="secondary" block className="mt-2">
                      {tx("Смотреть сетку")}
                    </Button>
                  </div>
                )}
                {hasPrize && (
                  <div className="rounded-surface border border-line-subtle bg-surface p-5">
                    <SubsectionTitle>{tx("Призы")}</SubsectionTitle>
                    {real(t.prize_pool) && <div className="mb-2 text-heading text-fg">{formatMoney(t.prize_pool)}</div>}
                    {places.length > 0 && (
                      <ul className="space-y-2.5">
                        {places.map((p, i) => (
                          <li key={p.place} className="flex items-center gap-3">
                            <Medal n={i + 1} />
                            <span className="min-w-0">
                              <span className="block text-[15.5px] font-bold text-fg">{p.prize}</span>
                              <span className="block text-meta text-fg-3">{p.place}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(t.entry_fee || t.discord_url || t.contact) && (
                  <div className="rounded-surface border border-line-subtle bg-surface p-5">
                    <SubsectionTitle>{tx("Организатор")}</SubsectionTitle>
                    <dl className="divide-y divide-line-subtle text-[14px]">
                      {t.entry_fee && (
                        <div className="flex justify-between gap-4 py-2.5">
                          <dt className="text-fg-3">{tx("Взнос")}</dt>
                          <dd className="text-fg">{formatMoney(t.entry_fee)}</dd>
                        </div>
                      )}
                      {t.contact && (
                        <div className="flex justify-between gap-4 py-2.5">
                          <dt className="text-fg-3">{tx("Контакт")}</dt>
                          <dd className="text-right text-fg">{t.contact}</dd>
                        </div>
                      )}
                    </dl>
                    {t.discord_url && (
                      <Button href={t.discord_url} external variant="secondary" block className="mt-3" iconRight={<ExternalLink />}>
                        {tx("Discord турнира")}
                      </Button>
                    )}
                  </div>
                )}
                <ShareButton title={t.name} />
              </aside>
            </div>
          </TabPanel>

          <TabPanel tab="teams" defaultKey={defaultTab}>
            <TeamsTab approved={approved} pendingCount={pending.length} solo={solo} maxTeams={t.max_teams} />
          </TabPanel>
          <TabPanel tab="bracket" defaultKey={defaultTab}>
            {matches.length > 0 && draw && (
              <p className="mb-8 max-w-read text-meta text-fg-3">
                {tx("Посев определён жеребьёвкой {date}. Порядок: {order}.", { date: formatDateTime(draw.at, tx.lang), order: drawOrderText(draw) })}
              </p>
            )}
            {matches.length ? (
              <StagesTab t={t} matches={matches} />
            ) : (
              <EmptyState
                icon={<Swords />}
                title={tx("Сетки пока нет")}
                text={solo ? tx("{bracket} на {n} участников. Посев опубликуют после check-in.", { bracket: tx(bracketLabel[t.bracket_type] ?? t.bracket_type), n: t.max_teams }) : tx("{bracket} на {n} команд. Посев опубликуют после check-in.", { bracket: tx(bracketLabel[t.bracket_type] ?? t.bracket_type), n: t.max_teams })}
                next={t.starts_at ? formatDateTime(t.starts_at, tx.lang) : undefined}
              />
            )}
          </TabPanel>
          <TabPanel tab="matches" defaultKey={defaultTab}>
            <MatchesTab matches={matches} />
          </TabPanel>
          <TabPanel tab="stats" defaultKey={defaultTab}>
            <StatsTab tournamentId={t.id} slug={t.slug} solo={solo} finished={finished} />
          </TabPanel>
          <TabPanel tab="rules" defaultKey={defaultTab}>
            <div className="max-w-read">
              {t.rules ? (
                <div className="prose-f16">{t.rules}</div>
              ) : (
                <EmptyState
                  title={tx("Регламент турнира ещё не опубликован")}
                  text={tx("Пока действуют общие правила платформы.")}
                  action={
                    <Button href="/rules" variant="secondary" size="sm">
                      {tx("Общие правила")}
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

async function Overview({ t, lite, mapImages }: { t: Tournament; lite: TournamentLite; mapImages: Record<string, string> }) {
  const tx = await getT();
  const mode = modeOf(t.format);
  const bo = t.default_best_of === t.final_best_of ? `BO${t.default_best_of}` : tx("BO{a} → BO{b} в финале", { a: t.default_best_of, b: t.final_best_of });
  return (
    <Stack className="gap-5 lg:gap-5">
      {t.stream_url && (
        <Section card
          title={tx("Трансляция")}
          action={
            <a href={t.stream_url} target="_blank" rel="noreferrer" className="text-meta font-medium text-accent hover:text-accent-strong">
              {tx("Открыть отдельно ↗")}
            </a>
          }
        >
          <StreamEmbed url={t.stream_url} />
        </Section>
      )}

      {t.description && (
        <Section card title={tx("О турнире")}>
          <div className="prose-f16 max-w-read">{t.description}</div>
        </Section>
      )}

      <Section card title={tx("Формат турнира")} description={tx("Как будет проходить соревнование")}>
        {/* главное — сразу, крупно */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-heading text-fg">
          <span>{tx(mode.label)}</span>
          <span className="text-fg-4" aria-hidden>·</span>
          <span>{tx(bracketLabel[t.bracket_type] ?? t.bracket_type)}</span>
          <span className="text-fg-4" aria-hidden>·</span>
          <span className="num">{bo}</span>
        </div>
        <Facts
          columns={4}
          className="mt-6 border-t border-line-subtle pt-6"
          items={[
            { label: tx("Стороны"), value: t.knife_round ? tx("Ножевой раунд") : tx("Фиксированные") },
            { label: tx("Овертайм"), value: t.overtime ? tx("MR3 при {score}", { score: mode.size === 2 ? "8:8" : "12:12" }) : tx("Нет") },
            { label: tx("Тактические паузы"), value: <span className="num">{tx("{n} × {s} с", { n: t.timeouts_per_team, s: t.timeout_seconds })}</span> },
            { label: tx("Технические паузы"), value: <span className="num">{tx("{n} × {m} мин", { n: t.tech_pauses, m: Math.round(t.tech_pause_seconds / 60) })}</span> },
            ...(t.map_pool.some((map) => /^de_/i.test(map.split("@")[0]))
              ? [{ label: tx("Голос на смене сторон"), value: tx("Обе команды на de-картах") }]
              : []),
            ...(t.match_format ? [{ label: tx("Матчи"), value: t.match_format }] : []),
          ]}
        />
      </Section>

      <Section card title={tx("Маппул")} description={`${t.map_pool.length} ${tx.plural(t.map_pool.length, "карта", "карты", "карт")}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {t.map_pool.map((m) => (
            <MapTile key={m} map={m} image={mapImages[m]} className="!h-24 sm:!h-28" />
          ))}
        </div>
        <span className="sr-only">{t.map_pool.map(mapName).join(", ")}</span>
      </Section>

      <Section card title={tx("Требования")}>
        {t.requirements ? (
          <div className="prose-f16 max-w-read">{t.requirements}</div>
        ) : (
          <ul className="max-w-read space-y-2.5">
            {[
              tx("Вход на платформу через Steam у каждого игрока"),
              mode.subs
                ? tx("{mode}: в основе {players}, до {n} запасных", { mode: tx(mode.title), players: mainPlayersLabel(mode.size, tx), n: mode.subs })
                : tx("{mode}: в основе {players}", { mode: tx(mode.title), players: mainPlayersLabel(mode.size, tx) }),
              tx("Один игрок — одна команда в рамках турнира"),
              tx("Check-in капитаном в отведённое время"),
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
        <Section card title={tx("Организаторы и партнёры")}>
          <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {groupSponsors(t.sponsors).map((g) => (
              <div key={g.role}>
                <dt className="text-[13px] font-semibold uppercase tracking-wide text-fg-3">{tx(g.label)}</dt>
                <dd className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-title text-fg">
                  {g.items.map((sp) =>
                    sp.url ? (
                      <a key={sp.name} href={sp.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {sp.name}
                      </a>
                    ) : (
                      <span key={sp.name}>{sp.name}</span>
                    ),
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </Stack>
  );
}

async function TeamsTab({ approved, pendingCount, solo, maxTeams }: { approved: Awaited<ReturnType<typeof getTournamentRegistrations>>; pendingCount: number; solo: boolean; maxTeams: number }) {
  const tx = await getT();
  if (approved.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={solo ? tx("Пока нет участников") : tx("Пока нет одобренных команд")}
        text={
          pendingCount > 0
            ? tx.plural(pendingCount, "{n} заявка ожидает подтверждения.", "{n} заявки ожидают подтверждения.", "{n} заявок ожидают подтверждения.").replace("{n}", String(pendingCount))
            : tx("Станьте первыми, кто подаст заявку.")
        }
      />
    );
  }
  const filled = Math.min(approved.length, maxTeams);
  const pct = maxTeams ? Math.round((filled / maxTeams) * 100) : 0;
  const avgElo = (r: (typeof approved)[number]) => {
    return eloAverage(r.roster.filter((rp) => rp.role === "main").map((rp) => rp.player.faceit_elo));
  };
  return (
    <Stack>
      {/* заполненность турнира */}
      <div className="rounded-surface border border-line-subtle bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-meta font-semibold uppercase tracking-wide text-fg-3">{solo ? tx("Участники") : tx("Команды")}</div>
            <div className="mt-1 text-[28px] font-bold leading-none text-fg">
              <span className="num">{filled}</span>
              <span className="text-fg-3"> / {maxTeams}</span>
            </div>
          </div>
          <div className="text-right text-meta text-fg-2">
            {filled >= maxTeams ? tx("Мест больше нет") : tx("Свободно мест: {n}", { n: maxTeams - filled })}
            {pendingCount > 0 && <div className="text-fg-3">{tx("ещё на рассмотрении: {n}", { n: pendingCount })}</div>}
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {approved.map((r, i) => {
          const elo = avgElo(r);
          const roster = [...r.roster].sort((a, b) => (a.role === b.role ? (a.player.id === r.team.captain_id ? -1 : b.player.id === r.team.captain_id ? 1 : 0) : a.role === "main" ? -1 : 1));
          return (
            <article key={r.id} className="flex flex-col overflow-hidden rounded-surface border border-line-subtle bg-surface transition-shadow hover:shadow-[var(--shadow-pop)]">
              <header className="flex items-center gap-4 border-b border-line-subtle bg-gradient-to-r from-accent-dim/40 to-transparent p-4">
                <TeamLogo src={r.team.logo_url} tag={r.team.tag} size="lg" />
                <div className="min-w-0 flex-1">
                  <Link href={`/teams/${encodeURIComponent(r.team.tag)}`} className="block truncate text-[18px] font-bold text-fg hover:text-accent">
                    {r.team.name}
                  </Link>
                  <div className="mt-0.5 truncate text-meta text-fg-3">
                    <span className="font-semibold text-fg-2">{r.team.tag}</span>
                    {r.team.region ? ` · ${r.team.region}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {elo != null && (
                    <>
                      <div className="num text-[17px] font-bold text-fg">{elo}</div>
                      <div className="text-micro text-fg-3">{tx("средний ELO")}</div>
                    </>
                  )}
                  {r.seed ? <div className="text-micro text-fg-3">{tx("посев {n}", { n: r.seed })}</div> : <div className="num text-micro text-fg-4">#{i + 1}</div>}
                </div>
              </header>
              {!solo && (
                <ul className="flex-1 divide-y divide-line-subtle px-4 py-1">
                  {roster.map((rp) => {
                    const captain = rp.player.id === r.team.captain_id;
                    return (
                      <li key={rp.id}>
                        <Link href={`/players/${rp.player.steam_id}`} className="flex items-center gap-3 py-2 text-[14px] text-fg-2 hover:text-fg">
                          <Avatar src={rp.player.avatar_url} name={rp.player.nickname} size="sm" />
                          <span className="min-w-0 flex-1 truncate font-medium text-fg">{rp.player.nickname}</span>
                          {captain && <Crown className="size-4 shrink-0 text-warn" aria-label={tx("Капитан")} />}
                          {rp.role === "sub" && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-micro text-fg-3">{tx("запас")}</span>}
                          <FaceitLevel level={rp.player.faceit_level} className="!size-6 !text-[11px]" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {r.checked_in_at && (
                <footer className="border-t border-line-subtle px-4 py-2.5">
                  <Status info={{ label: tx("Check-in пройден"), tone: "ok" }} size="sm" />
                </footer>
              )}
            </article>
          );
        })}
      </div>
    </Stack>
  );
}

async function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const tx = await getT();
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyState icon={<Gamepad2 />} title={tx("Матчей пока нет")} text={tx("Расписание появится вместе с сеткой турнира.")} />;
  }
  // предстоящие — по дням расписания, без времени — отдельной группой
  const upcoming = list
    .filter((m) => ["upcoming", "pending"].includes(m.status))
    .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999") || a.number - b.number);
  const byDay = new Map<string, typeof upcoming>();
  for (const m of upcoming) {
    const key = m.scheduled_at ? formatDate(m.scheduled_at, tx.lang) : tx("Время не назначено");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }
  const groups = [
    { title: tx("Сейчас"), items: list.filter((m) => ["veto", "ready", "live"].includes(m.status)) },
    ...[...byDay].map(([day, items]) => ({ title: day, items })),
    { title: tx("Сыгранные"), items: list.filter((m) => m.status === "finished").reverse() },
  ];
  return (
    <Stack className="max-w-[1100px]">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Section key={g.title} title={g.title}>
            <RowList>
              {g.items.map((m) => (
                <MatchListRow key={m.id} m={m} meta={`${matchStage(m, matches)} · BO${m.best_of}${m.scheduled_at && m.status !== "finished" ? ` · ${formatDateTime(m.scheduled_at, tx.lang)}` : ""}`} />
              ))}
            </RowList>
          </Section>
        ))}
    </Stack>
  );
}

async function StatsTab({ tournamentId, slug, solo, finished }: { tournamentId: string; slug: string; solo: boolean; finished: boolean }) {
  const tx = await getT();
  // getPlayerLeaderboard кэширован на запрос — getTeamStats и MvpBlock берут ту же таблицу, а не считают заново
  const [rows, teams, nominations, days] = await Promise.all([getPlayerLeaderboard(tournamentId), getTeamStats(tournamentId), getTournamentNominations(tournamentId, tx), getTournamentDays(tournamentId)]);
  return (
    <div className="space-y-10">
      {rows.length > 0 && <TopDownloads slug={slug} days={days} gate />}
      {rows.length > 0 && <TournamentAwards nominations={nominations} rows={rows} finished={finished} />}
      {rows.length ? (
        <div className="space-y-6">
          <ClientTabs
            scope="tstats"
            param="stat"
            defaultKey="players"
            items={[
              { key: "players", label: tx("Игроки") },
              { key: "teams", label: solo ? tx("Участники") : tx("Команды") },
            ]}
          />
          <div data-tabs-scope="tstats">
            <TabPanel tab="players" defaultKey="players" className="space-y-6">
              <p className="max-w-read text-[15px] text-fg-2">
                {tx.rich("<b>Рейтинг</b> показывает, насколько игрок помог команде: больше — лучше, средний игрок — около 1.00.", { b: (c) => <b className="text-fg">{c}</b> })}
              </p>
              <StatLeaders rows={rows} />
              <PlayerStatsTable rows={rows} solo={solo} showTeam={!solo} plain />
            </TabPanel>
            <TabPanel tab="teams" defaultKey="players">
              {teams.length ? (
                <TeamStatsTable rows={teams} solo={solo} />
              ) : (
                <EmptyState compact title={tx("Появится после первого сыгранного матча")} text={tx("Победы, карты, раунды и сумма по игрокам.")} />
              )}
            </TabPanel>
          </div>
        </div>
      ) : (
        <EmptyState title={tx("Статистика появится после первого матча")} text={tx("Убийства, ADR, KAST и F16 Rating считаются с наших серверов автоматически.")} />
      )}
      <RatingExplainer />
    </div>
  );
}

async function MvpBlock({ tournamentId, finished }: { tournamentId: string; finished: boolean }) {
  const tx = await getT();
  const mvp = await getTournamentMvp(tournamentId);
  if (!mvp) return null;
  const nick = mvp.player?.nickname ?? mvp.name;
  return (
    <section className={CARD_SECTION}>
      <SectionTitle>{finished ? tx("MVP турнира") : mvp.by === "swing" ? tx("Лидер по Swing") : tx("Лидер по рейтингу")}</SectionTitle>
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
            { l: tx("Карты"), v: String(mvp.maps) },
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
  const tx = await getT();
  const teams = new Map(matches.flatMap((m) => [m.team1, m.team2]).filter((x): x is NonNullable<typeof x> => !!x).map((x) => [x.id, x]));
  const hasStage = matches.some((m) => m.stage === "group" || m.stage === "swiss");
  const playoff = matches.filter((m) => (m.stage ?? "playoff") === "playoff");
  const swiss = t.bracket_type === "swiss" || t.bracket_type === "swiss_playoff";
  const groups = hasStage ? await getStandings(t) : [];
  return (
    <div className="space-y-5">
      {hasStage && (
        <div className={CARD_SECTION}>
          {swiss ? (
            <SwissView table={groups[0]?.table ?? []} matches={groups[0]?.matches ?? []} teams={teams} wins={t.swiss_wins} solo={t.format === "1v1"} />
          ) : (
            <GroupStageView groups={groups} teams={teams} advance={t.bracket_type === "groups_playoff" ? t.advance_per_group : undefined} solo={t.format === "1v1"} />
          )}
        </div>
      )}
      {playoff.length > 0 ? (
        <div className={cn(CARD_SECTION, "overflow-x-auto")}>
          {hasStage && <SectionTitle>{tx("Плей-офф")}</SectionTitle>}
          <BracketView matches={playoff} />
        </div>
      ) : (
        hasStage &&
        (t.bracket_type === "groups_playoff" || t.bracket_type === "swiss_playoff") && <EmptyState compact title={tx("Плей-офф")} text={tx("Сетка плей-офф появится автоматически после групповой стадии.")} />
      )}
    </div>
  );
}
