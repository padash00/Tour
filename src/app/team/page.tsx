import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, Inbox, Lock, Trophy, Users } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { requirePlayer } from "@/lib/auth";
import { getPlayerApplications, getTeamApplications } from "@/lib/applications";
import { getCoach, getCoachedTeams, getPlayerInvites, getTeamInvites } from "@/lib/invites";
import { MAX_MAIN, MAX_SUBS, averageElo, getActiveMembership, getLockingTournament, getTeamMembers, getTeamRegistrations, listPublicTournaments } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { siteOrigin } from "@/lib/origin";
import { getTeamMatches } from "@/lib/matches";
import { MatchListRow } from "@/components/match-row";
import { InviteButton } from "@/components/team/invite";
import { Roster, type RosterMember } from "@/components/team/roster";
import { TeamHeader } from "@/components/team/team-header";
import { RosterStrip } from "@/components/team/roster-strip";
import { HelpHint } from "@/components/help-hint";
import { ApplicationsInbox } from "@/components/team/applications";
import { MyApplications } from "@/components/team/my-applications";
import { CoachedTeams, MyInvites } from "@/components/team/my-invites";
import { InviteByNick } from "@/components/team/invite-by-nick";
import { CoachSlot, PendingInvites } from "@/components/team/staff";
import {
  Button,
  Callout,
  Container,
  CriticalSurface,
  EmptyState,
  Eyebrow,
  FeatureSurface,
  PageTitle,
  RowList,
  Section,
  Stack,
  Status,
  registrationStatus,
  tournamentStatus,
} from "@/components/ds";

export const metadata: Metadata = { title: "Моя команда", robots: { index: false } };

type Tab = "overview" | "roster" | "matches" | "tournaments" | "applications";

