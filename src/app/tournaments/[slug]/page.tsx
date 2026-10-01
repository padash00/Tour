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
import { MapGraphic, TournamentCover, TournamentStatusPill } from "@/components/tournament-bits";
import {
  Avatar,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  FaceitLevel,
  IconArrow,
  IconBracket,
  IconUsers,
  KV,
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

  const base = `/tournaments/${t.slug}`;

  return (
    <>
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        {t.cover_url ? (
          <TournamentCover url={t.cover_url} strong />
        ) : (
          <MapGraphic className="absolute right-0 top-0 h-full opacity-30 hidden md:block" />
        )}
        <Container className="relative pt-14 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/tournaments" className="text-sm text-fg-3 hover:text-fg-2">
              ← Все турниры
            </Link>
            {isAdmin(player) && (
              <Link href={`/admin/tournaments/${t.id}`} className="text-sm text-accent hover:underline">
                Управление турниром →
              </Link>
            )}
          </div>
          {t.status === "draft" && (
            <div className="mt-4 rounded-xl border border-[#e3b46544] bg-warn-dim px-4 py-2.5 text-sm text-warn">
              Черновик — эту страницу видят только администраторы. Откройте регистрацию в управлении турниром, чтобы опубликовать.
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <TournamentStatusPill status={t.status} />
            <Pill>{t.game}</Pill>
            <Pill>{modeOf(t.format).title}</Pill>
            <Pill>{t.is_lan ? "LAN" : "Онлайн"}</Pill>
          </div>
          <h1 className="mt-5 text-4xl md:text-[56px] font-bold tracking-[-0.04em] leading-[1]">{t.name}</h1>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
            <HeroFact label="Старт" value={formatDateTime(t.starts_at)} />
            <HeroFact label="Призовой фонд" value={t.prize_pool ?? "—"} />
            <HeroFact label="Команды" value={`${approved.length} / ${t.max_teams}`} />
            <HeroFact label="Сетка" value={bracketLabel[t.bracket_type] ?? t.bracket_type} />
          </div>
        </Container>
        <Container className="relative">
          <Tabs
            active={tab}
            items={[
              { key: "overview", label: "Обзор", href: base },
              { key: "teams", label: `Команды · ${approved.length}`, href: `${base}?tab=teams` },
              { key: "bracket", label: "Сетка", href: `${base}?tab=bracket` },
              { key: "matches", label: "Матчи", href: `${base}?tab=matches` },
              { key: "stats", label: "Статистика", href: `${base}?tab=stats` },
              { key: "rules", label: "Правила", href: `${base}?tab=rules` },
            ]}
          />
        </Container>
      </section>

      <Container className="pt-10">
        <div className={tab === "bracket" && matches.length ? "space-y-8" : "grid lg:grid-cols-[1fr_360px] gap-8 items-start"}>
          <div className="min-w-0">
            {tab === "overview" && (
              <>
                {["live", "finished"].includes(t.status) && <MvpCard tournamentId={t.id} finished={t.status === "finished"} />}
                <Overview t={t} />
              </>
            )}
            {tab === "teams" && <TeamsTab approved={approved} pendingCount={pending.length} />}
            {tab === "bracket" &&
              (matches.length ? (
                <StagesTab t={t} matches={matches} />
              ) : (
                <EmptyState
                  icon={<IconBracket />}
                  title="Сетка появится после check-in"
                  description={`${bracketLabel[t.bracket_type] ?? t.bracket_type} на ${t.max_teams} команд. Посев будет опубликован после завершения check-in.`}
                />
              ))}
            {tab === "matches" && <MatchesTab matches={matches} />}
            {tab === "stats" && <StatsTab tournamentId={t.id} />}
            {tab === "rules" && (
              <Card className="p-6 sm:p-8">
                {t.rules ? (
                  <div className="prose-f16">{t.rules}</div>
                ) : (
                  <p className="text-fg-3">
                    Регламент турнира будет опубликован до начала регистрации. Общие правила — на странице{" "}
                    <Link href="/rules" className="text-accent hover:underline">
                      Правила
                    </Link>
                    .
                  </p>
                )}
              </Card>
            )}
          </div>

          <aside className={tab === "bracket" && matches.length ? "hidden" : "space-y-4 lg:sticky lg:top-24"}>
            <RegistrationBox
              t={t}
              loggedIn={!!player}
              team={myTeam}
              isCaptain={!!myTeam && myTeam.captain_id === player?.id}
              reg={myReg}
              approvedCount={approved.length}
            />
            <Card className="p-6">
              <div className="label mb-2">Расписание</div>
              <KV label="Регистрация с">{formatDateTime(t.registration_opens_at)}</KV>
              <KV label="Регистрация до">{formatDateTime(t.registration_closes_at)}</KV>
              <KV label="Check-in">
                {t.checkin_opens_at ? `${formatDateTime(t.checkin_opens_at)}` : "—"}
              </KV>
              <KV label="Старт">{formatDateTime(t.starts_at)}</KV>
            </Card>
            {(t.entry_fee || t.discord_url || t.contact) && (
              <Card className="p-6">
                <div className="label mb-2">Участникам</div>
                {t.entry_fee && <KV label="Взнос">{t.entry_fee}</KV>}
                {t.contact && <KV label="Организатор">{t.contact}</KV>}
                {t.discord_url && (
                  <a href={t.discord_url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "mt-4 w-full")}>
                    Discord турнира ↗
                  </a>
                )}
              </Card>
            )}
            <ShareButton title={t.name} />
          </aside>
        </div>
      </Container>
    </>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1.5 text-[15px] font-semibold">{value}</div>
    </div>
  );
}

const MEDALS = ["#e8c27a", "#c3ccd8", "#c98a5a"];

function Overview({ t }: { t: Tournament }) {
  return (
    <div className="space-y-8">
      {t.stream_url && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Трансляция</h2>
            <a href={t.stream_url} target="_blank" rel="noreferrer" className="text-sm text-fg-3 hover:text-fg">
              Открыть отдельно ↗
            </a>
          </div>
          <StreamEmbed url={t.stream_url} />
        </section>
      )}

      {t.description && (
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">О турнире</h2>
          <div className="prose-f16">{t.description}</div>
        </section>
      )}

      <section className="grid sm:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="label mb-2">Формат</div>
          <KV label="Игра">{t.game}</KV>
          <KV label="Режим">{modeOf(t.format).title}</KV>
          <KV label="Сетка">{bracketLabel[t.bracket_type] ?? t.bracket_type}</KV>
          <KV label="Матчи">{t.match_format ?? "—"}</KV>
          <KV label="Площадка">{t.is_lan ? `LAN${t.location ? ` · ${t.location}` : ""}` : (t.location ?? "Онлайн")}</KV>
          <KV label="Серверы">{t.is_lan ? "Серверы F16, локальная сеть" : "Серверы F16"}</KV>
        </Card>
        <Card className="p-6">
          <div className="label mb-2">Призовой фонд</div>
          <div className="text-3xl font-bold tracking-tight py-2">{t.prize_pool ?? "Будет объявлен"}</div>
          {t.prize_distribution.length > 0 && (
            <div className="mt-3 space-y-2">
              {t.prize_distribution.map((p, i) => (
                <div key={p.place} className="flex items-center gap-3 rounded-lg border border-line bg-bg-2 px-3 py-2.5">
                  <span
                    className="grid place-items-center size-7 rounded-full text-[12px] font-bold num"
                    style={{ background: `${MEDALS[i] ?? "#6b788c"}22`, color: MEDALS[i] ?? "#a7b2c3" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-fg-2 flex-1">{p.place}</span>
                  <span className="font-semibold">{p.prize}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">Правила игры</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Стороны", value: t.knife_round ? "Ножевой раунд" : "Фиксированные" },
            { label: "Овертайм", value: t.overtime ? "MR3 при 12:12" : "Нет" },
            { label: "Тактические паузы", value: `${t.timeouts_per_team} × ${t.timeout_seconds} с` },
            { label: "Технические паузы", value: `${t.tech_pauses} × ${Math.round(t.tech_pause_seconds / 60)} мин` },
          ].map((x) => (
            <Card key={x.label} className="p-4">
              <div className="label">{x.label}</div>
              <div className="mt-1.5 text-[15px] font-semibold">{x.value}</div>
            </Card>
          ))}
        </div>
      </section>

      {t.sponsors?.length > 0 && (
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Партнёры</h2>
          <div className="flex flex-wrap gap-2">
            {t.sponsors.map((sp) =>
              sp.url ? (
                <a
                  key={sp.name}
                  href={sp.url}
                  target="_blank"
                  rel="noreferrer"
                  className="h-12 px-5 inline-flex items-center rounded-xl border border-line bg-surface font-semibold hover:border-line-strong"
                >
                  {sp.name}
                </a>
              ) : (
                <span key={sp.name} className="h-12 px-5 inline-flex items-center rounded-xl border border-line bg-surface font-semibold">
                  {sp.name}
                </span>
              ),
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">Маппул</h2>
        <div className="flex flex-wrap gap-2">
          {t.map_pool.map((m) => (
            <span key={m} className="h-9 px-4 inline-flex items-center rounded-lg border border-line bg-surface text-sm font-medium">
              {mapName(m)}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">Требования к участникам</h2>
        <Card className="p-6">
          {t.requirements ? (
            <div className="prose-f16">{t.requirements}</div>
          ) : (
            <ul className="space-y-2.5 text-sm text-fg-2">
              <li>— Вход на платформу через Steam у каждого игрока</li>
              <li>
                — {modeOf(t.format).title}: в основе {mainPlayersLabel(modeOf(t.format).size)}
                {modeOf(t.format).subs ? `, до ${modeOf(t.format).subs} запасн.` : ""}
              </li>
              <li>— Один игрок — одна команда в рамках турнира</li>
              <li>— Check-in капитаном в отведённое время</li>
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function TeamsTab({
  approved,
  pendingCount,
}: {
  approved: Awaited<ReturnType<typeof getTournamentRegistrations>>;
  pendingCount: number;
}) {
  if (approved.length === 0) {
    return (
      <EmptyState
        icon={<IconUsers />}
        title="Пока нет одобренных команд"
        description={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "заявка ожидает" : "заявки ожидают"} подтверждения администратора.`
            : "Станьте первой командой, подавшей заявку."
        }
      />
    );
  }
  return (
    <div className="grid gap-3">
      {pendingCount > 0 && (
        <p className="text-sm text-fg-3">Ещё на рассмотрении: {pendingCount}</p>
      )}
      {approved.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex items-center gap-4">
            <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={44} />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${r.team.tag}`} className="font-semibold hover:text-accent">
                {r.team.name}
              </Link>
              <div className="text-xs text-fg-3 mt-0.5">
                {r.team.tag}
                {r.team.region ? ` · ${r.team.region}` : ""}
              </div>
            </div>
            {r.checked_in_at && <Pill tone="ok">Ready</Pill>}
            {r.seed && <span className="num text-sm text-fg-3">#{r.seed}</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.roster
              .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
              .map((rp) => (
                <Link
                  key={rp.id}
                  href={`/players/${rp.player.steam_id}`}
                  className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-lg border border-line bg-bg-2 hover:border-line-strong text-sm"
                >
                  <Avatar src={rp.player.avatar_url} name={rp.player.nickname} size={26} />
                  <span className="max-w-[120px] truncate">{rp.player.nickname}</span>
                  <FaceitLevel level={rp.player.faceit_level} />
                  {rp.role === "sub" && <span className="text-[10px] uppercase text-fg-3">sub</span>}
                </Link>
              ))}
          </div>
        </Card>
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

  let body: React.ReactNode;
  if (active && reg) {
    body = (
      <>
        <div className="flex items-center gap-2">
          <Pill tone={reg.status === "approved" ? "ok" : "warn"} dot>
            {registrationStatusLabel[reg.status]}
          </Pill>
          {reg.checked_in_at && <Pill tone="ok">Check-in ✓</Pill>}
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
        <p className="text-sm text-fg-2">
          Открыто мест: <span className="text-fg font-semibold">{Math.max(0, t.max_teams - approvedCount)}</span> из{" "}
          {t.max_teams}
        </p>
        {reg?.status === "rejected" && (
          <div className="mt-4">
            <Notice tone="danger">Предыдущая заявка отклонена{reg.note ? `: ${reg.note}` : "."}</Notice>
          </div>
        )}
        <ButtonLink
          href={!loggedIn ? `/login?next=${base}/register` : !team && t.format !== "1v1" ? "/team/create" : `${base}/register`}
          className="mt-5 w-full"
          size="lg"
        >
          {t.format === "1v1"
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
        {t.status === "finished"
          ? "Турнир завершён."
          : t.status === "cancelled"
            ? "Турнир отменён."
            : "Регистрация на турнир закрыта."}
      </p>
    );
  }

  return (
    <Card className="p-6">
      <div className="label mb-4">Участие</div>
      {body}
    </Card>
  );
}

function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyState title="Матчей пока нет" description="Расписание матчей появится вместе с сеткой турнира." />;
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
    <div className="space-y-8">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <div className="label mb-3">{g.title}</div>
            <div className="grid gap-2">
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
    <div className="space-y-6">
      {rows.length ? (
        <PlayerStatsTable rows={rows} />
      ) : (
        <EmptyState title="Статистика появится после первых сыгранных карт" />
      )}
      <RatingExplainer />
    </div>
  );
}

async function MvpCard({ tournamentId, finished }: { tournamentId: string; finished: boolean }) {
  const mvp = await getTournamentMvp(tournamentId);
  if (!mvp) return null;
  const nick = mvp.player?.nickname ?? mvp.name;
  return (
    <Card className="p-6 mb-8 relative overflow-hidden">
      <div className="absolute inset-0 atmos opacity-50" />
      <div className="relative flex flex-wrap items-center gap-5">
        <Avatar src={mvp.player?.avatar_url} name={nick} size={64} />
        <div className="flex-1 min-w-0">
          <div className="label text-warm">{finished ? "MVP турнира" : mvp.by === "swing" ? "Лидер по Swing" : "Лидер по рейтингу"}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight truncate">
            {mvp.player ? (
              <Link href={`/players/${mvp.player.steam_id}`} className="hover:text-accent">
                {nick}
              </Link>
            ) : (
              nick
            )}
          </div>
          <div className="text-sm text-fg-3">{mvp.team?.name ?? ""}</div>
        </div>
        <div className="flex gap-6 text-center">
          <div><div className="label">Swing</div><div className="mt-1 text-xl font-bold num text-ok">{fmt.swing(mvp.swing)}</div></div>
          <div><div className="label">Rating</div><div className="mt-1 text-xl font-bold num">{fmt.r(mvp.rating)}</div></div>
          <div><div className="label">ADR</div><div className="mt-1 text-xl font-bold num">{fmt.d1(mvp.adr)}</div></div>
          <div><div className="label">K/D</div><div className="mt-1 text-xl font-bold num">{mvp.kd.toFixed(2)}</div></div>
          <div><div className="label">Карты</div><div className="mt-1 text-xl font-bold num">{mvp.maps}</div></div>
        </div>
      </div>
    </Card>
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
    <div className="space-y-12">
      {hasStage &&
        (swiss ? (
          <SwissView table={groups[0]?.table ?? []} matches={groups[0]?.matches ?? []} teams={teams} wins={t.swiss_wins} />
        ) : (
          <GroupStageView groups={groups} teams={teams} advance={t.bracket_type === "groups_playoff" ? t.advance_per_group : undefined} />
        ))}
      {playoff.length > 0 ? (
        <div>
          {hasStage && <h2 className="mb-6 text-xl font-bold tracking-tight">Плей-офф</h2>}
          <BracketView matches={playoff} />
        </div>
      ) : (
        hasStage &&
        (t.bracket_type === "groups_playoff" || t.bracket_type === "swiss_playoff") && (
          <EmptyState compact title="Плей-офф" description="Сетка плей-офф появится автоматически, когда закончится групповая стадия." />
        )
      )}
    </div>
  );
}
