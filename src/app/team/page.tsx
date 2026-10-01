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
import { ButtonLink, Container, EmptyState, Notice, Pill, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Моя команда" };

export default async function MyTeamPage() {
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);

  if (!membership) {
    return (
      <Container size="narrow">
        <div className="pt-16 md:pt-24">
          <h1 className="text-[36px] md:text-[48px] font-bold tracking-[-0.035em] leading-[1.02]">У вас пока нет команды</h1>
          <p className="mt-4 text-fg-2 max-w-lg">Создайте команду или попросите капитана прислать ссылку-приглашение.</p>
          <div className="mt-8">
            <ButtonLink href="/team/create" size="lg">
              Создать команду
            </ButtonLink>
          </div>
        </div>
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
  const full = mains >= MAX_MAIN;

  return (
    <Container size="competition">
      {/* ── идентичность команды */}
      <section className="pt-12 md:pt-16 pb-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between border-b border-line">
        <div className="flex items-center gap-6 min-w-0">
          <TeamLogo src={team.logo_url} tag={team.tag} size={88} />
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-sm text-fg-3">
              <span>{team.tag}</span>
              <Pill tone={full ? "ok" : "warn"}>{full ? "Состав собран" : "Состав неполный"}</Pill>
            </div>
            <h1 className="mt-2 text-[36px] md:text-[48px] font-bold tracking-[-0.04em] leading-[1] truncate">{team.name}</h1>
            <div className="mt-2 text-sm text-fg-3">
              {team.region ?? "Регион не указан"} · с {formatDate(team.created_at)}
            </div>
          </div>
        </div>
        <div className="flex gap-10">
          <div>
            <div className="num text-[28px] font-semibold leading-none">
              {mains}
              <span className="text-fg-3">/{MAX_MAIN}</span>
            </div>
            <div className="mt-2 text-[13px] text-fg-3">Основа</div>
          </div>
          <div>
            <div className="num text-[28px] font-semibold leading-none">
              {subs}
              <span className="text-fg-3">/{MAX_SUBS}</span>
            </div>
            <div className="mt-2 text-[13px] text-fg-3">Запас</div>
          </div>
          <div>
            <div className="num text-[28px] font-semibold leading-none">{elo ?? "—"}</div>
            <div className="mt-2 text-[13px] text-fg-3">Avg FACEIT ELO</div>
          </div>
        </div>
      </section>

      {locked && (
        <div className="mt-8">
          <Notice tone="warn">Состав заблокирован турниром «{locked.name}». Изменить его может только администратор.</Notice>
        </div>
      )}

      <div className="pt-12 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-x-16 gap-y-12 items-start">
        <div className="space-y-16 min-w-0">
          <section>
            <h2 className="text-[22px] font-bold tracking-[-0.025em] mb-3">Состав</h2>
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
                      <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl bg-surface-2 border border-line p-1.5">
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
          </section>

          <section>
            <h2 className="text-[22px] font-bold tracking-[-0.025em] mb-3">Турниры</h2>
            {regs.length === 0 ? (
              <EmptyState
                compact
                title="Команда ещё не подавала заявок"
                action={
                  <Link href="/tournaments" className="text-sm text-accent hover:text-accent-strong">
                    Посмотреть турниры →
                  </Link>
                }
              />
            ) : (
              <div>
                {regs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 min-h-14 py-2 border-b border-white/[0.05] last:border-0">
                    <Link href={`/tournaments/${r.tournament.slug}`} className="font-medium hover:text-accent-strong flex-1">
                      {r.tournament.name}
                    </Link>
                    <TournamentStatusPill status={r.tournament.status} />
                    <Pill tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "neutral"}>
                      {registrationStatusLabel[r.status]}
                    </Pill>
                    {r.checked_in_at && <Pill tone="ok">Check-in</Pill>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {isCaptain && (
            <details className="group">
              <summary className="list-none cursor-pointer flex items-center justify-between py-4 border-y border-line text-[15px] font-semibold">
                Настройки команды
                <span className="text-fg-3 transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="pt-6">
                <TeamForm action={updateTeam} team={team} submitLabel="Сохранить" />
              </div>
            </details>
          )}
        </div>

        <aside className="space-y-10 lg:sticky lg:top-24">
          {isCaptain && (
            <div className="rounded-2xl bg-surface p-6">
              <h3 className="text-[15px] font-semibold">Пригласить игрока</h3>
              <p className="mt-1 text-sm text-fg-3 mb-4">Игрок войдёт через Steam и подтвердит вступление.</p>
              <CopyField value={`${origin}/join/${team.invite_code}`} />
              <ActionForm action={regenerateInvite} className="mt-3">
                <SubmitButton variant="ghost" size="sm" confirm="Старая ссылка перестанет работать. Продолжить?">
                  Новая ссылка
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <Link href={`/teams/${team.tag}`} className="block text-sm text-fg-2 hover:text-fg">
            Публичная страница команды →
          </Link>
        </aside>
      </div>

      {/* ── опасные действия — внизу, отдельно */}
      <section className="mt-24 pt-8 border-t border-line max-w-xl">
        <h3 className="text-[13px] text-fg-3 mb-3">Опасная зона</h3>
        {isCaptain ? (
          <ActionForm action={disbandTeam}>
            <SubmitButton variant="danger" size="sm" confirm="Распустить команду? Все игроки будут исключены. Это действие необратимо.">
              Распустить команду
            </SubmitButton>
            <p className="mt-3 text-xs text-fg-3">Чтобы уйти из команды, сначала передайте капитанство другому игроку.</p>
          </ActionForm>
        ) : (
          <ActionForm action={leaveTeam}>
            <SubmitButton variant="danger" size="sm" confirm={`Покинуть ${team.name}?`}>
              Покинуть команду
            </SubmitButton>
          </ActionForm>
        )}
      </section>
    </Container>
  );
}