export default async function MyTeamPage(props: PageProps<"/team">) {
  const player = await requirePlayer("/team");
  const sp = await props.searchParams;
  const membership = await getActiveMembership(player.id);

  if (!membership) {
    const [applications, invites, coached] = await Promise.all([getPlayerApplications(player.id), getPlayerInvites(player.id), getCoachedTeams(player.id)]);
    return (
      <Container width="read" className="pt-12 sm:pt-16">
        <PageTitle>У вас пока нет команды</PageTitle>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
          Создайте команду — вы станете капитаном и получите ссылку-приглашение. Или найдите команду, которой нужен игрок.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/team/create" size="lg">
            Создать команду
          </Button>
          <Button href="/find" size="lg" variant="secondary">
            Найти команду
          </Button>
        </div>
        <MyInvites items={invites} inTeam={false} className="mt-10" />
        <CoachedTeams teams={coached} className="mt-10" />
        {applications.length > 0 && <MyApplications items={applications} className="mt-10" />}
        <HelpHint topics={["create-team", "join-team"]} className="mt-10" />
      </Container>
    );
  }

  const tab: Tab = (["roster", "matches", "tournaments", "applications"] as const).find((t) => t === sp.tab) ?? "overview";
  const created = sp.created === "1";
  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, regs, locked, origin, matches, applications, tournaments, teamInvites, myInvites, coached, coach] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getLockingTournament(team.id),
    siteOrigin(),
    getTeamMatches(team.id),
    isCaptain ? getTeamApplications(team.id) : Promise.resolve(null),
    listPublicTournaments(),
    getTeamInvites(team.id),
    getPlayerInvites(player.id),
    getCoachedTeams(player.id),
    getCoach(team),
  ]);
  const pendingInvites = teamInvites.map((i) => ({ id: i.id, role: i.role, date: formatDate(i.created_at), player: i.player }));
  const order = { live: 0, ready: 1, veto: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  const active = matches.filter((m) => !["finished", "cancelled"].includes(m.status)).sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);
  const played = matches.filter((m) => m.status === "finished").reverse();
  const next = active.find((m) => m.team1_id && m.team2_id) ?? null;
  const needsCheckin = regs.find((r) => r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at);
  const mains = members.filter((m) => m.role !== "substitute").length;
  const ready = mains >= MAX_MAIN;
  const freeSlots = MAX_MAIN + MAX_SUBS - members.length;
  const captain = members.find((m) => m.role === "captain");
  const current = regs.find((r) => ["pending", "approved"].includes(r.status) && !["finished", "cancelled"].includes(r.tournament.status));
  const inviteUrl = `${origin}/join/${team.invite_code}`;
  const roster: RosterMember[] = members.map((m) => ({ id: m.id, role: m.role, player: m.player }));
  const openTournament = tournaments.find((t) => t.status === "registration");

  // главное действие для команды прямо сейчас — одно, с кнопкой
  const step: { title: string; text: string; action?: React.ReactNode } = current
    ? current.status === "approved"
      ? {
          title: `Вы в турнире «${current.tournament.name}»`,
          text: `Старт ${formatDateTime(current.tournament.starts_at)}. Перед стартом капитан проходит check-in.`,
          action: <Button href={`/tournaments/${current.tournament.slug}`} variant="secondary" size="sm" iconRight={<ArrowRight />}>Открыть турнир</Button>,
        }
      : {
          title: `Заявка на «${current.tournament.name}» на рассмотрении`,
          text: "Решение администратора придёт уведомлением всей команде.",
          action: <Button href={`/tournaments/${current.tournament.slug}`} variant="secondary" size="sm" iconRight={<ArrowRight />}>Открыть турнир</Button>,
        }
    : !ready
      ? isCaptain && !locked
        ? {
            title: `Наберите основу: не хватает ${MAX_MAIN - mains}`,
            text: "Найдите игроков по нику, отправьте ссылку или примите заявки тех, кто хочет в команду.",
            action: (
              <>
                <InviteByNick size="sm" variant="primary" />
                <InviteButton url={inviteUrl} freeSlots={freeSlots} size="sm" variant="secondary" label="Ссылка" />
                {applications && applications.length > 0 ? (
                  <Button href="/team?tab=applications" variant="secondary" size="sm">
                    Заявки · {applications.length}
                  </Button>
                ) : null}
              </>
            ),
          }
        : { title: "Капитан набирает состав", text: `В основе ${mains} из ${MAX_MAIN}. Знаете игрока — попросите капитана отправить ему приглашение.` }
      : openTournament
        ? {
            title: "Состав готов — можно в турнир",
            text: isCaptain ? `Открыта регистрация на «${openTournament.name}».` : `Открыта регистрация на «${openTournament.name}». Заявку подаёт капитан.`,
            action: <Button href={isCaptain ? `/tournaments/${openTournament.slug}/register` : `/tournaments/${openTournament.slug}`} size="sm" iconRight={<ArrowRight />}>{isCaptain ? "Подать заявку" : "Открыть турнир"}</Button>,
          }
        : {
            title: "Состав готов",
            text: "Открытых турниров сейчас нет. Как только откроется регистрация, здесь появится кнопка заявки.",
            action: <Button href="/tournaments" variant="secondary" size="sm">Все турниры</Button>,
          };

  return (
    <>
      <LiveRefresh watch="matches" intervalMs={5000} />
      <Container>
        <TeamHeader
          team={team}
          isCaptain={isCaptain}
          ready={ready}
          mains={mains}
          maxMain={MAX_MAIN}
          active="tabs"
          applications={applications?.length}
          actions={isCaptain && !locked ? <InviteButton url={inviteUrl} freeSlots={freeSlots} variant={created ? "secondary" : "primary"} /> : undefined}
        />

        <div className="pt-10">
          {locked && (
            <Callout tone="warn" title={`Состав заблокирован турниром «${locked.name}»`} className="mb-8">
              Изменить состав может только администратор турнира.
            </Callout>
          )}

          {tab === "overview" && (
            <Stack>
              <MyInvites items={myInvites} inTeam />
              <CoachedTeams teams={coached} />
              {created && (
                <CriticalSurface tone="ok">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Eyebrow tone="ok">Команда создана</Eyebrow>
                      <div className="mt-2 text-heading text-fg">{team.name}</div>
                      <p className="mt-1 text-[14px] text-fg-2">
                        Следующий шаг — соберите состав: {MAX_MAIN} основных, до {MAX_SUBS} запасных и, если нужен, тренер. Найдите игроков по нику или отправьте ссылку.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <InviteByNick size="lg" variant="primary" />
                      <InviteButton url={inviteUrl} freeSlots={freeSlots} size="lg" variant="secondary" label="Ссылка-приглашение" />
                    </div>
                  </div>
                </CriticalSurface>
              )}

              {isCaptain && applications && applications.length > 0 && tab === "overview" && (
                <Callout
                  tone="info"
                  title={`Новые заявки на вступление: ${applications.length}`}
                  action={<Button href="/team?tab=applications" size="sm" variant="secondary">Посмотреть</Button>}
                >
                  Игроки хотят в команду — примите или отклоните заявки.
                </Callout>
              )}

              {needsCheckin && isCaptain && (
                <CriticalSurface tone="warn">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Eyebrow tone="warn">Check-in открыт</Eyebrow>
                      <div className="mt-2 text-heading text-fg">{needsCheckin.tournament.name}</div>
                      <p className="mt-1 text-[14px] text-fg-2">Подтвердите участие команды, иначе место займёт другая.</p>
                    </div>
                    <Button href={`/tournaments/${needsCheckin.tournament.slug}/checkin`} size="lg" iconRight={<ArrowRight />}>
                      Пройти check-in
                    </Button>
                  </div>
                </CriticalSurface>
              )}

              <FeatureSurface>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Eyebrow>Состав</Eyebrow>
                      <Status info={ready ? { label: "Основа собрана", tone: "ok" } : { label: `Нужно ещё ${MAX_MAIN - mains}`, tone: "warn" }} size="sm" />
                    </div>
                    <RosterStrip members={members} coach={coach} maxMain={MAX_MAIN} maxSubs={MAX_SUBS} className="mt-4" />
                    <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line-subtle pt-4 text-meta">
                      <div className="min-w-0">
                        <dt className="text-fg-3">Капитан</dt>
                        <dd className="mt-0.5 truncate font-medium text-fg">{captain?.player.nickname ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">Средний ELO</dt>
                        <dd className="num mt-0.5 font-medium text-fg">{averageElo(members.filter((m) => m.role !== "substitute")) ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">Создана</dt>
                        <dd className="mt-0.5 font-medium text-fg">{formatDate(team.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-surface border border-line-subtle bg-white/[0.02] p-4 sm:p-5">
                    <Eyebrow tone="accent">Следующий шаг</Eyebrow>
                    <div className="mt-2 text-title text-fg">{step.title}</div>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{step.text}</p>
                    {step.action && <div className="mt-4 flex flex-wrap gap-2">{step.action}</div>}
                  </div>
                </div>
              </FeatureSurface>

              {next && (
                <Section title="Ближайший матч">
                  <RowList>
                    <MatchListRow m={next} highlight={team.id} meta={`${next.tournament.name} · BO${next.best_of}${next.scheduled_at ? ` · ${formatDateTime(next.scheduled_at)}` : ""}`} />
                  </RowList>
                </Section>
              )}

              <Section title="Последние результаты" action={played.length > 3 ? <Link href="/team?tab=matches" className="text-meta font-medium text-accent hover:text-accent-strong">Все матчи →</Link> : undefined}>
                {played.length ? (
                  <RowList>
                    {played.slice(0, 3).map((m) => (
                      <MatchListRow key={m.id} m={m} highlight={team.id} meta={m.tournament.name} />
                    ))}
                  </RowList>
                ) : (
                  <EmptyState
                    compact
                    icon={<Gamepad2 />}
                    title="Сыгранных матчей пока нет"
                    text="Результаты появятся после первого турнира."
                    next={openTournament ? `регистрация на «${openTournament.name}»` : undefined}
                    action={<Button href={openTournament ? `/tournaments/${openTournament.slug}` : "/tournaments"} variant="secondary" size="sm">{openTournament ? "Открыть турнир" : "Смотреть турниры"}</Button>}
                  />
                )}
              </Section>
            </Stack>
          )}

          {tab === "roster" && (
            <Section
              title="Состав"
              description={isCaptain ? "Основа — до 5 игроков, запас — до 2. Действия с игроком — в меню «⋯»." : "Составом управляет капитан."}
              action={
                isCaptain && !locked && freeSlots > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <InviteByNick size="sm" />
                    <InviteButton url={inviteUrl} freeSlots={freeSlots} variant="secondary" size="sm" label="Ссылка" />
                  </div>
                ) : undefined
              }
            >
              <Roster members={roster} isCaptain={isCaptain} locked={locked?.name ?? null} maxMain={MAX_MAIN} maxSubs={MAX_SUBS} />
              <div className="mt-8 grid gap-8 lg:grid-cols-2">
                <CoachSlot coach={coach} invited={pendingInvites.find((i) => i.role === "coach") ?? null} isCaptain={isCaptain} />
                <PendingInvites items={pendingInvites.filter((i) => i.role === "player")} isCaptain={isCaptain} />
              </div>
              <HelpHint topics={isCaptain ? ["find-players", "team-coach", "manage-roster", "team-applications"] : ["leave-team", "team-coach"]} className="mt-6" />
            </Section>
          )}

          {tab === "applications" && applications && (
            <Section
              title="Заявки на вступление"
              description="Игроки, которые хотят в команду. Принятый игрок попадает в основу, если там есть место, иначе — в запас."
            >
              {!team.accepts_applications && (
                <Callout tone="warn" title="Приём заявок закрыт" className="mb-4" action={<Button href="/team/settings" size="sm" variant="secondary">Открыть в настройках</Button>}>
                  Новые заявки не приходят. Уже поданные можно рассмотреть.
                </Callout>
              )}
              {locked && (
                <Callout tone="warn" className="mb-4">
                  Состав заблокирован турниром «{locked.name}» — принять игрока сейчас нельзя.
                </Callout>
              )}
              {applications.length ? (
                <ApplicationsInbox
                  locked={locked?.name ?? null}
                  items={applications.map((a) => ({ id: a.id, message: a.message, date: formatDate(a.created_at), player: a.player }))}
                />
              ) : (
                <EmptyState
                  compact
                  icon={<Inbox />}
                  title="Новых заявок нет"
                  text="Игроки подают заявки со страницы команды и из «Поиска команды». Заявка живёт 7 дней."
                  action={<Button href="/find?tab=teams" variant="secondary" size="sm">Разместить объявление</Button>}
                />
              )}
              <HelpHint topics={["team-applications"]} className="mt-6" />
            </Section>
          )}

          {tab === "matches" && (
            <Stack>
              <Section title="Текущие и ближайшие">
                {active.length ? (
                  <RowList>
                    {active.map((m) => (
                      <MatchListRow key={m.id} m={m} highlight={team.id} meta={`${m.tournament.name} · BO${m.best_of}`} />
                    ))}
                  </RowList>
                ) : (
                  <EmptyState
                    compact
                    icon={<Gamepad2 />}
                    title="Матчей впереди нет"
                    text={current ? "Матч появится, когда в сетке определится соперник." : "Матчи появятся, когда команда попадёт в турнир."}
                    action={current ? undefined : <Button href="/tournaments" variant="secondary" size="sm">Смотреть турниры</Button>}
                  />
                )}
              </Section>
              <Section title="Сыгранные">
                {played.length ? (
                  <RowList>
                    {played.map((m) => (
                      <MatchListRow key={m.id} m={m} highlight={team.id} meta={m.tournament.name} />
                    ))}
                  </RowList>
                ) : (
                  <EmptyState compact icon={<Gamepad2 />} title="Сыгранных матчей пока нет" text="История появится после первого турнира." />
                )}
              </Section>
            </Stack>
          )}

          {tab === "tournaments" && (
            <Section title="Турниры" action={<Link href="/tournaments" className="text-meta font-medium text-accent hover:text-accent-strong">Все турниры →</Link>}>
              {regs.length ? (
                <RowList>
                  {regs.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <Trophy className="size-4 text-fg-3" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Link href={`/tournaments/${r.tournament.slug}`} className="block truncate text-[14px] font-medium text-fg hover:text-accent">
                          {r.tournament.name}
                        </Link>
                        <div className="text-meta text-fg-3">Старт {formatDateTime(r.tournament.starts_at)}</div>
                      </div>
                      <Status info={tournamentStatus[r.tournament.status]} size="sm" />
                      <Status info={registrationStatus[r.status]} size="sm" />
                      {r.checked_in_at && <Status info={{ label: "Check-in пройден", tone: "ok" }} size="sm" />}
                      {r.status === "rejected" && r.note && <span className="w-full pl-8 text-meta text-danger">Причина: {r.note}</span>}
                    </div>
                  ))}
                </RowList>
              ) : (
                <EmptyState
                  compact
                  icon={<Trophy />}
                  title="Команда ещё не подавала заявок"
                  text={isCaptain ? "Найдите турнир с открытой регистрацией и подайте заявку." : "Заявку на турнир подаёт капитан."}
                  action={<Button href="/tournaments" variant="secondary" size="sm">Смотреть турниры</Button>}
                />
              )}
              <HelpHint topics={["register-tournament", "change-application", "checkin"]} className="mt-6" />
            </Section>
          )}

          {locked && tab === "roster" && (
            <p className="mt-6 flex items-center gap-2 text-meta text-fg-3">
              <Lock className="size-4" /> Пока турнир не закончится, состав можно изменить только через администратора.
            </p>
          )}
          {!isCaptain && tab === "overview" && (
            <p className="mt-10 flex items-center gap-2 text-meta text-fg-3">
              <Users className="size-4" /> Выйти из команды можно в разделе «Настройки».
            </p>
          )}
        </div>
      </Container>
    </>
  );
}

