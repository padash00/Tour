import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, Lock, Trophy, Users } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { requirePlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, averageElo, getActiveMembership, getLockingTournament, getTeamMembers, getTeamRegistrations } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { siteOrigin } from "@/lib/origin";
import { getTeamMatches } from "@/lib/matches";
import { MatchListRow } from "@/components/match-row";
import { InviteButton } from "@/components/team/invite";
import { Roster, type RosterMember } from "@/components/team/roster";
import { TeamHeader } from "@/components/team/team-header";
import {
  Button,
  Callout,
  Container,
  CriticalSurface,
  EmptyState,
  Eyebrow,
  PageTitle,
  RowList,
  Section,
  Stack,
  Status,
  registrationStatus,
  tournamentStatus,
} from "@/components/ds";

export const metadata: Metadata = { title: "Моя команда" };

type Tab = "overview" | "roster" | "matches" | "tournaments";

export default async function MyTeamPage(props: PageProps<"/team">) {
  const player = await requirePlayer("/team");
  const sp = await props.searchParams;
  const membership = await getActiveMembership(player.id);

  if (!membership) {
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
      </Container>
    );
  }

  const tab: Tab = (["roster", "matches", "tournaments"] as const).find((t) => t === sp.tab) ?? "overview";
  const created = sp.created === "1";
  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, regs, locked, origin, matches] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getLockingTournament(team.id),
    siteOrigin(),
    getTeamMatches(team.id),
  ]);
  const order = { live: 0, ready: 1, veto: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  const active = matches.filter((m) => !["finished", "cancelled"].includes(m.status)).sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);
  const played = matches.filter((m) => m.status === "finished").reverse();
  const next = active.find((m) => m.team1_id && m.team2_id) ?? null;
  const needsCheckin = regs.find((r) => r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at);
  const mains = members.filter((m) => m.role !== "substitute").length;
  const subs = members.length - mains;
  const ready = mains >= MAX_MAIN;
  const freeSlots = MAX_MAIN + MAX_SUBS - members.length;
  const captain = members.find((m) => m.role === "captain");
  const current = regs.find((r) => ["pending", "approved"].includes(r.status) && !["finished", "cancelled"].includes(r.tournament.status));
  const inviteUrl = `${origin}/join/${team.invite_code}`;
  const roster: RosterMember[] = members.map((m) => ({ id: m.id, role: m.role, player: m.player }));

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
              {created && (
                <CriticalSurface tone="ok">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Eyebrow tone="ok">Команда создана</Eyebrow>
                      <div className="mt-2 text-heading text-fg">{team.name}</div>
                      <p className="mt-1 text-[14px] text-fg-2">
                        Следующий шаг — пригласите игроков. В основе {mains} из {MAX_MAIN}.
                      </p>
                    </div>
                    <InviteButton url={inviteUrl} freeSlots={freeSlots} size="lg" label="Пригласить игроков" />
                  </div>
                </CriticalSurface>
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

              <Section title="Состояние команды">
                <RowList>
                  <StatusRow label="Основной состав" value={`${mains} из ${MAX_MAIN}`} status={ready ? { label: "Готово", tone: "ok" } : { label: `Нужно ещё ${MAX_MAIN - mains}`, tone: "warn" }} />
                  <StatusRow label="Запасные" value={`${subs} из ${MAX_SUBS}`} />
                  <StatusRow label="Капитан" value={captain?.player.nickname ?? "—"} />
                  <StatusRow label="Средний FACEIT ELO" value={averageElo(members) ?? "—"} />
                  <StatusRow
                    label="Турнир"
                    value={current ? <Link href={`/tournaments/${current.tournament.slug}`} className="hover:text-accent">{current.tournament.name}</Link> : "Нет активной заявки"}
                    status={current ? registrationStatus[current.status] : undefined}
                  />
                  <StatusRow label="Команда создана" value={formatDate(team.created_at)} />
                </RowList>
              </Section>

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
                  <EmptyState compact icon={<Gamepad2 />} title="Сыгранных матчей пока нет" text="Результаты появятся после первого турнира." />
                )}
              </Section>
            </Stack>
          )}

          {tab === "roster" && (
            <Section
              title="Состав"
              description={isCaptain ? "Основа — до 5 игроков, запас — до 2. Действия с игроком — в меню «⋯»." : "Составом управляет капитан."}
              action={isCaptain && !locked && freeSlots > 0 ? <InviteButton url={inviteUrl} freeSlots={freeSlots} variant="secondary" size="sm" /> : undefined}
            >
              <Roster members={roster} isCaptain={isCaptain} locked={locked?.name ?? null} maxMain={MAX_MAIN} maxSubs={MAX_SUBS} />
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
                  <EmptyState compact icon={<Gamepad2 />} title="Матчей впереди нет" text="Матч появится, когда в сетке определится соперник." />
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

function StatusRow({ label, value, status }: { label: string; value: React.ReactNode; status?: { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "danger" | "live" } }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
      <span className="w-44 shrink-0 text-meta text-fg-3">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{value}</span>
      {status && <Status info={status} size="sm" />}
    </div>
  );
}
