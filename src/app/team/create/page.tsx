import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { MAX_MAIN, MAX_SUBS, getActiveMembership } from "@/lib/data";
import { needsProfile } from "@/lib/profiles";
import { ProfileRequired } from "@/components/profile/profile-required";
import { TeamEditor } from "@/components/team/team-editor";
import { HelpHint } from "@/components/help-hint";
import { RosterStrip } from "@/components/team/roster-strip";
import { Container, Eyebrow, PageTitle, Panel } from "@/components/ds";

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
      <Panel className="mt-6 max-w-2xl">
        <Eyebrow>Состав команды</Eyebrow>
        <RosterStrip members={[{ id: "me", role: "captain", player: { nickname: player.nickname, avatar_url: player.avatar_url } }]} coach={null} maxMain={MAX_MAIN} maxSubs={MAX_SUBS} className="mt-4" />
        <p className="mt-4 text-meta leading-relaxed text-fg-3">
          {MAX_MAIN} основных (вы — капитан), до {MAX_SUBS} запасных и тренер, если нужен. После создания найдите игроков и тренера по нику — они подтвердят
          приглашение, — или отправьте ссылку-приглашение.
        </p>
      </Panel>
      <div className="mt-8">
        {gated ? <ProfileRequired next="/team/create" action="создать команду" className="max-w-2xl" /> : <TeamEditor action={createTeam} mode="create" />}
      </div>
      <HelpHint topics={["create-team", "join-team"]} className="mt-10 max-w-2xl" />
    </Container>
  );
}
