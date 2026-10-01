import type { Metadata } from "next";
import Link from "next/link";
import {
  disbandTeam,
  kickMember,
  leaveTeam,
  regenerateInvite,
  setMemberRole,
  transferCaptain,
  updateTeam,
} from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import {
  MAX_MAIN,
  MAX_SUBS,
  averageElo,
  getActiveMembership,
  getLockingTournament,
  getTeamMembers,
  getTeamRegistrations,
} from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { siteOrigin } from "@/lib/origin";
import { ActionForm, CopyField, SubmitButton } from "@/components/forms";
import { RosterList } from "@/components/roster-list";
import { TeamForm } from "@/components/team-form";
import { TournamentStatusPill } from "@/components/tournament-bits";
import {
  ButtonLink,
  Card,
  Container,
  EmptyState,
  IconUsers,
  Notice,
  PageHeader,
  Pill,
  SectionTitle,
  TeamLogo,
} from "@/components/ui";

export const metadata: Metadata = { title: "Моя команда" };

export default async function MyTeamPage() {
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);

  if (!membership) {
    return (
      <Container className="max-w-3xl">
        <PageHeader eyebrow="Команда" title="У вас пока нет команды" />
        <EmptyState
          icon={<IconUsers />}
          title="Создайте команду или вступите в существующую"
          description="Чтобы вступить в команду, попросите капитана прислать ссылку-приглашение."
          action={<ButtonLink href="/team/create">Создать команду</ButtonLink>}
        />
      </Container>
    );
  }

  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, regs, locked, origin] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getLockingTournament(team.id),
    siteOrigin(),
  ]);
  const mains = members.filter((m) => m.role !== "substitute").length;
  const subs = members.length - mains;
  const elo = averageElo(members);

  return (
    <Container>
      <div className="flex flex-col gap-6 md:flex-row md:items-center pt-12 pb-10">
        <TeamLogo src={team.logo_url} tag={team.tag} size={88} />
        <div className="flex-1">
          <div className="label">Моя команда · {team.tag}</div>
          <h1 className="mt-2 text-4xl font-bold tracking-[-0.03em]">{team.name}</h1>
          <div className="mt-2 text-sm text-fg-3">
            {team.region ?? "Регион не указан"} · создана {formatDate(team.created_at)}
          </div>
        </div>
        <div className="flex gap-8">
          <div>
            <div className="label">Основа</div>
            <div className="mt-1 text-2xl font-bold num">
              {mains}<span className="text-fg-3">/{MAX_MAIN}</span>
            </div>
          </div>
          <div>
            <div className="label">Запас</div>
            <div className="mt-1 text-2xl font-bold num">
              {subs}<span className="text-fg-3">/{MAX_SUBS}</span>
            </div>
          </div>
          <div>
            <div className="label">Avg ELO</div>
            <div className="mt-1 text-2xl font-bold num">{elo ?? "—"}</div>
          </div>
        </div>
      </div>

      {locked && (
        <div className="mb-6">
          <Notice tone="warn">
            Состав заблокирован турниром «{locked.name}». Изменить его может только администратор.
          </Notice>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle title="Состав" />
            <RosterList
              slots={MAX_MAIN + MAX_SUBS}
              items={members.map((m) => ({
                key: m.id,
                player: m.player,
                role: m.role === "captain" ? "captain" : m.role === "substitute" ? "sub" : "main",
                extra:
                  isCaptain && m.role !== "captain" && !locked ? (
                    <details className="relative">
                      <summary className="list-none cursor-pointer grid place-items-center size-8 rounded-lg text-fg-3 hover:text-fg hover:bg-white/[0.04]">
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-56 card p-1.5 shadow-xl">
                        <ActionForm action={setMemberRole}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <input type="hidden" name="role" value={m.role === "substitute" ? "player" : "substitute"} />
                          <SubmitButton variant="ghost" size="sm" className="w-full justify-start">
                            {m.role === "substitute" ? "Перевести в основу" : "Перевести в запас"}
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={transferCaptain}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            confirm={`Передать капитанство игроку ${m.player.nickname}?`}
                          >
                            Сделать капитаном
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={kickMember}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start !text-danger"
                            confirm={`Исключить ${m.player.nickname} из команды?`}
                          >
                            Исключить
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                  ) : null,
              }))}
            />
          </Card>

          <Card className="p-6">
            <SectionTitle title="Турниры" />
            {regs.length === 0 ? (
              <p className="text-sm text-fg-3">
                Команда ещё не подавала заявок.{" "}
                <Link href="/tournaments" className="text-accent hover:underline">
                  Посмотреть турниры →
                </Link>
              </p>
            ) : (
              <div className="divide-y divide-line">
                {regs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Link href={`/tournaments/${r.tournament.slug}`} className="font-medium hover:text-accent flex-1">
                      {r.tournament.name}
                    </Link>
                    <TournamentStatusPill status={r.tournament.status} />
                    <Pill tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "neutral"}>
                      {registrationStatusLabel[r.status]}
                    </Pill>
                    {r.checked_in_at && <Pill tone="ok">Check-in ✓</Pill>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {isCaptain && (
            <Card className="p-6">
              <SectionTitle title="Настройки команды" />
              <TeamForm action={updateTeam} team={team} submitLabel="Сохранить" />
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          {isCaptain ? (
            <Card className="p-6">
              <div className="label mb-2">Приглашение</div>
              <p className="text-sm text-fg-2 mb-4">
                Отправьте ссылку игрокам. Они войдут через Steam и подтвердят вступление.
              </p>
              <CopyField value={`${origin}/join/${team.invite_code}`} />
              <ActionForm action={regenerateInvite} className="mt-3">
                <SubmitButton variant="ghost" size="sm" confirm="Старая ссылка перестанет работать. Продолжить?">
                  Создать новую ссылку
                </SubmitButton>
              </ActionForm>
            </Card>
          ) : null}

          <Card className="p-6">
            <div className="label mb-4">Действия</div>
            {isCaptain ? (
              <ActionForm action={disbandTeam}>
                <SubmitButton
                  variant="danger"
                  className="w-full"
                  confirm="Распустить команду? Все игроки будут исключены. Это действие необратимо."
                >
                  Распустить команду
                </SubmitButton>
                <p className="mt-3 text-xs text-fg-3">
                  Чтобы уйти из команды, сначала передайте капитанство другому игроку.
                </p>
              </ActionForm>
            ) : (
              <ActionForm action={leaveTeam}>
                <SubmitButton variant="danger" className="w-full" confirm={`Покинуть ${team.name}?`}>
                  Покинуть команду
                </SubmitButton>
              </ActionForm>
            )}
            <Link href={`/teams/${team.tag}`} className="mt-4 block text-sm text-accent hover:underline">
              Публичная страница команды →
            </Link>
          </Card>
        </div>
      </div>
    </Container>
  );
}
