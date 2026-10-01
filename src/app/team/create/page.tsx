import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createTeam } from "@/app/actions/team";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { TeamForm } from "@/components/team-form";
import { CARD, PageHero, SectionHead, Wrap } from "@/components/primitives";

export const metadata: Metadata = { title: "Создать команду" };

const NEXT = [
  { t: "Вы становитесь капитаном", d: "Управляете составом и подаёте заявки на турниры." },
  { t: "Приглашаете игроков", d: "Ссылка-приглашение появится в штабе команды сразу после создания." },
  { t: "Подаёте заявку", d: "Когда состав собран — регистрация на турнир в пару кликов." },
];

export default async function CreateTeamPage() {
  const player = await requirePlayer("/team/create");
  if (await getActiveMembership(player.id)) redirect("/team");

  return (
    <>
      <PageHero compact eyebrow="Новая команда" title="Создать команду" lead="Название и тег — обязательно, остальное можно заполнить позже." />
      <Wrap className="pt-10">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)]">
          <div className={`${CARD} p-7 sm:p-10 lg:p-12`}>
            <TeamForm action={createTeam} submitLabel="Создать команду" />
          </div>
          <aside className={`${CARD} p-7 lg:p-9`}>
            <SectionHead title="Что дальше" />
            <ol className="space-y-6">
              {NEXT.map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="num pt-0.5 text-[13px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="text-[16px] font-semibold text-fg">{s.t}</div>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-3">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </Wrap>
    </>
  );
}
