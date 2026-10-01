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
import { NotificationItem } from "@/components/public/notification-feed";
import { Avatar, FaceitLevel, TeamLogo, cn } from "@/components/ui";
import {
  Button,
  CARD,
  Eyebrow,
  PageHero,
  PrimaryBtn,
  SectionHead,
  SectionLink,
  StatusChip,
  TournamentStatusChip,
  Wrap,
  btnClass,
} from "@/components/primitives";

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
  const needsCheckin = activeRegs.find((r) => r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at);

  // главное следующее действие — одно, по приоритету
  const action: { eyebrow: string; title: string; text: string; href: string; cta: string; tone?: "live" } | null =
    next && (next.status === "live" || next.status === "ready")
      ? {
          eyebrow: next.status === "live" ? "Матч идёт" : "Сервер готов",
          title: `${next.team1?.name ?? "TBD"} vs ${next.team2?.name ?? "TBD"}`,
          text: next.status === "live" ? "Матч уже на сервере — следите за счётом." : "Адрес сервера на странице матча. На подключение — 15 минут.",
          href: `/matches/${next.id}`,
          cta: next.status === "live" ? "Открыть матч" : "Подключиться",
          tone: "live",
        }
      : next && next.status === "veto"
        ? {
            eyebrow: "Вето карт",
            title: "Идёт выбор карт",
            text: isCaptain ? "Ваш ход может быть сейчас — на ход 60 секунд." : "Капитаны выбирают карты. Следите за матчем.",
            href: `/matches/${next.id}`,
            cta: "Открыть вето",
          }
        : needsCheckin && isCaptain
          ? {
              eyebrow: "Check-in открыт",
              title: needsCheckin.tournament.name,
              text: "Подтвердите участие команды, иначе место займёт другая.",
              href: `/tournaments/${needsCheckin.tournament.slug}/checkin`,
              cta: "Пройти check-in",
            }
          : !membership && !solo
            ? {
                eyebrow: "Первый шаг",
                title: "Создайте команду",
                text: "Вы станете капитаном и получите ссылку-приглашение для игроков.",
                href: "/team/create",
                cta: "Создать команду",
              }
            : membership && isCaptain && members.length < 5
              ? {
                  eyebrow: "Состав",
                  title: `В команде ${members.length} из 5`,
                  text: "Отправьте ссылку-приглашение игрокам — она в штабе команды.",
                  href: "/team",
                  cta: "Пригласить игроков",
                }
              : activeRegs.length === 0
                ? {
                    eyebrow: "Турниры",
                    title: "Найдите турнир",
                    text: isCaptain || solo ? "Подайте заявку, пока открыта регистрация." : "Заявку на турнир подаёт капитан.",
                    href: "/tournaments",
                    cta: "Смотреть турниры",
                  }
                : null;

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
          <Button href={`/players/${player.steam_id}`} variant="ghost" size="sm">
            Публичный профиль
          </Button>
          {isAdmin(player) && (
            <Button href="/admin" variant="ghost" size="sm">
              F16 Control
            </Button>
          )}
          <form action="/api/auth/logout" method="post">
            <button className={btnClass("ghost", "sm")}>Выйти</button>
          </form>
        </div>
        }
      />

      <Wrap>

      {/* ── следующее действие — главное */}
      {action && (
        <section className="pt-12">
          <div
            className={cn(
              CARD,
              "relative overflow-hidden p-7 sm:p-10",
              action.tone === "live" && "border-danger/30",
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_260px_at_100%_0%,#1a2c4880,transparent_70%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <Eyebrow className={action.tone === "live" ? "!text-danger" : undefined}>
                  {action.tone === "live" && <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />}
                  Следующий шаг · {action.eyebrow}
                </Eyebrow>
                <div className="t-h2 mt-4 break-words">{action.title}</div>
                <p className="t-body mt-2 max-w-[620px]">{action.text}</p>
              </div>
              <PrimaryBtn href={action.href} className="shrink-0">
                {action.cta} →
              </PrimaryBtn>
            </div>
          </div>
        </section>
      )}

      {/* ── следующий матч */}
      {next && (
        <section className="pt-12">
          <SectionHead title="Ближайший матч" action={<MatchStatusBadge status={next.status} />} />
          <Link
            href={`/matches/${next.id}`}
            className={cn(CARD, "grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6 transition-colors hover:border-white/[0.18] hover:bg-[#0d1726] sm:gap-6 sm:p-10")}
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
                    <TournamentStatusChip status={r.tournament.status} size="sm" />
                    <StatusChip tone={r.status === "approved" ? "ok" : "warn"} size="sm">
                      {registrationStatusLabel[r.status]}
                    </StatusChip>
                    {r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at && isCaptain && (
                      <Button href={`/tournaments/${r.tournament.slug}/checkin`} size="sm">
                        Check-in
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-2">
                <div className="text-[16px] font-semibold text-fg">Нет активных заявок</div>
                <p className="mt-1 text-[14px] text-fg-3">Здесь появится турнир, в котором вы участвуете.</p>
                <Button href="/tournaments" variant="secondary" size="sm" className="mt-4">
                  Смотреть турниры
                </Button>
              </div>
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
              <div className="py-2">
                <div className="text-[16px] font-semibold text-fg">Вы пока не в команде</div>
                <p className="mt-1 text-[14px] text-fg-3">Создайте свою или попросите капитана прислать приглашение.</p>
                <Button href="/team/create" size="sm" className="mt-4">
                  Создать команду
                </Button>
              </div>
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
              <div className="py-2">
                <div className="text-[16px] font-semibold text-fg">Матчей пока нет</div>
                <p className="mt-1 text-[14px] text-fg-3">Ваши матчи появятся здесь после публикации сетки.</p>
              </div>
            )}
          </section>
        </div>

        <aside id="notifications" className={cn(CARD, "scroll-mt-28 p-6 lg:p-8 lg:sticky lg:top-28")}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <SectionHead title={unread ? `Уведомления · ${unread}` : "Уведомления"} className="!mb-0" />
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <ActionForm action={markNotificationsRead}>
                  <SubmitButton variant="ghost" size="sm">
                    Прочитать
                  </SubmitButton>
                </ActionForm>
              )}
              <SectionLink href="/notifications">Все</SectionLink>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="py-4 text-[14px] text-fg-3">Уведомлений нет.</p>
          ) : (
            <div>
              {notifications.map((n) => (
                <NotificationItem key={n.id} n={n} compact />
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
