import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getLockingTournament, getTeamMembers, getTeamRegistrations, isActiveRegistration } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { DangerZone, type DangerBlock } from "@/components/team/danger-zone";
import { InviteButton } from "@/components/team/invite";
import { ApplicationsToggle } from "@/components/team/applications-toggle";
import { TeamEditor } from "@/components/team/team-editor";
import { TeamHeader } from "@/components/team/team-header";
import { HelpHint } from "@/components/help-hint";
import { Container, Panel, Section, Stack } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Настройки команды", robots: { index: false } };

export default async function TeamSettingsPage() {
  const t = await getT();
  const player = await requirePlayer("/team/settings");
  const membership = await getActiveMembership(player.id);
  if (!membership) redirect("/team");
  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, origin, locked, regs] = await Promise.all([getTeamMembers(team.id), siteOrigin(), getLockingTournament(team.id), getTeamRegistrations(team.id)]);
  const mains = members.filter((m) => m.role !== "substitute").length;

  // те же условия, что проверяют leaveTeam / disbandTeam на сервере — причина видна до клика
  const activeReg = regs.find((r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status));
  let blocked: DangerBlock | null = null;
  if (isCaptain && activeReg) {
    const open = activeReg.tournament.status === "registration";
    blocked = {
      title: t("Команда участвует в «{name}»", { name: activeReg.tournament.name }),
      text: open
        ? t("Чтобы распустить команду, сначала отзовите заявку на турнир.")
        : t("Регистрация уже закрыта — отозвать заявку можно только через администратора. Распустить команду можно после турнира."),
      link: open ? { href: `/tournaments/${activeReg.tournament.slug}`, label: t("Открыть турнир и отозвать заявку") } : undefined,
    };
  } else if (!isCaptain && locked) {
    blocked = { title: t("Состав заблокирован турниром «{name}»", { name: locked.name }), text: t("Покинуть команду можно после окончания блокировки.") };
  }

  return (
    <Container>
      <TeamHeader team={team} isCaptain={isCaptain} ready={mains >= MAX_MAIN} mains={mains} maxMain={MAX_MAIN} active="settings" />
      <Stack className="max-w-[760px] pt-10">
        {isCaptain ? (
          <>
            <Section title={t("Основное и логотип")} description={t("Название, тег, регион, логотип и описание — так команду видят в сетке и на её странице.")}>
              <Panel className="p-5 sm:p-7">
                <TeamEditor action={updateTeam} team={team} mode="edit" />
              </Panel>
            </Section>
            <Section title={t("Приглашения")} description={t("Одна активная ссылка. Новая ссылка отключает предыдущую.")}>
              <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-fg">{t("Ссылка-приглашение")}</div>
                  <div className="num mt-0.5 truncate text-meta text-fg-3">
                    {origin}/join/{team.invite_code}
                  </div>
                </div>
                <InviteButton url={`${origin}/join/${team.invite_code}`} freeSlots={MAX_MAIN + MAX_SUBS - members.length} variant="secondary" label={t("Открыть приглашение")} />
              </Panel>
            </Section>
            <Section title={t("Заявки на вступление")} description={t("Игроки подают заявки со страницы команды и из «Поиска команды», вы принимаете или отклоняете их во вкладке «Заявки».")}>
              <Panel className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-fg">{t("Принимать заявки")}</div>
                  <div className="mt-0.5 text-meta text-fg-3">{team.accepts_applications ? t("Кнопка «Подать заявку» видна на странице команды.") : t("Приём закрыт — вступить можно только по ссылке-приглашению.")}</div>
                </div>
                <ApplicationsToggle accepts={team.accepts_applications} />
              </Panel>
            </Section>
          </>
        ) : (
          <p className="text-[14px] text-fg-2">{t("Название, логотип и приглашения меняет капитан команды.")}</p>
        )}
        <DangerZone isCaptain={isCaptain} teamName={team.name} blocked={blocked} />
        <HelpHint topics={isCaptain ? ["leave-team", "team-applications", "manage-roster"] : ["leave-team"]} />
      </Stack>
    </Container>
  );
}
