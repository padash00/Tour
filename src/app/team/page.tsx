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
import { EmptyState, Notice, Pill, TeamLogo, cn } from "@/components/ui";
import { OutlineBtn, PrimaryBtn } from "@/components/public/home";
import { CARD, HeroNumber, PageHero, SectionHead, Wrap } from "@/components/public/page-kit";

export const metadata: Metadata = { title: "Моя команда" };

export default async function MyTeamPage() {
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);

  if (!membership) {
    return (
      <PageHero
        eyebrow="Штаб команды"
        title="У вас пока нет команды"
        lead="Создайте команду или попросите капитана прислать ссылку-приглашение."
      >
        <div className="mt-10 flex flex-wrap gap-4">
          <PrimaryBtn href="/team/create">Создать команду</PrimaryBtn>
          <OutlineBtn href="/teams">Найти команду</OutlineBtn>
        </div>
      </PageHero>
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
    <>
      {/* ── штаб команды */}
      <PageHero
        media={
          <div className="shrink-0 rounded-[16px] border border-white/[0.08] bg-[#0b1420]/80 p-4">
            <TeamLogo src={team.logo_url} tag={team.tag} size={112} />
          </div>
        }
        eyebrow={`Штаб команды · ${team.tag}`}
        title={team.name}
        lead={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] lg:text-[17px] text-fg">
            <Pill tone={full ? "ok" : "warn"}>{full ? "Состав собран" : "Состав неполный"}</Pill>
            <span className="h-4 w-px bg-white/20" />
            {team.region ?? "Регион не указан"}
            <span className="h-4 w-px bg-white/20" />
            {isCaptain ? "Вы капитан" : "Вы игрок"}
            <span className="h-4 w-px bg-white/20" />с {formatDate(team.created_at)}
          </div>
        }
      >
        <div className="mt-12 flex flex-wrap gap-x-16 gap-y-8 border-t border-white/[0.06] pt-10">
          <HeroNumber
            label="Основа"
            value={
              <>
                {mains}
                <span className="text-fg-3">/{MAX_MAIN}</span>
              </>
            }
            tone={full ? "text-ok" : undefined}
          />
          <HeroNumber
            label="Запас"
            value={
              <>
                {subs}
                <span className="text-fg-3">/{MAX_SUBS}</span>
              </>
            }
          />
          <HeroNumber label="Avg FACEIT ELO" value={elo ?? "—"} />
          <HeroNumber label="Заявок" value={regs.length} />
        </div>
      </PageHero>

      <Wrap>
      {locked && (
        <div className="mt-10">
          <Notice tone="warn">Состав заблокирован турниром «{locked.name}». Изменить его может только администратор.</Notice>
        </div>
      )}

      <div className="pt-14 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead title="Состав" />
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

          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead title="Турниры" />
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
                  <div key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 min-h-[64px] py-2 border-b border-white/[0.05] last:border-0">
                    <Link href={`/tournaments/${r.tournament.slug}`} className="text-[17px] font-semibold hover:text-accent flex-1">
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
            <details className={cn(CARD, "group px-6 lg:px-8")}>
              <summary className="list-none cursor-pointer flex items-center justify-between py-6 text-[13px] font-medium uppercase tracking-[0.2em] text-fg-2">
                Настройки команды
                <span className="text-fg-3 transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="pb-8 pt-2">
                <TeamForm action={updateTeam} team={team} submitLabel="Сохранить" />
              </div>
            </details>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28">
          {isCaptain && (
            <div className={cn(CARD, "p-6 lg:p-8")}>
              <SectionHead title="Пригласить игрока" className="mb-3" />
              <p className="text-[15px] text-fg-3 mb-5">Игрок войдёт через Steam и подтвердит вступление.</p>
              <CopyField value={`${origin}/join/${team.invite_code}`} />
              <ActionForm action={regenerateInvite} className="mt-3">
                <SubmitButton variant="ghost" size="sm" confirm="Старая ссылка перестанет работать. Продолжить?">
                  Новая ссылка
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <Link href={`/teams/${team.tag}`} className={cn(CARD, "flex items-center justify-between px-6 py-5 text-[15px] text-fg-2 hover:text-fg lg:px-8")}>
            Публичная страница команды <span>→</span>
          </Link>
        </aside>
      </div>

      {/* ── опасные действия — внизу, отдельно */}
      <section className="mt-24 pt-8 border-t border-white/[0.06] max-w-xl">
        <SectionHead title="Опасная зона" className="mb-4" />
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
      </Wrap>
    </>
  );
}
