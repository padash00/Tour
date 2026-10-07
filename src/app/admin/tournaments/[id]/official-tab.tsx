import Link from "next/link";
import { decideRegistration } from "@/app/actions/admin";
import { purgeApplicationData, remindCaptains, setDocuments } from "@/app/actions/official";
import { ActionToggle } from "@/components/admin/action-toggle";
import { BarCell, CARD } from "@/components/admin/tournament-kit";
import { Panel, TableBox } from "@/components/admin/control";
import { ActionForm, SubmitButton } from "@/components/forms";
import { EmptyState, buttonClass, cn } from "@/components/ui";
import { registrationStatusLabel } from "@/lib/format";
import { ageRangeLabel } from "@/lib/official";
import { approveWarningOf, loadOfficial, type OfficialTeam } from "@/lib/official-data";
import { formatDay, formatPhone, yearsLabel } from "@/lib/profile";
import { auditPersonalView } from "@/lib/profiles";
import type { Player, Tournament } from "@/lib/types";

/*
 * Вкладка «Участники» официального турнира: сводка, команды с ФИО, возрастом, местом учёбы/работы,
 * телефонами и отметками «Документы сданы», выгрузка в Excel, печать заявок, напоминание капитанам.
 * Персональные данные — только здесь; просмотр пишется в журнал (не чаще раза в 10 минут).
 */

const ROLE: Record<string, string> = { captain: "Капитан", player: "Игрок", sub: "Запасной", coach: "Тренер" };

export async function OfficialTab({ t, admin }: { t: Tournament; admin: Player }) {
  const data = await loadOfficial(t);
  await auditPersonalView(admin.id, "official.view", { type: "tournament", id: t.id }, { teams: data.teams.length });
  const { teams } = data;
  const participants = teams.flatMap((x) => x.participants);
  const docsDone = participants.filter((p) => p.documents).length;
  const orgs = new Set(teams.map((x) => x.application?.organization?.trim().toLowerCase()).filter(Boolean));
  const problems = participants.filter((p) => p.issues.length).length;
  const approved = teams.filter((x) => x.registration.status === "approved").length;
  const ended = t.status === "finished" || t.status === "cancelled";

  return (
    <div className="space-y-8">
      <div className={`${CARD} grid grid-cols-2 md:grid-cols-5 divide-x divide-white/[0.06]`}>
        <BarCell label="Команды" value={`${teams.length} из ${t.max_teams}`} hint={`одобрено ${approved}`} />
        <BarCell label="Организации" value={orgs.size} />
        <BarCell label="Участники" value={participants.length} hint={t.require_coach ? "игроки и тренеры" : "игроки"} />
        <BarCell
          label="Документы сданы"
          value={`${docsDone} / ${participants.length}`}
          tone={participants.length && docsDone === participants.length ? "ok" : docsDone < participants.length ? "warn" : undefined}
        />
        <BarCell label="Анкеты и возраст" value={problems} tone={problems ? "danger" : "ok"} hint={problems ? "участников с проблемами" : `всё в порядке · ${ageRangeLabel(t)}`} />
      </div>

      <Panel title="Документы и отчёты">
        <div className="grid gap-3 md:grid-cols-3">
          <div className={`${CARD} p-5`}>
            <div className="text-[14px] font-semibold text-fg">Excel для организаторов</div>
            <p className="mt-1 text-[13px] text-fg-3">Листы «Участники», «Команды» и «Итоги». Скачивание записывается в журнал.</p>
            <a href={`/admin/tournaments/${t.id}/official-export`} className={buttonClass("secondary", "sm", "mt-3")} download>
              Скачать .xlsx
            </a>
          </div>
          <div className={`${CARD} p-5`}>
            <div className="text-[14px] font-semibold text-fg">Заявки — Приложение №1</div>
            <p className="mt-1 text-[13px] text-fg-3">Все заявки на печать (каждая с новой страницы, A4) или сохранение в PDF.</p>
            <Link href={`/admin/tournaments/${t.id}/application`} className={buttonClass("secondary", "sm", "mt-3")}>
              Открыть для печати
            </Link>
          </div>
          <div className={`${CARD} p-5`}>
            <div className="text-[14px] font-semibold text-fg">Напомнить капитанам</div>
            <p className="mt-1 text-[13px] text-fg-3">Уведомление на сайте капитанам команд, у которых не хватает анкет, данных заявки или документов.</p>
            <ActionForm action={remindCaptains} className="mt-3">
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="sm" variant="secondary" confirm="Отправить напоминание капитанам команд с незаполненными данными?">
                Напомнить капитанам
              </SubmitButton>
            </ActionForm>
          </div>
        </div>
      </Panel>

      {teams.length === 0 ? (
        <EmptyState title="Заявок пока нет" description="Когда капитаны подадут заявки, здесь появятся участники и отметки о документах." />
      ) : (
        teams.map((team) => <TeamBlock key={team.registration.id} t={t} team={team} />)
      )}

      <div className="max-w-2xl rounded-[12px] border border-danger/25 bg-danger/[0.03] p-5">
        <div className="text-[14px] font-semibold text-danger/90">Удалить персональные данные заявок</div>
        <p className="mt-1 mb-3 text-[13px] text-fg-3">
          Удалятся организация, ответственное лицо, телефон капитана, данные тренеров и отметки о документах этого турнира. Составы, матчи и
          статистика останутся. Анкеты игроков удаляются отдельно — кнопкой «Удалить анкету» у игрока.
          {!ended && " Доступно после завершения турнира."}
        </p>
        <ActionForm action={purgeApplicationData}>
          <input type="hidden" name="tournamentId" value={t.id} />
          {ended ? (
            <SubmitButton size="sm" variant="danger" confirm={`Удалить данные заявок турнира «${t.name}»? Это нельзя отменить.`}>
              Удалить данные заявок
            </SubmitButton>
          ) : (
            <button type="button" disabled className={buttonClass("danger", "sm", "opacity-40")}>
              Удалить данные заявок
            </button>
          )}
        </ActionForm>
      </div>
    </div>
  );
}

