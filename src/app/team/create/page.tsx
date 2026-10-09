import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { needsProfile } from "@/lib/profiles";
import { ProfileRequired } from "@/components/profile/profile-required";
import { TeamEditor } from "@/components/team/team-editor";
import { HelpHint } from "@/components/help-hint";
import { Container, PageTitle } from "@/components/ds";

export const metadata: Metadata = { title: "Создать команду" };

export default async function CreateTeamPage() {
  const player = await requirePlayer("/team/create");
  if (await getActiveMembership(player.id)) redirect("/team");
  const gated = await needsProfile(player.id);

  return (
    <Container className="pt-8 sm:pt-10">
      <Link href="/teams" className="inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> Команды
      </Link>
      <PageTitle className="mt-2">Создать команду</PageTitle>
      <p className="mt-2 text-[15px] text-fg-2">Название и тег — обязательно, остальное можно заполнить позже.</p>
      <div className="mt-8">
        {gated ? <ProfileRequired next="/team/create" action="создать команду" className="max-w-2xl" /> : <TeamEditor action={createTeam} mode="create" />}
      </div>
      <HelpHint topics={["create-team", "join-team"]} className="mt-10 max-w-2xl" />
    </Container>
  );
}
