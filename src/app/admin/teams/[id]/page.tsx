import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminAddMember, adminDisbandTeam, adminKickMember, adminMakeCaptain, adminRenameTeam, adminSetRole, adminSetTeamLogo } from "@/app/actions/admin-team";
import { MAX_MAIN, MAX_SUBS } from "@/lib/data";
import { requireAdmin } from "@/lib/auth";
import { getTeamById, getTeamMembers, getTeamRegistrations, isActiveRegistration } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LogoFileInput } from "@/components/logo-file-input";
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
                          <ActionForm action={adminSetRole} inline>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="memberId" value={m.id} />
                            <input type="hidden" name="role" value={m.role === "substitute" ? "player" : "substitute"} />
                            <SubmitButton variant="secondary" size="sm">
                              {m.role === "substitute" ? "В основу" : "В запас"}
                            </SubmitButton>
                          </ActionForm>
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

      {!disbanded && (
        <Panel title="Название и тег" boxed>
          <ActionForm action={adminRenameTeam} className="p-5">
            <input type="hidden" name="teamId" value={team.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
                Название
                <input name="name" defaultValue={team.name} required maxLength={32} className="field" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
                Тег
                <input name="tag" defaultValue={team.tag} required maxLength={6} className="field w-36 uppercase" autoComplete="off" />
              </label>
              <SubmitButton variant="secondary">Сохранить</SubmitButton>
            </div>
            <p className="mt-3 text-[13px] text-fg-3">Пока у команды есть заявка на официальный турнир, капитан название, тег и состав менять не может — только вы здесь.</p>
          </ActionForm>
        </Panel>
      )}

      {!disbanded && (
        <Panel title="Логотип" boxed>
          <div className="flex flex-wrap items-center gap-5 p-5">
            <TeamLogo src={team.logo_url} tag={team.tag} size={64} />
            <ActionForm action={adminSetTeamLogo} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="teamId" value={team.id} />
              <LogoFileInput required className="field max-w-xs py-2 text-[14px]" />
              <SubmitButton variant="secondary">{team.logo_url ? "Заменить" : "Загрузить"}</SubmitButton>
            </ActionForm>
            {team.logo_url && (
              <ActionForm action={adminSetTeamLogo}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="remove" value="1" />
                <SubmitButton variant="secondary" confirm="Убрать логотип команды?">Убрать</SubmitButton>
              </ActionForm>
            )}
            <p className="basis-full text-[13px] text-fg-3">Любая картинка, лучше квадратная — большая уменьшится автоматически. Капитан тоже может сменить логотип в настройках команды — даже при заявке на турнир.</p>
          </div>
        </Panel>
      )}

      {!disbanded && (
        <Panel title="Добавить игрока" boxed>
          <ActionForm action={adminAddMember} className="p-5">
            <input type="hidden" name="teamId" value={team.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
                Ник или SteamID
                <input name="player" required placeholder="dimon_kz или 7656119…" className="field" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
                Роль
                <select name="role" defaultValue="player" className="field w-44">
                  <option value="player">Основа</option>
                  <option value="substitute">Запас</option>
                </select>
              </label>
              <SubmitButton>Добавить</SubmitButton>
            </div>
            <p className="mt-3 text-[13px] text-fg-3">
              Игрок должен хотя бы раз войти на сайт через Steam и не состоять в другой команде. Мест: основа {MAX_MAIN} (с капитаном), запас {MAX_SUBS}.
            </p>
          </ActionForm>
        </Panel>
      )}

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
