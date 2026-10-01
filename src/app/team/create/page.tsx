import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { TeamForm } from "@/components/team-form";
import { Card, Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Создать команду" };

export default async function CreateTeamPage() {
  const player = await requirePlayer("/team/create");
  if (await getActiveMembership(player.id)) redirect("/team");

  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow="Новая команда"
        title="Создать команду"
        description="Вы станете капитаном. После создания получите ссылку-приглашение для игроков."
      />
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <Card className="p-6 sm:p-8">
          <TeamForm action={createTeam} submitLabel="Создать команду" />
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <div className="label mb-4">Как собрать состав</div>
            <ol className="space-y-4 text-sm text-fg-2">
              <li className="flex gap-3">
                <span className="num text-fg-3">01</span>
                После создания вы получите ссылку вида <span className="num text-fg">/join/NR-X7K2P</span>
              </li>
              <li className="flex gap-3">
                <span className="num text-fg-3">02</span>
                Отправьте её игрокам — они входят через Steam и подтверждают вступление
              </li>
              <li className="flex gap-3">
                <span className="num text-fg-3">03</span>
                Когда в основе 5 игроков, можно подавать заявку на турнир
              </li>
            </ol>
          </Card>
          <Card className="p-6">
            <div className="label mb-4">Слоты</div>
            <div className="space-y-2 text-sm">
              {["Капитан — вы", "Игрок 2", "Игрок 3", "Игрок 4", "Игрок 5", "Запасной (необязательно)", "Запасной (необязательно)"].map(
                (s, i) => (
                  <div key={i} className="flex items-center gap-3 h-9 px-3 rounded-lg border border-dashed border-line-strong text-fg-3 first:border-solid first:border-[#8bb8ff44] first:text-accent">
                    {s}
                  </div>
                ),
              )}
            </div>
          </Card>
        </div>
      </div>
    </Container>
  );
}
