import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { joinTeam } from "@/app/actions/team";
import { getCurrentPlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getLockingTournament, getTeamByInvite, getTeamMembers } from "@/lib/data";
import { needsProfile } from "@/lib/profiles";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ProfileRequired } from "@/components/profile/profile-required";
import { Button, Callout, Container, EmptyState } from "@/components/ds";
import { SteamMark } from "@/components/ds/icons";
import { HelpHint } from "@/components/help-hint";
import { TeamOfferCard } from "@/components/team/team-offer";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Приглашение в команду", robots: { index: false } };

export default async function JoinPage(props: PageProps<"/join/[code]">) {
  const t = await getT();
  const { code } = await props.params;
  const team = await getTeamByInvite(code);

  if (!team) {
    return (
      <Container width="read" className="flex min-h-[calc(100dvh-var(--shell-h))] items-center py-12">
        <h1 className="sr-only">{t("Приглашение в команду")}</h1>
        <EmptyState
          className="w-full"
          icon={<Link2Off />}
          title={t("Ссылка больше не действует")}
          text={t("Возможно, капитан команды создал новую ссылку или команда распущена. Попросите у капитана актуальное приглашение.")}
          action={
            <>
              <Button href="/find" variant="secondary" size="sm">
                {t("Найти команду")}
              </Button>
              <Button href="/teams" variant="ghost" size="sm">
                {t("Все команды")}
              </Button>
            </>
          }
        />
      </Container>
    );
  }

  const [player, members, locked] = await Promise.all([getCurrentPlayer(), getTeamMembers(team.id), getLockingTournament(team.id)]);
  const membership = player ? await getActiveMembership(player.id) : null;
  const gated = player && !membership ? await needsProfile(player.id) : false;
  const mains = members.filter((m) => m.role !== "substitute").length;
  const full = members.length >= MAX_MAIN + MAX_SUBS;
  const next = `/join/${code}`;

  // что мешает вступить (если мешает) — показываем вместо кнопки, с объяснением
  const blocker: { title: string; text: string } | null = !player
    ? null
    : player.is_banned
      ? { title: t("Ваш аккаунт заблокирован"), text: t("Вступить в команду нельзя. Если это ошибка — напишите администратору.") }
      : membership && membership.team.id !== team.id
        ? { title: t("Вы уже в команде {name}", { name: membership.team.name }), text: t("Чтобы вступить сюда, сначала покиньте текущую команду в её настройках.") }
        : locked
          ? { title: t("Состав заблокирован турниром"), text: t("Команда играет в «{name}» — до конца турнира новых игроков принимает только администратор.", { name: locked.name }) }
          : full
            ? { title: t("В команде нет свободных мест"), text: t("Основа и запас заполнены ({a} + {b}). Попросите капитана освободить место.", { a: MAX_MAIN, b: MAX_SUBS }) }
            : null;

  return (
    <Container width="read" className="flex min-h-[calc(100dvh-var(--shell-h))] items-center py-12">
      <TeamOfferCard team={team} members={members} eyebrow={t("Вас приглашают в команду")} maxMain={MAX_MAIN} maxSubs={MAX_SUBS}>
        {!player ? (
          <>
            <a href={`/api/auth/steam?next=${encodeURIComponent(next)}`} className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-control bg-accent px-6 text-[15px] font-semibold text-accent-ink hover:bg-accent-strong">
              <SteamMark className="size-5" />
              {t("Продолжить через Steam")}
            </a>
            <p className="mt-3 text-center text-meta text-fg-3">{t("После входа вернём вас на это приглашение.")}</p>
          </>
        ) : membership?.team.id === team.id ? (
          <Button href="/team" block size="lg">
            {t("Вы уже в этой команде — открыть штаб")}
          </Button>
        ) : blocker ? (
          <Callout tone="warn" title={blocker.title}>
            {blocker.text}
          </Callout>
        ) : gated ? (
          <ProfileRequired next={next} action={t("вступить в команду")} />
        ) : (
          <ActionForm action={joinTeam}>
            <input type="hidden" name="code" value={code} />
            <SubmitButton size="lg" pendingText={t("Вступаем…")} className="w-full">
              {t("Вступить в {name}", { name: team.name })}
            </SubmitButton>
            <p className="mt-3 text-center text-meta text-fg-3">{mains < MAX_MAIN ? t("Вы попадёте в основной состав.") : t("Основа заполнена — вы попадёте в запас.")}</p>
          </ActionForm>
        )}
        <Button href="/" variant="ghost" block className="mt-2">
          {t("Отказаться")}
        </Button>
        <HelpHint topics={["join-team"]} className="mt-6" />
      </TeamOfferCard>
    </Container>
  );
}
