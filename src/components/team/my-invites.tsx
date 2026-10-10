import Link from "next/link";
import { acceptInvite, declineInvite, leaveCoaching } from "@/app/actions/invites";
import type { PlayerInvite } from "@/lib/invites";
import type { Team } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RowList, Section, Status, TeamLogo } from "@/components/ds";

/** Приглашения игроку от капитанов: принять или отклонить */
export function MyInvites({ items, inTeam, className }: { items: PlayerInvite[]; inTeam: boolean; className?: string }) {
  if (!items.length) return null;
  return (
    <Section title="Вас приглашают" description="Приглашение действует 7 дней. Примете одно приглашение игроком — остальные отменятся." className={className}>
      <RowList>
        {items.map((i) => {
          // игроком нельзя, пока вы в другой команде; тренером — можно
          const blocked = i.role === "player" && inTeam;
          return (
            <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <TeamLogo src={i.team.logo_url} tag={i.team.tag} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/teams/${encodeURIComponent(i.team.tag)}`} className="block truncate text-[14px] font-medium text-fg hover:text-accent">
                  {i.team.name}
                </Link>
                <div className="text-meta text-fg-3">
                  {i.role === "coach" ? "Тренером" : "Игроком"} · {formatDate(i.created_at)}
                  {blocked ? " · сначала покиньте свою команду" : ""}
                </div>
              </div>
              <Status info={{ label: i.role === "coach" ? "Тренер" : "Игрок", tone: "accent" }} size="sm" />
              <div className="flex gap-2">
                {!blocked && (
                  <ActionForm action={acceptInvite}>
                    <input type="hidden" name="inviteId" value={i.id} />
                    <SubmitButton size="sm" pendingText="Принимаем…">
                      Принять
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={declineInvite}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <SubmitButton size="sm" variant="ghost" pendingText="Отклоняем…">
                    Отклонить
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          );
        })}
      </RowList>
    </Section>
  );
}

/** Команды, которые игрок тренирует */
export function CoachedTeams({ teams, className }: { teams: Team[]; className?: string }) {
  if (!teams.length) return null;
  return (
    <Section title="Вы тренер" description="Тренер не играет и не входит в состав, но указывается в заявках на турниры." className={className}>
      <RowList>
        {teams.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <TeamLogo src={t.logo_url} tag={t.tag} size="sm" />
            <Link href={`/teams/${encodeURIComponent(t.tag)}`} className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg hover:text-accent">
              {t.name}
            </Link>
            <ActionForm action={leaveCoaching}>
              <input type="hidden" name="teamId" value={t.id} />
              <SubmitButton size="sm" variant="ghost" confirm={`Уйти с поста тренера ${t.name}?`} pendingText="Уходим…">
                Уйти с поста тренера
              </SubmitButton>
            </ActionForm>
          </div>
        ))}
      </RowList>
    </Section>
  );
}
