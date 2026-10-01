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
import { getTeamMatches } from "@/lib/matches";
import { MatchStatusBadge } from "@/components/match-bits";
import { ActionForm, CopyField, SubmitButton } from "@/components/forms";
import { RosterList } from "@/components/roster-list";
import { TeamForm } from "@/components/team-form";
import { Notice, TeamLogo, cn } from "@/components/ui";
import {
  CARD,
  HeroNumber,
  OutlineBtn,
  PageHero,
  PrimaryBtn,
  SectionHead,
  SectionLink,
  StatusChip,
  TournamentStatusChip,
  Wrap,
} from "@/components/primitives";

export const metadata: Metadata = { title: "Моя команда" };

export default async function MyTeamPage() {
  const player = await requirePlayer("/team");
  const membership = await getActiveMembership(player.id);

  if (!membership) {
    return (
      <PageHero
        eyebrow="Штаб команды"
        title="У вас пока нет команды"
        lead="Создайте команду — вы станете капитаном. Или попросите капитана прислать ссылку-приглашение и откройте её."
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
  const [members, regs, locked, origin, matches] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getLockingTournament(team.id),
    siteOrigin(),
    getTeamMatches(team.id),
  ]);
  const order = { live: 0, ready: 1, veto: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  const next = matches
    .filter((m) => !["finished", "cancelled"].includes(m.status))
    .sort((a, b) => order[a.status] - order[b.status] || a.number - b.number)[0];
  const needsCheckin = regs.find((r) => r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at);
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
            <StatusChip tone={full ? "ok" : "warn"} size="sm">
              {full ? "Состав собран" : `Нужно ещё ${MAX_MAIN - mains}`}
            </StatusChip>
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
          {needsCheckin && isCaptain && (
            <Link
              href={`/tournaments/${needsCheckin.tournament.slug}/checkin`}
              className={cn(CARD, "group flex flex-wrap items-center justify-between gap-4 border-warn/35 p-6 transition-colors hover:bg-[#0d1726] lg:p-8")}
            >
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-warn">Check-in открыт</div>
                <div className="mt-2 text-[20px] font-semibold text-fg">{needsCheckin.tournament.name}</div>
                <div className="mt-1 text-[14px] text-fg-3">Подтвердите участие команды, иначе место займёт другая.</div>
              </div>
              <span className="inline-flex h-11 items-center rounded-[8px] bg-accent px-5 text-[14px] font-semibold text-accent-ink transition-colors group-hover:bg-accent-strong">
                Пройти check-in →
              </span>
            </Link>
          )}

          {next && (
            <Link
              href={`/matches/${next.id}`}
              className={cn(CARD, "group block p-6 transition-colors hover:border-white/[0.18] hover:bg-[#0d1726] lg:p-8", (next.status === "live" || next.status === "ready") && "border-danger/30")}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-fg-3">Ближайший матч · {next.tournament.name}</span>
                <MatchStatusBadge status={next.status} />
              </div>
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {next.team1 && <TeamLogo src={next.team1.logo_url} tag={next.team1.tag} size={44} />}
                  <span className="truncate text-[18px] font-semibold lg:text-[22px]">{next.team1?.name ?? "TBD"}</span>
                </div>
                <div className="text-center">
                  <div className="text-[13px] font-semibold tracking-[0.14em] text-fg-3">VS</div>
                  <div className="num mt-1 text-[12px] text-fg-3">BO{next.best_of}</div>
                </div>
                <div className="flex min-w-0 items-center justify-end gap-3">
                  <span className="truncate text-right text-[18px] font-semibold lg:text-[22px]">{next.team2?.name ?? "TBD"}</span>
                  {next.team2 && <TeamLogo src={next.team2.logo_url} tag={next.team2.tag} size={44} />}
                </div>
              </div>
            </Link>
          )}

          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead
              title="Состав"
              action={
                <span className="num text-[13px] text-fg-3">
                  {mains}/{MAX_MAIN} основа · {subs}/{MAX_SUBS} запас
                </span>
              }
            />
            <RosterList
              slots={MAX_MAIN + MAX_SUBS}
              items={members.map((m) => ({
                key: m.id,
                player: m.player,
                role: m.role === "captain" ? "captain" : m.role === "substitute" ? "sub" : "main",
                extra:
                  isCaptain && m.role !== "captain" && !locked ? (
                    <details className="relative">
                      <summary
                        aria-label={`Действия: ${m.player.nickname}`}
                        className="grid size-10 cursor-pointer list-none place-items-center rounded-[8px] text-[18px] text-fg-3 transition-colors hover:bg-white/[0.05] hover:text-fg"
                      >
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 w-60 rounded-[10px] border border-white/[0.1] bg-surface-3 p-1.5 shadow-[var(--shadow-pop)] animate-[menu-in_.14s_ease-out]">
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
            <SectionHead title="Турниры" action={regs.length > 0 ? <SectionLink href="/tournaments">Все турниры</SectionLink> : undefined} />
            {regs.length === 0 ? (
              <div className="py-2">
                <div className="text-[16px] font-semibold text-fg">Команда ещё не подавала заявок</div>
                <p className="mt-1 text-[14px] text-fg-3">
                  {isCaptain ? "Найдите турнир с открытой регистрацией и подайте заявку." : "Заявку на турнир подаёт капитан."}
                </p>
                <Link
                  href="/tournaments"
                  className="mt-5 inline-flex h-11 items-center rounded-[8px] border border-white/25 px-5 text-[14px] font-semibold text-fg transition-colors hover:border-white/45"
                >
                  Смотреть турниры
                </Link>
              </div>
            ) : (
              <div>
                {regs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 min-h-[64px] py-2 border-b border-white/[0.05] last:border-0">
                    <Link href={`/tournaments/${r.tournament.slug}`} className="text-[17px] font-semibold hover:text-accent flex-1">
                      {r.tournament.name}
                    </Link>
                    <TournamentStatusChip status={r.tournament.status} size="sm" />
                    <StatusChip tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "muted"} size="sm">
                      {registrationStatusLabel[r.status]}
                    </StatusChip>
                    {r.checked_in_at && (
                      <StatusChip tone="accent" size="sm">
                        Check-in
                      </StatusChip>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {isCaptain && (
            <details className={cn(CARD, "group px-6 lg:px-8")}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6">
                <span>
                  <span className="block text-[13px] font-medium uppercase tracking-[0.2em] text-fg-2">Настройки команды</span>
                  <span className="mt-1 block text-[13px] text-fg-3">Название, тег, регион, логотип и описание</span>
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.1] text-fg-3 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
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
              <p className="mb-5 text-[14px] leading-relaxed text-fg-3">
                Отправьте ссылку игроку: он войдёт через Steam и подтвердит вступление.{" "}
                {members.length < MAX_MAIN + MAX_SUBS ? `Свободно мест: ${MAX_MAIN + MAX_SUBS - members.length}.` : "Мест нет."}
              </p>
              <CopyField value={`${origin}/join/${team.invite_code}`} />
              <ActionForm action={regenerateInvite} className="mt-3">
                <SubmitButton variant="ghost" size="sm" confirm="Старая ссылка перестанет работать. Продолжить?">
                  Новая ссылка
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          <Link
            href={`/teams/${team.tag}`}
            className={cn(CARD, "group flex items-center justify-between px-6 py-5 text-[15px] text-fg-2 transition-colors hover:border-white/[0.16] hover:text-fg lg:px-8")}
          >
            Публичная страница команды <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
          </Link>
        </aside>
      </div>

      {/* ── опасные действия — внизу, отдельно */}
      <section className="mt-20 max-w-2xl rounded-[12px] border border-danger/20 bg-danger/[0.03] p-6 lg:p-8">
        <SectionHead title="Опасная зона" className="mb-4" />
        <p className="mb-5 text-[14px] text-fg-3">
          {isCaptain ? "Роспуск удалит команду и исключит всех игроков. Отменить нельзя." : "Вы покинете команду и не сможете играть за неё в турнирах."}
        </p>
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
