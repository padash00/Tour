import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { TeamForm } from "@/components/team-form";
import { FlowHeader } from "@/components/competition/step";
import { Container } from "@/components/ui";

export const metadata: Metadata = { title: "Создать команду" };

export default async function CreateTeamPage() {
  const player = await requirePlayer("/team/create");
  if (await getActiveMembership(player.id)) redirect("/team");

  return (
    <Container size="form">
      <FlowHeader
        title="Создать команду"
        description="Вы станете капитаном. После создания получите ссылку-приглашение для игроков."
      />
      <div className="pt-4">
        <TeamForm action={createTeam} submitLabel="Создать команду" />
      </div>
    </Container>
  );
}
