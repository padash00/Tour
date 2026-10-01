import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsRead, refreshProfile } from "@/app/actions/profile";
import { isAdmin, requirePlayer } from "@/lib/auth";
import { getActiveMembership, getTeamMembers, getTeamRegistrations, isActiveRegistration } from "@/lib/data";
import { formatDateTime, registrationStatusLabel } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TournamentStatusPill } from "@/components/tournament-bits";
import {
  Avatar,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  FaceitLevel,
  IconBell,
  Pill,
  SectionTitle,
  TeamLogo,
  buttonClass,
  cn,
} from "@/components/ui";

export const metadata: Metadata = { title: "Личный кабинет" };

export default async function MePage() {
  const player = await requirePlayer("/me");
  const membership = await getActiveMembership(player.id);
  const [members, regs, notificationsRes] = await Promise.all([
    membership ? getTeamMembers(membership.team.id) : Promise.resolve([]),
    membership ? getTeamRegistrations(membership.team.id) : Promise.resolve([]),
    db().from("notifications").select("*").eq("player_id", player.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const notifications = (notificationsRes.data ?? []) as Notification[];
  const unread = notifications.filter((n) => !n.read_at).length;
  const activeRegs = regs.filter((r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status));
  const isCaptain = membership?.team.captain_id === player.id;

  return (
    <Container>
      <div className="flex flex-col md:flex-row md:items-center gap-6 pt-12 pb-10">
        <Avatar src={player.avatar_url} name={player.nickname} size={72} />
        <div className="flex-1">
          <div className="label">Личный кабинет</div>
          <h1 className="mt-1.5 text-3xl md:text-4xl font-bold tracking-[-0.03em]">{player.nickname}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg-3">
            <span className="num">{player.steam_id}</span>
            <span className="inline-flex items-center gap-2">
              <FaceitLevel level={player.faceit_level} />
              {player.faceit_elo ? <span className="num">{player.faceit_elo} ELO</span> : "FACEIT не найден"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={refreshProfile}>
            <SubmitButton variant="secondary" pendingText="Обновляем…">
              Обновить Steam и FACEIT
            </SubmitButton>
          </ActionForm>
          <ButtonLink href={`/players/${player.steam_id}`} variant="ghost">
            Публичный профиль
          </ButtonLink>
          <form action="/api/auth/logout" method="post">
            <button className={buttonClass("ghost")}>Выйти</button>
          </form>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <section>
            <SectionTitle title="Моя команда" />
            {membership ? (
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <TeamLogo src={membership.team.logo_url} tag={membership.team.tag} size={56} />
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{membership.team.name}</div>
                    <div className="text-sm text-fg-3">
                      {isCaptain ? "Вы капитан" : "Вы игрок"} · {members.length} в составе
                    </div>
                  </div>
                  <ButtonLink href="/team" variant="secondary">
                    Управлять
                  </ButtonLink>
                </div>
                <div className="mt-5 flex -space-x-2">
                  {members.map((m) => (
                    <div key={m.id} className="ring-2 ring-surface rounded-lg">
                      <Avatar src={m.player.avatar_url} name={m.player.nickname} size={32} />
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState
                compact
                title="Вы пока не в команде"
                description="Создайте свою или попросите капитана прислать приглашение."
                action={<ButtonLink href="/team/create">Создать команду</ButtonLink>}
              />
            )}
          </section>

          <section>
            <SectionTitle title="Турниры" />
            {activeRegs.length > 0 ? (
              <div className="grid gap-3">
                {activeRegs.map((r) => (
                  <Card key={r.id} className="p-5 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Link href={`/tournaments/${r.tournament.slug}`} className="font-semibold hover:text-accent">
                        {r.tournament.name}
                      </Link>
                      <div className="text-xs text-fg-3 mt-1">Старт {formatDateTime(r.tournament.starts_at)}</div>
                    </div>
                    <TournamentStatusPill status={r.tournament.status} />
                    <Pill tone={r.status === "approved" ? "ok" : "warn"}>{registrationStatusLabel[r.status]}</Pill>
                    {r.tournament.status === "checkin" && r.status === "approved" && !r.checked_in_at && isCaptain && (
                      <ButtonLink href={`/tournaments/${r.tournament.slug}/checkin`} size="sm">
                        Check-in
                      </ButtonLink>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="Нет активных заявок"
                action={<ButtonLink href="/tournaments" variant="secondary">Смотреть турниры</ButtonLink>}
              />
            )}
          </section>

          <section>
            <SectionTitle title="Ближайшие матчи" />
            <EmptyState compact title="Матчей пока нет" description="Ваши матчи появятся здесь после публикации сетки." />
          </section>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <section id="notifications" className="scroll-mt-24">
            <SectionTitle
              title="Уведомления"
              action={
                unread > 0 ? (
                  <ActionForm action={markNotificationsRead}>
                    <SubmitButton variant="ghost" size="sm">
                      Прочитать все
                    </SubmitButton>
                  </ActionForm>
                ) : null
              }
            />
            {notifications.length === 0 ? (
              <EmptyState compact icon={<IconBell />} title="Уведомлений нет" />
            ) : (
              <Card className="divide-y divide-line">
                {notifications.map((n) => {
                  const inner = (
                    <>
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", n.read_at ? "bg-transparent" : "bg-accent")} />
                        <div className="min-w-0">
                          <div className={cn("text-sm", n.read_at ? "text-fg-2" : "text-fg font-medium")}>{n.title}</div>
                          {n.body && <div className="text-xs text-fg-3 mt-1">{n.body}</div>}
                          <div className="text-[11px] text-fg-3 mt-1.5">{formatDateTime(n.created_at)}</div>
                        </div>
                      </div>
                    </>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} className="block p-4 hover:bg-white/[0.02]">
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className="p-4">
                      {inner}
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          <Card className="p-6">
            <div className="label mb-4">Быстрые ссылки</div>
            <div className="grid gap-1 text-sm">
              <Link href="/tournaments" className="py-1.5 text-fg-2 hover:text-fg">Турниры →</Link>
              <Link href="/team" className="py-1.5 text-fg-2 hover:text-fg">Моя команда →</Link>
              <Link href="/rules" className="py-1.5 text-fg-2 hover:text-fg">Правила →</Link>
              {isAdmin(player) && <Link href="/admin" className="py-1.5 text-accent">Админ-панель →</Link>}
            </div>
          </Card>
        </div>
      </div>
    </Container>
  );
}
