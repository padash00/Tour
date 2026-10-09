import Link from "next/link";
import { withdrawApplication } from "@/app/actions/applications";
import type { PlayerApplication } from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RowList, Section, Status, TeamLogo } from "@/components/ds";

/** Заявки игрока без команды: ждут ответа или недавно отклонены. Ожидающую можно отозвать */
export function MyApplications({ items, className }: { items: PlayerApplication[]; className?: string }) {
  return (
    <Section title="Мои заявки" description="Ответ капитана придёт уведомлением. Когда вас примут в одну команду, остальные заявки отменятся." className={className}>
      <RowList>
        {items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <TeamLogo src={a.team.logo_url} tag={a.team.tag} size="sm" />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${encodeURIComponent(a.team.tag)}`} className="block truncate text-[14px] font-medium text-fg hover:text-accent">
                {a.team.name}
              </Link>
              <div className="text-meta text-fg-3">Подана {formatDate(a.created_at)}</div>
            </div>
            {a.status === "pending" ? (
              <>
                <Status info={{ label: "Ждёт ответа", tone: "accent" }} size="sm" />
                <ActionForm action={withdrawApplication}>
                  <input type="hidden" name="applicationId" value={a.id} />
                  <SubmitButton variant="ghost" size="sm" confirm="Отозвать заявку?" pendingText="Отзываем…">
                    Отозвать
                  </SubmitButton>
                </ActionForm>
              </>
            ) : (
              <Status info={{ label: "Отклонена", tone: "danger" }} size="sm" />
            )}
          </div>
        ))}
      </RowList>
    </Section>
  );
}
