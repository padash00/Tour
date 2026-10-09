import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { joinTeam } from "@/app/actions/team";
import { getCurrentPlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getLockingTournament, getTeamByInvite, getTeamMembers } from "@/lib/data";
import { needsProfile } from "@/lib/profiles";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ProfileRequired } from "@/components/profile/profile-required";
import { Avatar, Button, Callout, Container, EmptyState, Eyebrow, TeamLogo } from "@/components/ds";
import { SteamMark } from "@/components/ds/icons";
import { HelpHint } from "@/components/help-hint";

export const metadata: Metadata = { title: "Приглашение в команду" };

export default async function JoinPage(props: PageProps<"/join/[code]">) {
  const { code } = await props.params;
  const team = await getTeamByInvite(code);

  if (!team) {
    return (
      <Container width="read" className="flex min-h-[calc(100dvh-var(--shell-h))] items-center py-12">
        <h1 className="sr-only">Приглашение в команду</h1>
        <EmptyState
          className="w-full"
          icon={<Link2Off />}
          title="Ссылка больше не действует"
          text="Возможно, капитан команды создал новую ссылку или команда распущена. Попросите у капитана актуальное приглашение."
          action={
            <>
              <Button href="/find" variant="secondary" size="sm">
                Найти команду
              </Button>
              <Button href="/teams" variant="ghost" size="sm">
                Все команды
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
  const captain = members.find((m) => m.role === "captain");
  const next = `/join/${code}`;

  // что мешает вступить (если мешает) — показываем вместо кнопки, с объяснением
  const blocker: { title: string; text: string } | null = !player
    ? null
    : player.is_banned
      ? { title: "Ваш аккаунт заблокирован", text: "Вступить в команду нельзя. Если это ошибка — напишите администратору." }
      : membership && membership.team.id !== team.id
        ? { title: `Вы уже в команде ${membership.team.name}`, text: "Чтобы вступить сюда, сначала покиньте текущую команду в её настройках." }
        : locked
          ? { title: "Состав заблокирован турниром", text: `Команда играет в «${locked.name}» — до конца турнира новых игроков принимает только администратор.` }
          : full
            ? { title: "В команде нет свободных мест", text: `Основа и запас заполнены (${MAX_MAIN} + ${MAX_SUBS}). Попросите капитана освободить место.` }
            : null;

  return (
    <Container width="read" className="flex min-h-[calc(100dvh-var(--shell-h))] items-center py-12">
      <div className="w-full rounded-feature border border-line-subtle bg-surface p-6 text-center sm:p-10">
        <div className="flex justify-center">
          <TeamLogo src={team.logo_url} tag={team.tag} size="xl" />
        </div>
        <Eyebrow className="mt-6 block">Вас приглашают в команду</Eyebrow>
        <h1 className="mt-2 break-words text-page text-fg">{team.name}</h1>
        {captain && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-meta text-fg-3">
            <Avatar src={captain.player.avatar_url} name={captain.player.nickname} size="xs" />
            Капитан <span className="text-fg-2">{captain.player.nickname}</span>
          </div>
        )}
        <div className="mt-6 flex justify-center -space-x-1.5">
          {members.map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-surface">
              <Avatar src={m.player.avatar_url} name={m.player.nickname} size="sm" />
            </span>
          ))}
          {Array.from({ length: Math.max(0, MAX_MAIN - mains) }, (_, i) => (
            <span key={i} className="size-8 rounded-full border border-dashed border-line-strong bg-surface" />
          ))}
        </div>
        <div className="num mt-2 text-meta text-fg-3">
          Основа {mains} / {MAX_MAIN}
          {members.length > mains ? ` · запас ${members.length - mains}` : ""}
        </div>

        <div className="mt-8 text-left">
          {!player ? (
            <>
              <a href={`/api/auth/steam?next=${encodeURIComponent(next)}`} className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-control bg-accent px-6 text-[15px] font-semibold text-accent-ink hover:bg-accent-strong">
                <SteamMark className="size-5" />
                Продолжить через Steam
              </a>
              <p className="mt-3 text-center text-meta text-fg-3">После входа вернём вас на это приглашение.</p>
            </>
          ) : membership?.team.id === team.id ? (
            <Button href="/team" block size="lg">
              Вы уже в этой команде — открыть штаб
            </Button>
          ) : blocker ? (
            <Callout tone="warn" title={blocker.title}>
              {blocker.text}
            </Callout>
          ) : gated ? (
            <ProfileRequired next={next} action="вступить в команду" />
          ) : (
            <ActionForm action={joinTeam}>
              <input type="hidden" name="code" value={code} />
              <SubmitButton size="lg" pendingText="Вступаем…" className="w-full">
                Вступить в {team.name}
              </SubmitButton>
              <p className="mt-3 text-center text-meta text-fg-3">{mains < MAX_MAIN ? "Вы попадёте в основной состав." : "Основа заполнена — вы попадёте в запас."}</p>
            </ActionForm>
          )}
          <Button href="/" variant="ghost" block className="mt-2">
            Отказаться
          </Button>
          <HelpHint topics={["join-team"]} className="mt-6" />
        </div>
      </div>
    </Container>
  );
}
