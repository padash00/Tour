import Link from "next/link";
import { withdrawApplication } from "@/app/actions/applications";
import type { PlayerApplication } from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RowList, Section, Status, TeamLogo } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

/** Заявки игрока без команды: ждут ответа или недавно отклонены. Ожидающую можно отозвать */
export async function MyApplications({ items, className }: { items: PlayerApplication[]; className?: string }) {
  const t = await getT();
  return (
    <Section title={t("Мои заявки")} description={t("Ответ капитана придёт уведомлением. Когда вас примут в одну команду, остальные заявки отменятся.")} className={className}>
      <RowList>
        {items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <TeamLogo src={a.team.logo_url} tag={a.team.tag} size="sm" />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${encodeURIComponent(a.team.tag)}`} className="block truncate text-[14px] font-medium text-fg hover:text-accent">
                {a.team.name}
              </Link>
              <div className="text-meta text-fg-3">{t("Подана {date}", { date: formatDate(a.created_at, t.lang) })}</div>
            </div>
            {a.status === "pending" ? (
              <>
                <Status info={{ label: t("Ждёт ответа"), tone: "accent" }} size="sm" />
                <ActionForm action={withdrawApplication}>
                  <input type="hidden" name="applicationId" value={a.id} />
                  <SubmitButton variant="ghost" size="sm" confirm={t("Отозвать заявку?")} pendingText={t("Отзываем…")}>
                    {t("Отозвать")}
                  </SubmitButton>
                </ActionForm>
              </>
            ) : (
              <Status info={{ label: t("Отклонена"), tone: "danger" }} size="sm" />
            )}
          </div>
        ))}
      </RowList>
    </Section>
  );
}
