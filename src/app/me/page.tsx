import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, RefreshCw, Trophy, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { refreshProfile } from "@/app/actions/profile";
import { MarkAllReadButton } from "@/components/notifications/actions";
import { requirePlayer } from "@/lib/auth";
import { refreshIfStale } from "@/lib/profile-sync";
import { getActiveMembership, getSoloTeam, getTeamMembers, getTeamRegistrations, getUnreadCount, isActiveRegistration, listPublicTournaments, type TeamRegistration } from "@/lib/data";
import { formatDateTime, formatTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { getTeamMatches } from "@/lib/matches";
import { tournamentEta } from "@/lib/schedule";
import { getPlayerActivity, type Activity } from "@/lib/activity";
import { modeOf } from "@/lib/modes";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MatchListRow } from "@/components/match-row";
import { NotificationItem } from "@/components/public/notification-feed";
import {
  Avatar,
  buttonClass,
  Button,
  Container,
  CriticalSurface,
  EmptyState,
  Eyebrow,
  FaceitLevel,
  Panel,
  RowList,
  Section,
  Status,
  Steps,
  TeamLogo,
  Timer,
  registrationStatus,
  tournamentStatus,
  type Tone,
} from "@/components/ds";

export const metadata: Metadata = { title: "Моя игра" };

/** Блок «Текущее действие»: одно состояние, всегда с ответом «что дальше» */
type Current = {
  tone: Tone | "neutral";
  eyebrow: string;
  title: ReactNode;
  text: ReactNode;
  cta?: { href: string; label: string };
  secondary?: { href: string; label: string }[];
  deadline?: string | null;
  connect?: string | null;
  steps?: { title: string; state: "done" | "current" | "todo" }[];
};

const ACTIVITY_COPY: Record<Activity["kind"], { eyebrow: string; text: string; cta: string }> = {
  veto_turn: { eyebrow: "Вето · ваш ход", text: "Выберите карту на странице матча. Не успеете — карта выберется случайно.", cta: "К вето" },
  lobby_veto_turn: { eyebrow: "Вето в лобби · ваш ход", text: "Выберите карту в комнате лобби.", cta: "В лобби" },
  lobby_draft_turn: { eyebrow: "Драфт · ваш ход", text: "Выберите игрока в свою команду.", cta: "В лобби" },
  lobby_ready_check: { eyebrow: "Проверка готовности", text: "Подтвердите, что вы на месте, иначе вас переведут в ожидание.", cta: "Подтвердить" },
  server_ready: { eyebrow: "Сервер готов", text: "Подключайтесь — в разминке напишите .ready в чат.", cta: "Открыть матч" },
  lobby_server_ready: { eyebrow: "Сервер готов", text: "Подключайтесь — в разминке напишите .r в чат.", cta: "Открыть лобби" },
  checkin: { eyebrow: "Check-in открыт", text: "Подтвердите участие команды, иначе место займёт другая.", cta: "Пройти check-in" },
  live: { eyebrow: "Матч идёт", text: "Вы должны быть на сервере. Счёт — на странице матча.", cta: "Открыть матч" },
  lobby_live: { eyebrow: "Матч в лобби идёт", text: "Счёт и статистика — в комнате лобби.", cta: "Открыть лобби" },
};

