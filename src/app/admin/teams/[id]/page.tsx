import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDisbandTeam, adminKickMember, adminMakeCaptain } from "@/app/actions/admin-team";
import { requireAdmin } from "@/lib/auth";
import { getTeamById, getTeamMembers, getTeamRegistrations, isActiveRegistration } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, TeamLogo } from "@/components/ui";
import { AdminHeader, Panel, TableBox } from "@/components/admin/control";

export const metadata: Metadata = { title: "Команда — F16 Control" };

const ROLE = { captain: "Капитан", player: "Основа", substitute: "Запас" } as const;

/** Команда в F16 Control: состав, заявки, исключить игрока, назначить капитана, распустить */
export default async function AdminTeamPage(props: PageProps<"/admin/teams/[id]">) {
  await requireAdmin("/admin/teams");
  const { id } = await props.params;
  const team = await getTeamById(id);
  if (!team) notFound();
  const [members, regs] = await Promise.all([getTeamMembers(team.id), getTeamRegistrations(team.id)]);
  const activeRegs = regs.filter((r) => isActiveRegistration(r) && !["finished", "cancelled"].includes(r.tournament.status));
  const playing = activeRegs.find((r) => r.tournament.status === "checkin" || r.tournament.status === "live");
  const disbanded = !!team.disbanded_at;

  return (
    <div className="space-y-8">
      <AdminHeader
        back={{ href: "/admin/teams", label: "Команды" }}
        title={
          <span className="flex items-center gap-3">
            <TeamLogo src={team.logo_url} tag={team.tag} size={40} />
            {team.name} <span className="text-fg-3">[{team.tag}]</span>
          </span>
        }
        description={disbanded ? `Команда распущена ${formatDate(team.disbanded_at!)}` : `Создана ${formatDate(team.created_at)} · код приглашения ${team.invite_code}`}
        actions={
          <Link href={`/teams/${encodeURIComponent(team.tag)}`} className="text-[14px] font-semibold text-accent hover:underline">
            Страница команды на сайте →
          </Link>
        }
      />

      <Panel title={`Состав · ${members.length}`}>
        {members.length === 0 ? (
          <p className="text-[15px] text-fg-3">В команде никого нет.</p>
        ) : (
          <TableBox minWidth={640}>
            <thead>
              <tr>
                <th>Игрок</th>
                <th>Роль</th>
                <th>В команде с</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const captain = m.player_id === team.captain_id;
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/players/${m.player_id}/profile`} className="flex items-center gap-2.5 text-fg hover:text-accent">
                        <Avatar src={m.player.avatar_url} name={m.player.nickname} size={28} />
                        <span className="font-medium">{m.player.nickname}</span>
                      </Link>
                    </td>
                    <td className={captain ? "font-semibold text-accent" : undefined}>{ROLE[m.role as keyof typeof ROLE] ?? m.role}</td>
                    <td className="num">{formatDate(m.joined_at)}</td>
                    <td>
                      {!captain && !disbanded && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <ActionForm action={adminMakeCaptain} inline>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={m.id} />
                            <SubmitButton variant="secondary" size="sm" confirm={`Сделать ${m.player.nickname} капитаном ${team.name}? Нынешний капитан станет обычным игроком.`}>
                              Сделать капитаном
                            </SubmitButton>
                          </ActionForm>
                          <ActionForm action={adminKickMember} inline>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={m.id} />
                            <SubmitButton variant="danger" size="sm" confirm={`Исключить ${m.player.nickname} из ${team.name}? Если команда подала заявку на турнир с открытой регистрацией, игрок уйдёт и из заявки.`}>
                              Исключить
                            </SubmitButton>
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableBox>
        )}
      </Panel>

      <Panel title="Заявки на турниры">
        {regs.length === 0 ? (
          <p className="text-[15px] text-fg-3">Заявок не было.</p>
        ) : (
          <ul className="space-y-2 text-[15px]">
            {regs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3">
                <Link href={`/admin/tournaments/${r.tournament_id}`} className="font-medium text-fg hover:text-accent">
                  {r.tournament.name}
                </Link>
                <span className={r.status === "approved" ? "text-ok" : r.status === "pending" ? "text-warn" : "text-fg-3"}>{registrationStatusLabel[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!disbanded && (
        <Panel title="Распустить команду" boxed>
          <div className="space-y-4 p-5">
            <p className="max-w-read text-[15px] text-fg-2">
              Все игроки выйдут из команды и смогут вступить в другую или создать свою. Приглашения и заявки на вступление отменятся.
              {activeRegs.length > 0 && !playing && ` Заявка на ${activeRegs.map((r) => `«${r.tournament.name}»`).join(", ")} будет снята.`}
              {" "}Статистика сыгранных матчей останется.
            </p>
            {playing ? (
              <p className="text-[15px] text-danger">
                Команда участвует в «{playing.tournament.name}» — там уже идёт check-in или игры. Сначала снимите её с турнира на{" "}
                <Link href={`/admin/tournaments/${playing.tournament_id}`} className="underline">
                  странице турнира
                </Link>
                .
              </p>
            ) : (
              <ActionForm action={adminDisbandTeam}>
                <input type="hidden" name="teamId" value={team.id} />
                <SubmitButton variant="danger" confirm={`Распустить ${team.name}? Отменить это нельзя: игрокам придётся собираться заново.`}>
                  Распустить команду
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
