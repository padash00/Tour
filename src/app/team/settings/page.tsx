import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership, getTeamMembers } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { DangerZone } from "@/components/team/danger-zone";
import { InviteButton } from "@/components/team/invite";
import { TeamEditor } from "@/components/team/team-editor";
import { TeamHeader } from "@/components/team/team-header";
import { Container, Panel, Section, Stack } from "@/components/ds";

export const metadata: Metadata = { title: "Настройки команды" };

export default async function TeamSettingsPage() {
  const player = await requirePlayer("/team/settings");
  const membership = await getActiveMembership(player.id);
  if (!membership) redirect("/team");
  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, origin] = await Promise.all([getTeamMembers(team.id), siteOrigin()]);
  const mains = members.filter((m) => m.role !== "substitute").length;

  return (
    <Container>
      <TeamHeader team={team} isCaptain={isCaptain} ready={mains >= MAX_MAIN} mains={mains} maxMain={MAX_MAIN} active="settings" />
      <Stack className="max-w-[760px] pt-10">
        {isCaptain ? (
          <>
            <Section title="Основное и логотип" description="Название, тег, регион, логотип и описание — так команду видят в сетке и на её странице.">
              <Panel className="p-5 sm:p-7">
                <TeamEditor action={updateTeam} team={team} mode="edit" />
              </Panel>
            </Section>
            <Section title="Приглашения" description="Одна активная ссылка. Новая ссылка отключает предыдущую.">
              <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-fg">Ссылка-приглашение</div>
                  <div className="num mt-0.5 truncate text-meta text-fg-3">
                    {origin}/join/{team.invite_code}
                  </div>
                </div>
                <InviteButton url={`${origin}/join/${team.invite_code}`} freeSlots={MAX_MAIN + MAX_SUBS - members.length} variant="secondary" label="Открыть приглашение" />
              </Panel>
            </Section>
          </>
        ) : (
          <p className="text-[14px] text-fg-2">Название, логотип и приглашения меняет капитан команды.</p>
        )}
        <DangerZone isCaptain={isCaptain} teamName={team.name} />
      </Stack>
    </Container>
  );
}