export default async function MyGamePage() {
  const player = await requirePlayer("/me");
  refreshIfStale(player); // профиль Steam/FACEIT обновится после ответа, если старше 6 ч
  const membership = await getActiveMembership(player.id);
  const [members, teamRegs, solo, notificationsRes, ownMatches, activity, tournaments] = await Promise.all([
    membership ? getTeamMembers(membership.team.id) : Promise.resolve([]),
    membership ? getTeamRegistrations(membership.team.id) : Promise.resolve([]),
    getSoloTeam(player, false),
    db().from("notifications").select("*").eq("player_id", player.id).order("created_at", { ascending: false }).limit(6),
    membership ? getTeamMatches(membership.team.id) : Promise.resolve([]),
    getPlayerActivity(player.id).catch(() => ({ top: null, more: 0 })),
    listPublicTournaments(),
  ]);
  const [soloRegs, soloMatches] = solo ? await Promise.all([getTeamRegistrations(solo.id), getTeamMatches(solo.id)]) : [[], []];
  const regs: TeamRegistration[] = [...teamRegs, ...soloRegs];
  const teamMatches = [...ownMatches, ...soloMatches];
  const order = { live: 0, ready: 1, veto: 2, upcoming: 3, pending: 4, finished: 5, cancelled: 6 } as const;
  const upcoming = teamMatches.filter((m) => !["finished", "cancelled"].includes(m.status)).sort((a, b) => order[a.status] - order[b.status] || a.number - b.number);
  const recent = teamMatches.filter((m) => m.status === "finished").reverse().slice(0, 5);
  const next = upcoming.find((m) => m.team1_id && m.team2_id) ?? null;
  const nextEta = next && next.status === "upcoming" && !next.scheduled_at ? ((await tournamentEta(next.tournament_id).catch(() => null))?.matchStart.get(next.id) ?? null) : null;
  const notifications = (notificationsRes.data ?? []) as Notification[];
  // в превью — последние 6, а счётчик — все непрочитанные
  const unread = await getUnreadCount(player.id);
  // основной состав — капитан и игроки; запасные требование основы не закрывают
  const mains = members.filter((m) => m.role !== "substitute").length;
  const live = (s: string) => !["finished", "cancelled"].includes(s);
  const activeRegs = regs.filter((r) => isActiveRegistration(r) && live(r.tournament.status));
  const rejected = regs.find((r) => r.status === "rejected" && r.tournament.status === "registration");
  const isCaptain = membership?.team.captain_id === player.id;
  const myTeamIds = [membership?.team.id, solo?.id].filter(Boolean) as string[];
  const openTournament = tournaments.find((t) => t.status === "registration" && !regs.some((r) => r.tournament_id === t.id && isActiveRegistration(r)));
  const teamSize = openTournament ? modeOf(openTournament.format).size : 5;

  // ── текущее действие: срочное из глобальной активности, иначе — следующий шаг пути игрока
  let current: Current | null = null;
  const top = activity.top;
  if (top) {
    const copy = ACTIVITY_COPY[top.kind];
    current = {
      tone: top.tone,
      eyebrow: copy.eyebrow,
      title: top.detail,
      text: copy.text,
      cta: { href: top.href, label: copy.cta },
      deadline: top.deadline,
      connect: top.connect,
    };
  } else if (next && next.status === "veto") {
    current = { tone: "accent", eyebrow: "Вето карт", title: `${next.team1?.name} vs ${next.team2?.name}`, text: "Капитаны выбирают карты. Дальше — подготовка сервера.", cta: { href: `/matches/${next.id}`, label: "Смотреть вето" } };
  } else if (next && next.status === "ready") {
    current = { tone: "warn", eyebrow: "Готовим сервер", title: `${next.team1?.name} vs ${next.team2?.name}`, text: "Вето закончено. Как только сервер будет готов, здесь появится кнопка подключения.", cta: { href: `/matches/${next.id}`, label: "Открыть матч" } };
  } else if (next && next.status === "upcoming") {
    current = {
      tone: "accent",
      eyebrow: "Соперник известен",
      title: `${next.team1?.name} vs ${next.team2?.name}`,
      text: next.scheduled_at ? `Начало — ${formatDateTime(next.scheduled_at)}.` : nextEta ? `Примерно в ${formatTime(new Date(nextEta).toISOString())}.` : "Время матча появится, когда освободится сервер.",
      cta: { href: `/matches/${next.id}`, label: "Открыть матч" },
    };
  } else if (activeRegs.some((r) => r.status === "approved" && r.tournament.status === "live")) {
    // турнир идёт, а следующего матча нет: команда ждёт соперника или уже закончила — не обещаем матч
    const r = activeRegs.find((x) => x.status === "approved" && x.tournament.status === "live")!;
    current = {
      tone: "neutral",
      eyebrow: "Турнир идёт",
      title: r.tournament.name,
      text: "Следите за сеткой. Если для вашей команды появится следующий матч, он появится здесь и в уведомлениях.",
      cta: { href: `/tournaments/${r.tournament.slug}?tab=bracket`, label: "Открыть сетку" },
    };
  } else if (activeRegs.some((r) => r.status === "approved" && r.checked_in_at && r.tournament.status === "checkin")) {
    const r = activeRegs.find((x) => x.checked_in_at && x.tournament.status === "checkin")!;
    current = { tone: "ok", eyebrow: "Check-in пройден", title: r.tournament.name, text: "Сетку опубликуют после закрытия check-in — сообщим, когда соперник будет известен.", cta: { href: `/tournaments/${r.tournament.slug}`, label: "Страница турнира" } };
  } else if (activeRegs.some((r) => r.status === "approved" && ["registration", "registration_closed", "checkin"].includes(r.tournament.status))) {
    const r = activeRegs.find((x) => x.status === "approved" && ["registration", "registration_closed", "checkin"].includes(x.tournament.status))!;
    current = {
      tone: "ok",
      eyebrow: "Вы участвуете",
      title: r.tournament.name,
      text: r.tournament.checkin_opens_at ? `Дальше: check-in ${formatDateTime(r.tournament.checkin_opens_at)}${r.tournament.checkin_closes_at ? `–${formatTime(r.tournament.checkin_closes_at)}` : ""}.` : "Дальше: check-in перед стартом — мы напомним.",
      cta: { href: `/tournaments/${r.tournament.slug}`, label: "Страница турнира" },
    };
  } else if (activeRegs.some((r) => r.status === "pending")) {
    const r = activeRegs.find((x) => x.status === "pending")!;
    current = { tone: "warn", eyebrow: "Заявка на рассмотрении", title: r.tournament.name, text: `Отправлена ${formatDateTime(r.created_at)}. Администратор рассмотрит её до check-in.`, cta: { href: `/tournaments/${r.tournament.slug}`, label: "Страница турнира" } };
  } else if (rejected) {
    current = {
      tone: "danger",
      eyebrow: "Заявку нужно исправить",
      title: rejected.tournament.name,
      text: rejected.note ? `Причина: ${rejected.note}` : "Администратор отклонил заявку. Проверьте состав и подайте снова, пока открыта регистрация.",
      cta: isCaptain || solo ? { href: `/tournaments/${rejected.tournament.slug}/register`, label: "Исправить заявку" } : undefined,
    };
  } else if (!membership && !solo) {
    current = {
      tone: "neutral",
      eyebrow: "Добро пожаловать",
      title: `${player.nickname}, с чего начнём?`,
      text: "Для турнира нужна команда: создайте свою и пригласите друзей — или найдите команду, которой нужен игрок.",
      cta: { href: "/tournaments", label: "Найти турнир" },
      secondary: [
        { href: "/team/create", label: "Создать команду" },
        { href: "/find", label: "Найти команду" },
      ],
      steps: [
        { title: "Steam", state: "done" },
        { title: "Команда", state: "current" },
        { title: "Турнир", state: "todo" },
        { title: "Матч", state: "todo" },
      ],
    };
  } else if (membership && isCaptain && mains < teamSize) {
    current = {
      tone: "warn",
      eyebrow: "Состав неполный",
      title: `${membership.team.name} · основной состав: ${mains} из ${teamSize}`,
      text: `В основу нужно ещё ${teamSize - mains}. Отправьте игрокам ссылку-приглашение${members.length > mains ? " или переведите запасного в основу" : ""}.`,
      cta: { href: "/team", label: "Пригласить игроков" },
    };
  } else if (openTournament && (isCaptain || solo)) {
    current = {
      tone: "accent",
      eyebrow: "Регистрация открыта",
      title: openTournament.name,
      text: openTournament.registration_closes_at ? `Заявки принимаются до ${formatDateTime(openTournament.registration_closes_at)}.` : "Подайте заявку, пока есть места.",
      cta: { href: `/tournaments/${openTournament.slug}/register`, label: "Подать заявку" },
    };
  } else if (openTournament) {
    current = { tone: "neutral", eyebrow: "Регистрация открыта", title: openTournament.name, text: "Заявку на турнир подаёт капитан команды.", cta: { href: `/tournaments/${openTournament.slug}`, label: "Страница турнира" } };
  }

  return (
    <>
      <LiveRefresh watch="matches" intervalMs={5000} />
      <Container className="pt-8 sm:pt-10">
        {/* ── шапка игрока */}
        <header className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Avatar src={player.avatar_url} name={player.nickname} size="lg" />
          <div className="min-w-0 flex-1">
            <Eyebrow>Моя игра</Eyebrow>
            <h1 className="mt-1 truncate text-page text-fg">{player.nickname}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-2">
              <span className="inline-flex items-center gap-2">
                <FaceitLevel level={player.faceit_level} />
                {player.faceit_elo ? <span className="num">{player.faceit_elo} ELO</span> : <span className="text-fg-3">FACEIT не найден</span>}
              </span>
              {membership && (
                <Link href="/team" className="inline-flex items-center gap-2 hover:text-fg">
                  <TeamLogo src={membership.team.logo_url} tag={membership.team.tag} size="xs" />
                  {membership.team.name}
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={refreshProfile} inline>
              <SubmitButton variant="ghost" size="sm" pendingText="Обновляем…">
                <RefreshCw className="mr-1.5 size-4" />
                Обновить Steam и FACEIT
              </SubmitButton>
            </ActionForm>
            <Button href={`/players/${player.steam_id}`} variant="secondary" size="sm" icon={<User />}>
              Публичный профиль
            </Button>
          </div>
        </header>

        {/* ── текущее действие — главное на странице */}
        {current && <CurrentActivity c={current} />}

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
          <div className="min-w-0 space-y-12">
            {next && (
              <Section title="Ближайший матч" action={<Status info={tournamentStatus[next.tournament.status]} size="sm" />}>
                <RowList>
                  <MatchListRow m={next} highlight={myTeamIds.find((id) => id === next.team1_id || id === next.team2_id)} meta={`${next.tournament.name} · BO${next.best_of}`} />
                </RowList>
              </Section>
            )}

            <Section title="Турниры" action={<Link href="/tournaments" className="text-meta font-medium text-accent hover:text-accent-strong">Все турниры →</Link>}>
              {activeRegs.length ? (
                <RowList>
                  {activeRegs.map((r) => (
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
                      {r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at && (isCaptain || solo) && (
                        <Button href={`/tournaments/${r.tournament.slug}/checkin`} size="sm">
                          Check-in
                        </Button>
                      )}
                    </div>
                  ))}
                </RowList>
              ) : (
                <EmptyState compact icon={<Trophy />} title="Нет активных заявок" text="Здесь появится турнир, в котором вы участвуете." action={<Button href="/tournaments" variant="secondary" size="sm">Смотреть турниры</Button>} />
              )}
            </Section>

            <Section title="Команда">
              {membership ? (
                <Panel padded={false}>
                  <Link href="/team" className="flex items-center gap-4 rounded-surface p-4 transition-colors hover:bg-surface-2 sm:p-5">
                    <TeamLogo src={membership.team.logo_url} tag={membership.team.tag} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-title text-fg">{membership.team.name}</div>
                      <div className="text-meta text-fg-3">
                        {isCaptain ? "Вы капитан" : "Вы игрок"} · основа {mains}
                        {members.length > mains ? ` · запас ${members.length - mains}` : ""}
                      </div>
                    </div>
                    <div className="hidden -space-x-1.5 sm:flex">
                      {members.slice(0, 7).map((m) => (
                        <span key={m.id} className="rounded-full ring-2 ring-surface">
                          <Avatar src={m.player.avatar_url} name={m.player.nickname} size="xs" />
                        </span>
                      ))}
                    </div>
                    <ArrowRight className="size-4 text-fg-3" aria-hidden />
                  </Link>
                </Panel>
              ) : (
                <EmptyState
                  compact
                  icon={<Users />}
                  title="Вы пока не в команде"
                  text="Создайте свою, попросите капитана прислать приглашение или разместите объявление."
                  action={
                    <>
                      <Button href="/team/create" size="sm">
                        Создать команду
                      </Button>
                      <Button href="/find" variant="secondary" size="sm">
                        Найти команду
                      </Button>
                    </>
                  }
                />
              )}
            </Section>

            <Section title="Последние матчи">
              {recent.length || upcoming.length > 1 ? (
                <RowList>
                  {[...upcoming.filter((m) => m.id !== next?.id), ...recent].slice(0, 8).map((m) => (
                    <MatchListRow key={m.id} m={m} highlight={myTeamIds.find((id) => id === m.team1_id || id === m.team2_id)} meta={m.tournament.name} />
                  ))}
                </RowList>
              ) : (
                <EmptyState compact icon={<Gamepad2 />} title="Матчей пока нет" text="Ваши матчи появятся здесь после публикации сетки турнира." />
              )}
            </Section>
          </div>

          {/* ── уведомления */}
          <aside id="notifications" className="scroll-mt-24 lg:sticky lg:top-[calc(var(--shell-h)+24px)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-heading text-fg">
                Уведомления
                {unread > 0 && <span className="num ml-2 rounded-chip bg-accent-dim px-1.5 align-middle text-micro text-accent">{unread}</span>}
              </h2>
              <div className="flex items-center gap-3">
                {unread > 0 && <MarkAllReadButton size="sm" />}
                <Link href="/notifications" className="text-meta font-medium text-accent hover:text-accent-strong">
                  Все →
                </Link>
              </div>
            </div>
            {notifications.length === 0 ? (
              <p className="rounded-surface border border-dashed border-line px-4 py-6 text-meta text-fg-3">Уведомлений нет — здесь появятся приглашения, заявки, вето и готовность сервера.</p>
            ) : (
              <div className="divide-y divide-line-subtle rounded-surface border border-line-subtle bg-surface px-4">
                {notifications.map((n) => (
                  <NotificationItem key={n.id} n={n} compact />
                ))}
              </div>
            )}
          </aside>
        </div>
      </Container>
    </>
  );
}

function CurrentActivity({ c }: { c: Current }) {
  const body = (
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <Eyebrow tone={c.tone === "neutral" ? "muted" : c.tone === "danger" ? "live" : c.tone}>{c.eyebrow}</Eyebrow>
        <div className="mt-2 break-words text-heading text-fg">{c.title}</div>
        <p className="mt-1.5 max-w-read text-[14px] leading-relaxed text-fg-2">{c.text}</p>
        {c.steps && <Steps direction="horizontal" steps={c.steps} className="mt-5 max-w-md" />}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-col md:items-end">
        {c.deadline && (
          <div className="text-right">
            <div className="text-micro text-fg-3">Осталось</div>
            <Timer deadline={c.deadline} className="text-[28px] font-semibold" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {c.connect && (
            <a href={`steam://connect/${c.connect}`} className={buttonClass("primary", "lg")}>
              <Gamepad2 className="size-4" />
              Подключиться
            </a>
          )}
          {c.cta && (
            <Button href={c.cta.href} size="lg" variant={c.connect ? "secondary" : "primary"} iconRight={<ArrowRight />}>
              {c.cta.label}
            </Button>
          )}
          {c.secondary?.map((s) => (
            <Button key={s.href} href={s.href} size="lg" variant="secondary">
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <section aria-label="Текущее действие" className="mt-8">
      {c.tone === "neutral" ? <Panel className="p-5 sm:p-7">{body}</Panel> : <CriticalSurface tone={c.tone}>{body}</CriticalSurface>}
    </section>
  );
}
