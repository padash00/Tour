import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { TeamForm } from "@/components/team-form";
import { CARD, PageHero, Wrap } from "@/components/primitives";

export const metadata: Metadata = { title: "Создать команду" };

export default async function CreateTeamPage() {
  const player = await requirePlayer("/team/create");
  if (await getActiveMembership(player.id)) redirect("/team");

  return (
    <>
      <PageHero
        compact
        eyebrow="Шаг 1 · Команда"
        title="Создать команду"
        lead="Вы станете капитаном. После создания получите ссылку-приглашение для игроков."
      />
      <Wrap className="pt-12">
        <div className={`${CARD} max-w-[760px] p-8 lg:p-12`}>
          <TeamForm action={createTeam} submitLabel="Создать команду" />
        </div>
      </Wrap>
    </>
  );
}
