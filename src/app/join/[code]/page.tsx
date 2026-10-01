import type { Metadata } from "next";
import { joinTeam } from "@/app/actions/team";
import { getCurrentPlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getTeamByInvite, getTeamMembers } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, ButtonLink, Container, EmptyState, IconSteam, Notice, TeamLogo, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Приглашение в команду" };

export default async function JoinPage(props: PageProps<"/join/[code]">) {
  const { code } = await props.params;
  const team = await getTeamByInvite(code);

  if (!team) {
    return (
      <Container size="form" className="py-24">
        <EmptyState
          title="Ссылка недействительна"
          description="Возможно, капитан создал новую ссылку или команда распущена. Попросите актуальное приглашение."
          action={
            <ButtonLink href="/" variant="secondary">
              На главную
            </ButtonLink>
          }
        />
      </Container>
    );
  }

  const [player, members] = await Promise.all([getCurrentPlayer(), getTeamMembers(team.id)]);
  const membership = player ? await getActiveMembership(player.id) : null;
  const full = members.length >= MAX_MAIN + MAX_SUBS;
  const captain = members.find((m) => m.role === "captain");

  return (
    <Container className="flex min-h-[calc(100vh-68px)] items-center justify-center py-16">
      <div className="w-full max-w-[420px] text-center">
        <div className="flex justify-center">
          <TeamLogo src={team.logo_url} tag={team.tag} size={88} />
        </div>
        <div className="mt-8 text-sm text-fg-3">Вас пригласили в команду</div>
        <h1 className="mt-2 text-[36px] font-bold tracking-[-0.035em] leading-tight">{team.name}</h1>
        {captain && (
          <div className="mt-3 inline-flex items-center gap-2 text-sm text-fg-3">
            <Avatar src={captain.player.avatar_url} name={captain.player.nickname} size={20} />
            Капитан <span className="text-fg-2">{captain.player.nickname}</span>
          </div>
        )}
        <div className="mt-8 flex justify-center -space-x-1.5">
          {members.map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-bg">
              <Avatar src={m.player.avatar_url} name={m.player.nickname} size={32} />
            </span>
          ))}
          {Array.from({ length: Math.max(0, MAX_MAIN - members.length) }, (_, i) => (
            <span key={i} className="size-8 rounded-full border border-dashed border-white/15 bg-bg" />
          ))}
        </div>
        <div className="mt-2 text-xs text-fg-3 num">
          {members.length} / {MAX_MAIN}
          {members.length > MAX_MAIN ? ` + ${members.length - MAX_MAIN}` : ""}
        </div>

        <div className="mt-10 text-left">
          {!player ? (
            <a href={`/api/auth/steam?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonClass("primary", "lg", "w-full")}>
              <IconSteam className="size-5" />
              Войти через Steam
            </a>
          ) : membership?.team.id === team.id ? (
            <ButtonLink href="/team" className="w-full" size="lg">
              Вы уже в этой команде
            </ButtonLink>
          ) : membership ? (
            <Notice tone="warn">Вы уже состоите в команде {membership.team.name}. Чтобы вступить сюда, сначала покиньте её.</Notice>
          ) : full ? (
            <Notice tone="warn">В команде нет свободных мест.</Notice>
          ) : (
            <ActionForm action={joinTeam}>
              <input type="hidden" name="code" value={code} />
              <SubmitButton size="lg" className="w-full">
                Вступить
              </SubmitButton>
            </ActionForm>
          )}
          <ButtonLink href="/" variant="ghost" className="mt-3 w-full">
            Назад
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
