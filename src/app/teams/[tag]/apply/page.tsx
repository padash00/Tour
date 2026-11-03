import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { applyToTeam, withdrawApplication } from "@/app/actions/applications";
import { getCurrentPlayer } from "@/lib/auth";
import { APPLICATION_COOLDOWN_HOURS, APPLICATION_TTL_DAYS, freshSince, getOwnApplication, getPlayerApplications } from "@/lib/applications";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getTeamByTag, getTeamMembers } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { needsProfile } from "@/lib/profiles";
import { ActionForm, SubmitButton } from "@/components/forms";
import { HelpHint } from "@/components/help-hint";
import { TeamOfferCard } from "@/components/team/team-offer";
import { ProfileRequired } from "@/components/profile/profile-required";
import { Button, Callout, Container, Field, Textarea } from "@/components/ds";
import { SteamMark } from "@/components/ds/icons";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Заявка в команду", robots: { index: false } };

export default async function ApplyPage(props: PageProps<"/teams/[tag]/apply">) {
  const t = await getT();
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team || team.is_solo) notFound();

  const [player, members] = await Promise.all([getCurrentPlayer(), getTeamMembers(team.id)]);
  const [membership, own, mine, gated] = player
    ? await Promise.all([getActiveMembership(player.id), getOwnApplication(team.id, player.id), getPlayerApplications(player.id), needsProfile(player.id)])
    : [null, null, [], false];
  const mains = members.filter((m) => m.role !== "substitute").length;
  const full = members.length >= MAX_MAIN + MAX_SUBS;
  const next = `/teams/${encodeURIComponent(team.tag)}/apply`;
  const pending = own?.status === "pending" && own.created_at > freshSince() ? own : null;
  const cooldownUntil =
    own?.status === "declined" && own.decided_at ? new Date(new Date(own.decided_at).getTime() + APPLICATION_COOLDOWN_HOURS * 3_600_000) : null;
  const waiting = mine.filter((a) => a.status === "pending").length;

  // что мешает подать заявку — показываем вместо формы, с объяснением
  const blocker: { title: string; text: string } | null = !player
    ? null
    : player.is_banned
      ? { title: t("Ваш аккаунт заблокирован"), text: t("Подать заявку нельзя. Если это ошибка — напишите администратору.") }
      : membership
        ? membership.team.id === team.id
          ? { title: t("Вы уже в этой команде"), text: t("Заявка не нужна.") }
          : { title: t("Вы уже в команде {name}", { name: membership.team.name }), text: t("Чтобы подать заявку сюда, сначала покиньте текущую команду в её настройках.") }
        : !team.accepts_applications
          ? { title: t("Команда не принимает заявки"), text: t("Капитан закрыл приём заявок. Можно попросить у него ссылку-приглашение.") }
          : full
            ? { title: t("В команде нет свободных мест"), text: t("Основа и запас заполнены ({a} + {b}).", { a: MAX_MAIN, b: MAX_SUBS }) }
            : cooldownUntil && cooldownUntil.getTime() > serverNow()
              ? { title: t("Капитан отклонил вашу заявку"), text: t("Подать заявку снова можно после {date}.", { date: formatDateTime(cooldownUntil.toISOString(), t.lang) }) }
              : null;

  return (
    <Container width="read" className="pb-16 pt-6 sm:pt-8">
      <Link href={`/teams/${encodeURIComponent(team.tag)}`} className="-ml-1 inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> {team.name}
      </Link>
      <div className="mt-3">
        <TeamOfferCard team={team} members={members} eyebrow={t("Заявка на вступление")} maxMain={MAX_MAIN} maxSubs={MAX_SUBS}>
          {!player ? (
            <>
              <a href={`/api/auth/steam?next=${encodeURIComponent(next)}`} className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-control bg-accent px-6 text-[15px] font-semibold text-accent-ink hover:bg-accent-strong">
                <SteamMark className="size-5" />
                {t("Войти через Steam")}
              </a>
              <p className="mt-3 text-center text-meta text-fg-3">{t("После входа вернём вас на эту страницу.")}</p>
            </>
          ) : pending ? (
            <Callout tone="info" title={t("Заявка отправлена — ждём решения капитана")}>
              {t("Подана {date}", { date: formatDateTime(pending.created_at, t.lang) })}
              {pending.message ? <> · «{pending.message}»</> : null}. {t("Ответ придёт уведомлением. Заявка действует {n} дней.", { n: APPLICATION_TTL_DAYS })}
              <ActionForm action={withdrawApplication} className="mt-3">
                <input type="hidden" name="applicationId" value={pending.id} />
                <SubmitButton variant="ghost" size="sm" confirm={t("Отозвать заявку?")} pendingText={t("Отзываем…")}>
                  {t("Отозвать заявку")}
                </SubmitButton>
              </ActionForm>
            </Callout>
          ) : blocker ? (
            <Callout tone="warn" title={blocker.title}>
              {blocker.text}
            </Callout>
          ) : gated ? (
            <ProfileRequired next={next} action={t("подать заявку в команду")} />
          ) : (
            <ActionForm action={applyToTeam}>
              <input type="hidden" name="teamId" value={team.id} />
              <Field label={t("Сообщение капитану")} hint={t("Необязательно: роль, опыт, когда можете играть. До 200 символов.")}>
                <Textarea name="message" maxLength={200} placeholder={t("Например: AWP, FACEIT 7, играю по вечерам")} />
              </Field>
              <SubmitButton size="lg" pendingText={t("Отправляем…")} className="mt-4 w-full">
                {t("Подать заявку")}
              </SubmitButton>
              <p className="mt-3 text-center text-meta text-fg-3">
                {waiting > 0 ? `${t("Вы ждёте ответа ещё от {count}.", { count: `${waiting} ${t.plural(waiting, "команды", "команд", "команд")}` })} ` : ""}
                {mains < MAX_MAIN ? t("Примут — вы попадёте в основной состав, остальные заявки отменятся.") : t("Примут — вы попадёте в запас, остальные заявки отменятся.")}
              </p>
            </ActionForm>
          )}
        </TeamOfferCard>
      </div>
      <HelpHint topics={["join-team"]} className="mt-6" />
      {player && !membership && (
        <div className="mt-4 text-center">
          <Button href="/team" variant="ghost" size="sm">
            {t("Все мои заявки")}
          </Button>
        </div>
      )}
    </Container>
  );
}

/** Время сервера на момент отрисовки (динамическая страница) */
function serverNow() {
  return Date.now();
}