function TeamBlock({ t, team }: { t: Tournament; team: OfficialTeam }) {
  const r = team.registration;
  const a = team.application;
  return (
    <Panel
      title={
        <span>
          {r.team.name} <span className="normal-case tracking-normal text-fg-3">· {a?.organization ?? "организация не указана"}</span>
        </span>
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[12px]", r.status === "approved" ? "text-ok" : "text-warn")}>{registrationStatusLabel[r.status]}</span>
          {r.status === "pending" && (
            <ActionForm action={decideRegistration}>
              <input type="hidden" name="registrationId" value={r.id} />
              <input type="hidden" name="decision" value="approve" />
              <SubmitButton size="sm" confirm={approveWarningOf(team)}>
                Одобрить
              </SubmitButton>
            </ActionForm>
          )}
          <Link href={`/admin/tournaments/${t.id}/application?reg=${r.id}`} className="text-[12px] text-accent hover:underline">
            Заявка для печати
          </Link>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-fg-3">
        <span>
          Ответственное лицо: <span className="text-fg-2">{a?.responsible_name || "—"}</span> <span className="num">{formatPhone(a?.responsible_phone)}</span>
        </span>
        <span>
          Телефон капитана: <span className="num text-fg-2">{formatPhone(a?.captain_phone) || "—"}</span>
        </span>
        {team.applicationIssues.length > 0 && <span className="text-danger">Не заполнено: {team.applicationIssues.join(", ")}</span>}
      </div>
      <TableBox minWidth={980}>
        <thead>
          <tr>
            <th>Роль</th>
            <th>ФИО</th>
            <th>Дата рожд.</th>
            <th>Место работы / учёбы</th>
            <th>Должность / курс</th>
            <th>Телефон</th>
            <th>Документы</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {team.participants.map((p) => (
            <tr key={p.key} className={p.issues.length ? "bg-danger/[0.04]" : undefined}>
              <td className="whitespace-nowrap text-fg-3">{ROLE[p.role]}</td>
              <td>
                <div className="font-medium text-fg">{p.name || <span className="text-danger">не указано</span>}</div>
                {p.nickname && <div className="text-[11px] text-fg-3">{p.nickname}</div>}
                {p.issues.map((x) => (
                  <div key={x} className="text-[11px] text-danger">
                    {x}
                  </div>
                ))}
                {p.warnings.map((x) => (
                  <div key={x} className="text-[11px] text-warn">
                    {x}
                  </div>
                ))}
              </td>
              <td className="num whitespace-nowrap">
                {p.birthDate ? formatDay(p.birthDate) : "—"}
                {p.age != null && <div className={cn("text-[11px]", p.age < t.min_age || p.age > t.max_age ? "text-danger" : "text-fg-3")}>{yearsLabel(p.age)}</div>}
              </td>
              <td>{p.organization || "—"}</td>
              <td>{p.position || "—"}</td>
              <td className="num whitespace-nowrap">{p.phone || "—"}</td>
              <td>
                {(p.playerId || a) && (
                  <ActionToggle
                    action={setDocuments}
                    fields={p.playerId ? { tournamentId: t.id, playerId: p.playerId } : { tournamentId: t.id, registrationId: r.id }}
                    on={p.documents}
                    label={`Документы сданы: ${p.name || p.nickname || "тренер"}`}
                    onLabel="Сданы"
                    offLabel="Нет"
                  />
                )}
              </td>
              <td className="whitespace-nowrap text-right">
                {p.playerId && (
                  <Link href={`/admin/players/${p.playerId}/profile?back=${encodeURIComponent(`/admin/tournaments/${t.id}?tab=official`)}`} className="text-[12px] text-accent hover:underline">
                    Анкета
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableBox>
    </Panel>
  );
}
