import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsRead, refreshProfile } from "@/app/actions/profile";
import { isAdmin, requirePlayer } from "@/lib/auth";
import { getActiveMembership, getSoloTeam, getTeamMembers, getTeamRegistrations, isActiveRegistration } from "@/lib/data";
import { formatDateTime, registrationStatusLabel } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { getTeamMatches } from "@/lib/matches";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MatchRow, MatchStatusBadge } from "@/components/match-bits";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { NotificationRow } from "@/components/competition/notification-row";
import { Avatar, ButtonLink, EmptyState, FaceitLevel, Pill, TeamLogo, buttonClass, cn } from "@/components/ui";
import { CARD, PageHero, SectionHead, Wrap } from "@/components/public/page-kit";

export const metadata: Metadata = { title: "Профиль" };

export default async function MePage() {
  const player = await requirePlayer("/me");
  const membership = await getActiveMembership(player.id);
  const [members, teamRegs, solo, notificationsRes, ownMatches] = await Promise.all([
    membership ? getTeamMembers(membership.team.id) : Promise.resolve([]),
    membership ? getTeamRegistrations(membership.team.id) : Promise.resolve([]),
    getSoloTeam(player, false),
    db().from("notifications").select("*").eq("player_id", player.id).order("created_at", { ascending: false }).limit(5),
    membership ? getTeamMatches(membership.team.id) : Promise.resolve([]),
  ]);
  const [soloRegs, soloMatches] = solo ? await Promise.all([getTeamRegistrations(solo.id), getTeamMatches(solo.id)]) : [[], []];
  const regs = [...teamRegs, ...soloRegs];
  const teamMatches = [...ownMatches, ...soloMatches];
  const order = { live: 0, ready: 1, veto: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  const upcoming = teamMatches.filter((m) => m.status !== "finished").sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);
  const recent = teamMatches.filter((m) => m.status === "finished").reverse().slice(0, 5);
  const next = upcoming[0];
  const notifications = (notificationsRes.data ?? []) as Notification[];
  const unread = notifications.filter((n) => !n.read_at).length;
  const activeRegs = regs.filter((r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status));
  const isCaptain = membership?.team.captain_id === player.id;

  return (
    <>
      {/* ── профиль */}
      <PageHero
        compact
        media={
          <div className="shrink-0 rounded-full border border-white/[0.1] p-1.5">
            <Avatar src={player.avatar_url} name={player.nickname} size={104} />
          </div>
        }
        eyebrow="Личный кабинет"
        title={player.nickname}
        lead={
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-fg-2">
              <span className="inline-flex items-center gap-2">
                <FaceitLevel level={player.faceit_level} />
                {player.faceit_elo ? <span className="num text-fg-2">{player.faceit_elo} ELO</span> : "FACEIT не найден"}
              </span>
              {membership && (
                <Link href="/team" className="inline-flex items-center gap-2 hover:text-fg">
                  <TeamLogo src={membership.team.logo_url} tag={membership.team.tag} size={18} />
                  {membership.team.name}
                </Link>
              )}
            </div>
        }
        aside={
        <div className="flex flex-wrap gap-1">
          <ActionForm action={refreshProfile}>
            <SubmitButton variant="ghost" size="sm" pendingText="Обновляем…">
              Обновить Steam и FACEIT
            </SubmitButton>
          </ActionForm>
          <ButtonLink href={`/players/${player.steam_id}`} variant="ghost" size="sm">
            Публичный профиль
          </ButtonLink>
          {isAdmin(player) && (
            <ButtonLink href="/admin" variant="ghost" size="sm">
              F16 Control
            </ButtonLink>
          )}
          <form action="/api/auth/logout" method="post">
            <button className={buttonClass("ghost", "sm")}>Выйти</button>
          </form>
        </div>
        }
      />

      <Wrap>

      {/* ── следующий матч — главное */}
      {next && (
        <section className="pt-12">
          <SectionHead title="Следующий матч" action={<MatchStatusBadge status={next.status} />} />
          <Link
            href={`/matches/${next.id}`}
            className={cn(CARD, "grid grid-cols-[1fr_auto_1fr] items-center gap-6 hover:border-white/20 transition-colors p-6 sm:p-10")}
          >
            <div className="flex items-center gap-4 min-w-0">
              {next.team1 && <TeamLogo src={next.team1.logo_url} tag={next.team1.tag} size={48} />}
              <span className="truncate text-lg sm:text-[30px] font-semibold tracking-[-0.015em]">{next.team1?.name ?? "TBD"}</span>
            </div>
            <div className="text-center">
              <div className="text-fg-3 font-semibold tracking-[0.1em]">VS</div>
              <div className="mt-1 text-[12px] text-fg-3">
                BO{next.best_of}
                {next.scheduled_at ? ` · ${formatDateTime(next.scheduled_at)}` : ""}
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 min-w-0">
              <span className="truncate text-lg sm:text-[30px] font-semibold tracking-[-0.015em] text-right">{next.team2?.name ?? "TBD"}</span>
              {next.team2 && <TeamLogo src={next.team2.logo_url} tag={next.team2.tag} size={48} />}
            </div>
          </Link>
          <div className="mt-2 text-[13px] text-fg-3">{next.tournament.name}</div>
        </section>
      )}

      <Onboarding
        steps={[
          { done: true, title: "Войти через Steam", href: null },
          { done: !!membership || !!solo, title: "Создать команду", href: membership ? null : "/team/create" },
          { done: members.length >= 5 || !!solo, title: "Собрать состав", hint: "Ссылка-приглашение — на странице команды", href: membership ? "/team" : null },
          { done: activeRegs.length > 0, title: "Участвовать в турнире", hint: isCaptain ? undefined : "Заявку подаёт капитан", href: "/tournaments" },
        ]}
      />

      <div className="pt-12 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead title="Мой турнир" />
            {activeRegs.length > 0 ? (
              <div>
                {activeRegs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 min-h-16 py-3 border-b border-white/[0.05] last:border-0">
                    <div className="flex-1 min-w-0">
                      <Link href={`/tournaments/${r.tournament.slug}`} className="text-[17px] font-semibold hover:text-accent-strong">
                        {r.tournament.name}
                      </Link>
                      <div className="text-[13px] text-fg-3 mt-0.5">Старт {formatDateTime(r.tournament.starts_at)}</div>
                    </div>
                    <TournamentStatusPill status={r.tournament.status} />
                    <Pill tone={r.status === "approved" ? "ok" : "warn"}>{registrationStatusLabel[r.status]}</Pill>
                    {r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at && isCaptain && (
                      <ButtonLink href={`/tournaments/${r.tournament.slug}/checkin`} size="sm">
                        Check-in
                      </ButtonLink>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="Нет активных заявок"
                action={
                  <ButtonLink href="/tournaments" variant="secondary" size="sm">
                    Смотреть турниры
                  </ButtonLink>
                }
              />
            )}
          </section>

          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead title="Моя команда" />
            {membership ? (
              <Link href="/team" className="flex items-center gap-5 py-3 group">
                <TeamLogo src={membership.team.logo_url} tag={membership.team.tag} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-semibold group-hover:text-accent-strong truncate">{membership.team.name}</div>
                  <div className="text-[13px] text-fg-3">
                    {isCaptain ? "Вы капитан" : "Вы игрок"} · {members.length} в составе
                  </div>
                </div>
                <div className="hidden sm:flex -space-x-1.5">
                  {members.map((m) => (
                    <span key={m.id} className="rounded-full ring-2 ring-bg">
                      <Avatar src={m.player.avatar_url} name={m.player.nickname} size={28} />
                    </span>
                  ))}
                </div>
              </Link>
            ) : (
              <EmptyState
                compact
                title="Вы пока не в команде"
                description="Создайте свою или попросите капитана прислать приглашение."
                action={
                  <ButtonLink href="/team/create" size="sm">
                    Создать команду
                  </ButtonLink>
                }
              />
            )}
          </section>

          <section className={cn(CARD, "p-6 lg:p-8")}>
            <SectionHead title="Матчи" />
            {upcoming.length + recent.length ? (
              <div className="-mx-4">
                {[...upcoming.slice(next ? 1 : 0), ...recent].map((m) => (
                  <MatchRow key={m.id} m={m} stage={m.tournament.name} />
                ))}
              </div>
            ) : (
              <EmptyState compact title="Матчей пока нет" description="Ваши матчи появятся здесь после публикации сетки." />
            )}
          </section>
        </div>

        <aside id="notifications" className={cn(CARD, "scroll-mt-28 p-6 lg:p-8 lg:sticky lg:top-28")}>
          <div className="flex items-baseline justify-between mb-2">
            <SectionHead title="Уведомления" className="mb-0" />
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <ActionForm action={markNotificationsRead}>
                  <SubmitButton variant="ghost" size="sm">
                    Прочитать все
                  </SubmitButton>
                </ActionForm>
              )}
              <Link href="/notifications" className="text-sm text-fg-3 hover:text-fg">
                Все →
              </Link>
            </div>
          </div>
          {notifications.length === 0 ? (
            <EmptyState compact title="Уведомлений нет" />
          ) : (
            <div>
              {notifications.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </div>
          )}
        </aside>
      </div>
      </Wrap>
    </>
  );
}

/** Онбординг: показывается, пока игрок не прошёл путь до турнира */
function Onboarding({ steps }: { steps: { done: boolean; title: string; hint?: string; href: string | null }[] }) {
  if (steps.every((s) => s.done)) return null;
  const current = steps.find((s) => !s.done);
  return (
    <section className="pt-12">
      <SectionHead title="Что дальше" />
      <ol className="grid sm:grid-cols-4 gap-6">
        {steps.map((s, i) => {
          const active = s === current;
          const body = (
            <div className={cn("border-t-2 pt-4 transition-colors", s.done ? "border-ok/60" : active ? "border-accent" : "border-white/[0.08]")}>
              <div className={cn("num text-[12px]", s.done ? "text-ok" : active ? "text-accent" : "text-fg-3")}>
                {s.done ? "✓" : String(i + 1).padStart(2, "0")}
              </div>
              <div className={cn("mt-1 text-[17px] font-semibold", s.done ? "text-fg-3" : active ? "text-fg" : "text-fg-3")}>{s.title}</div>
              {active && s.hint && <div className="mt-1 text-[13px] text-fg-3">{s.hint}</div>}
            </div>
          );
          return (
            <li key={s.title}>
              {s.href && !s.done ? (
                <Link href={s.href} className="block hover:opacity-90">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
