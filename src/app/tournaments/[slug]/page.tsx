import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { bracketLabel, formatDate, formatDateTime, mapName, registrationStatusLabel } from "@/lib/format";
import type { Registration, Team, Tournament } from "@/lib/types";
import { getStandings, getTournamentMatches } from "@/lib/matches";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { getPlayerLeaderboard, getTournamentMvp } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer, fmt } from "@/components/stats-table";
import { ShareButton, StreamEmbed } from "@/components/stream";
import { BracketView } from "@/components/bracket-view";
import { GroupStageView, SwissView } from "@/components/stage-view";
import { MatchRow, matchStage, visibleMatches } from "@/components/match-bits";
import { TournamentCover, TournamentStatusPill } from "@/components/tournament-bits";
import { MapTile } from "@/components/competition/map-tile";
import {
  Avatar,
  ButtonLink,
  Container,
  EmptyState,
  FaceitLevel,
  IconArrow,
  KV,
  Meta,
  Notice,
  Pill,
  Tabs,
  TeamLogo,
  buttonClass,
} from "@/components/ui";

export async function generateMetadata(props: PageProps<"/tournaments/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  return { title: t?.name ?? "Турнир" };
}

const TABS = ["overview", "teams", "bracket", "matches", "stats", "rules"] as const;
type Tab = (typeof TABS)[number];

export default async function TournamentPage(props: PageProps<"/tournaments/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const player = await getCurrentPlayer();
  // черновик видит только админ — для предпросмотра
  const t = await getTournamentBySlug(slug, isAdmin(player));
  if (!t) notFound();

  const [regs, matches] = await Promise.all([getTournamentRegistrations(t.id), getTournamentMatches(t.id)]);
  const approved = regs.filter((r) => r.status === "approved");
  const pending = regs.filter((r) => r.status === "pending");
  const myTeam = player ? await getEntrantTeam(player, t) : null;
  const myReg = myTeam ? await getRegistration(t.id, myTeam.id) : null;
  const isCaptain = !!myTeam && myTeam.captain_id === player?.id;
  const solo = t.format === "1v1";

  const base = `/tournaments/${t.slug}`;
  const wide = tab !== "overview";

  return (
    <>
      <section className="relative overflow-hidden">
        {t.cover_url && <TournamentCover url={t.cover_url} strong />}
        <Container className="relative pt-10 pb-10 md:pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/tournaments" className="text-fg-3 hover:text-fg-2">
              ← Турниры
            </Link>
            {isAdmin(player) && (
              <Link href={`/admin/tournaments/${t.id}`} className="text-fg-3 hover:text-fg">
                Control →
              </Link>
            )}
          </div>
          {t.status === "draft" && (
            <div className="mt-6 max-w-2xl">
              <Notice tone="warn">Черновик — страницу видят только администраторы. Откройте регистрацию, чтобы опубликовать.</Notice>
            </div>
          )}
          <div className="mt-12 md:mt-16 grid lg:grid-cols-[1fr_auto] gap-8 items-end">
            <div>
              <TournamentStatusPill status={t.status} />
              <h1 className="mt-4 text-[40px] md:text-[64px] font-bold tracking-[-0.045em] leading-[0.98]">{t.name}</h1>
              <Meta
                className="mt-5 text-[15px]"
                items={[
                  formatDate(t.starts_at),
                  t.game,
                  modeOf(t.format).title,
                  t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"),
                ]}
              />
            </div>
            <HeroCta t={t} loggedIn={!!player} team={myTeam} isCaptain={isCaptain} reg={myReg} />
          </div>
        </Container>
        <Container className="relative">
          <Tabs
            active={tab}
            items={[
              { key: "overview", label: "Обзор", href: base },
              { key: "teams", label: solo ? "Участники" : "Команды", href: `${base}?tab=teams` },
              { key: "bracket", label: "Сетка", href: `${base}?tab=bracket` },
              { key: "matches", label: "Матчи", href: `${base}?tab=matches` },
              { key: "stats", label: "Статистика", href: `${base}?tab=stats` },
              { key: "rules", label: "Правила", href: `${base}?tab=rules` },
            ]}
          />
        </Container>
      </section>

      <Container className="pt-12">
        <div className={wide ? "" : "grid lg:grid-cols-[minmax(0,1fr)_340px] gap-x-20 gap-y-12 items-start"}>
          <div className="min-w-0">
            {tab === "overview" && (
              <>
                {["live", "finished"].includes(t.status) && <MvpBlock tournamentId={t.id} finished={t.status === "finished"} />}
                <Overview t={t} />
              </>
            )}
            {tab === "teams" && <TeamsTab approved={approved} pendingCount={pending.length} solo={solo} />}
            {tab === "bracket" &&
              (matches.length ? (
                <StagesTab t={t} matches={matches} />
              ) : (
                <EmptyState
                  title="Сетка появится после check-in"
                  description={`${bracketLabel[t.bracket_type] ?? t.bracket_type} на ${t.max_teams} ${solo ? "участников" : "команд"}. Посев будет опубликован после check-in.`}
                />
              ))}
            {tab === "matches" && <MatchesTab matches={matches} />}
            {tab === "stats" && <StatsTab tournamentId={t.id} />}
            {tab === "rules" && (
              <div className="max-w-[780px]">
                {t.rules ? (
                  <div className="prose-f16">{t.rules}</div>
                ) : (
                  <EmptyState
                    title="Регламент будет опубликован до начала регистрации"
                    action={
                      <Link href="/rules" className="text-accent hover:text-accent-strong text-sm">
                        Общие правила платформы →
                      </Link>
                    }
                  />
                )}
              </div>
            )}
          </div>

          {!wide && (
            <aside className="lg:sticky lg:top-24 space-y-10">
              <RegistrationBox t={t} loggedIn={!!player} team={myTeam} isCaptain={isCaptain} reg={myReg} approvedCount={approved.length} />
              <div>
                <h3 className="text-[15px] font-semibold mb-2">Даты</h3>
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
                    <h3 className="text-[15px] font-semibold mb-2">Призовой фонд</h3>
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
                    <a href={t.discord_url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "mt-4 w-full")}>
                      Discord турнира ↗
                    </a>
                  )}
                </div>
              )}
              <ShareButton title={t.name} />
            </aside>
          )}
        </div>
      </Container>
    </>
  );
}

/** Одна главная кнопка в шапке турнира — по состоянию участия */
function HeroCta({
  t,
  loggedIn,
  team,
  isCaptain,
  reg,
}: {
  t: Tournament;
  loggedIn: boolean;
  team: Team | null;
  isCaptain: boolean;
  reg: Registration | null;
}) {
  const base = `/tournaments/${t.slug}`;
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  if (t.status === "checkin" && reg?.status === "approved" && !reg.checked_in_at) {
    return (
      <ButtonLink href={`${base}/checkin`} size="lg">
        Пройти check-in
      </ButtonLink>
    );
  }
  if (t.status !== "registration" || active) return null;
  const solo = t.format === "1v1";
  return (
    <ButtonLink href={!loggedIn ? `/login?next=${base}/register` : !team && !solo ? "/team/create" : `${base}/register`} size="lg">
      {solo ? "Участвовать" : !team && loggedIn ? "Создать команду" : isCaptain || !loggedIn ? "Зарегистрировать команду" : "Заявку подаёт капитан"}
    </ButtonLink>
  );
}

function Overview({ t }: { t: Tournament }) {
  const mode = modeOf(t.format);
  return (
    <div className="space-y-16">
      {t.stream_url && (
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[26px] font-bold tracking-[-0.025em]">Трансляция</h2>
            <a href={t.stream_url} target="_blank" rel="noreferrer" className="text-sm text-fg-3 hover:text-fg">
              Открыть отдельно ↗
            </a>
          </div>
          <StreamEmbed url={t.stream_url} />
        </section>
      )}

      {t.description && (
        <section>
          <h2 className="text-[26px] font-bold tracking-[-0.025em] mb-5">О турнире</h2>
          <div className="prose-f16 max-w-[720px]">{t.description}</div>
        </section>
      )}

      <section>
        <h2 className="text-[26px] font-bold tracking-[-0.025em] mb-5">Формат</h2>
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
        <h2 className="text-[26px] font-bold tracking-[-0.025em] mb-5">Маппул</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {t.map_pool.map((m) => (
            <MapTile key={m} map={m} />
          ))}
        </div>
        <span className="sr-only">{t.map_pool.map(mapName).join(", ")}</span>
      </section>

      <section>
        <h2 className="text-[26px] font-bold tracking-[-0.025em] mb-5">Требования</h2>
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
          <h2 className="text-[15px] font-semibold text-fg-2 mb-4">Партнёры</h2>
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
      <EmptyState
        title={solo ? "Пока нет участников" : "Пока нет одобренных команд"}
        description={
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
        <div className="text-sm text-fg-3">
          {approved.length} {solo ? "участников" : "команд"}
          {pendingCount > 0 && ` · ещё на рассмотрении: ${pendingCount}`}
        </div>
      </div>
      {approved.map((r) => (
        <div key={r.id} className="py-5 border-b border-white/[0.05] last:border-0">
          <div className="flex items-center gap-4">
            {r.seed && <span className="num text-sm text-fg-3 w-6">{r.seed}</span>}
            <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={40} />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${r.team.tag}`} className="text-[17px] font-semibold hover:text-accent-strong">
                {r.team.name}
              </Link>
              <div className="text-[13px] text-fg-3">
                {r.team.tag}
                {r.team.region ? ` · ${r.team.region}` : ""}
              </div>
            </div>
            {r.checked_in_at && <Pill tone="ok">Check-in</Pill>}
          </div>
          {!solo && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:pl-[56px]">
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
  );
}

function RegistrationBox({
  t,
  loggedIn,
  team,
  isCaptain,
  reg,
  approvedCount,
}: {
  t: Tournament;
  loggedIn: boolean;
  team: Team | null;
  isCaptain: boolean;
  reg: Registration | null;
  approvedCount: number;
}) {
  const base = `/tournaments/${t.slug}`;
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  const solo = t.format === "1v1";

  let body: React.ReactNode;
  if (active && reg) {
    body = (
      <>
        <div className="flex items-center gap-4">
          <Pill tone={reg.status === "approved" ? "ok" : "warn"}>{registrationStatusLabel[reg.status]}</Pill>
          {reg.checked_in_at && <Pill tone="ok">Check-in пройден</Pill>}
        </div>
        <p className="mt-3 text-sm text-fg-2">
          {team?.name} {reg.status === "approved" ? "участвует в турнире." : "ждёт решения администратора."}
        </p>
        {t.status === "checkin" && reg.status === "approved" && !reg.checked_in_at && (
          <ButtonLink href={`${base}/checkin`} className="mt-5 w-full">
            Пройти check-in
          </ButtonLink>
        )}
        {isCaptain && t.status === "registration" && (
          <ButtonLink href={`${base}/register`} variant="secondary" className="mt-5 w-full">
            Управлять заявкой
          </ButtonLink>
        )}
      </>
    );
  } else if (t.status === "registration") {
    body = (
      <>
        <div className="flex items-baseline gap-2">
          <span className="num text-[26px] font-semibold">{Math.max(0, t.max_teams - approvedCount)}</span>
          <span className="text-sm text-fg-3">из {t.max_teams} мест свободно</span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-ok/70" style={{ width: `${Math.min(100, (approvedCount / Math.max(1, t.max_teams)) * 100)}%` }} />
        </div>
        {t.registration_closes_at && <div className="mt-3 text-[13px] text-fg-3">до {formatDateTime(t.registration_closes_at)}</div>}
        {reg?.status === "rejected" && (
          <div className="mt-4">
            <Notice tone="danger">Предыдущая заявка отклонена{reg.note ? `: ${reg.note}` : "."}</Notice>
          </div>
        )}
        <ButtonLink
          href={!loggedIn ? `/login?next=${base}/register` : !team && !solo ? "/team/create" : `${base}/register`}
          className="mt-5 w-full"
        >
          {solo
            ? loggedIn
              ? "Участвовать"
              : "Войти и участвовать"
            : !loggedIn
              ? "Войти и зарегистрироваться"
              : !team
                ? "Сначала создайте команду"
                : isCaptain
                  ? "Зарегистрировать команду"
                  : "Заявку подаёт капитан"}
          <IconArrow />
        </ButtonLink>
      </>
    );
  } else {
    body = (
      <p className="text-sm text-fg-2">
        {t.status === "finished" ? "Турнир завершён." : t.status === "cancelled" ? "Турнир отменён." : "Регистрация закрыта."}
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-surface p-6">
      <h3 className="text-[15px] font-semibold mb-4">Регистрация</h3>
      {body}
    </div>
  );
}

function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyState title="Матчей пока нет" description="Расписание появится вместе с сеткой турнира." />;
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
    <div className="space-y-12 max-w-[960px]">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <h3 className="text-[15px] font-semibold text-fg-2 mb-3">{g.title}</h3>
            <div className="-mx-4">
              {g.items.map((m) => (
                <MatchRow key={m.id} m={m} stage={matchStage(m, matches)} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

async function StatsTab({ tournamentId }: { tournamentId: string }) {
  const rows = await getPlayerLeaderboard(tournamentId);
  return (
    <div className="space-y-10">
      {rows.length ? <PlayerStatsTable rows={rows} /> : <EmptyState title="Статистика появится после первого матча" />}
      <RatingExplainer />
    </div>
  );
}

async function MvpBlock({ tournamentId, finished }: { tournamentId: string; finished: boolean }) {
  const mvp = await getTournamentMvp(tournamentId);
  if (!mvp) return null;
  const nick = mvp.player?.nickname ?? mvp.name;
  return (
    <section className="mb-16 pb-12 border-b border-line">
      <div className="text-sm text-fg-3">{finished ? "MVP турнира" : mvp.by === "swing" ? "Лидер по Swing" : "Лидер по рейтингу"}</div>
      <div className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar src={mvp.player?.avatar_url} name={nick} size={56} />
          <div className="min-w-0">
            <div className="text-[28px] font-bold tracking-[-0.03em] truncate">
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
          {hasStage && <h2 className="mb-8 text-[26px] font-bold tracking-[-0.025em]">Плей-офф</h2>}
          <BracketView matches={playoff} />
        </div>
      ) : (
        hasStage &&
        (t.bracket_type === "groups_playoff" || t.bracket_type === "swiss_playoff") && (
          <EmptyState compact title="Плей-офф" description="Сетка плей-офф появится автоматически после групповой стадии." />
        )
      )}
    </div>
  );
}
