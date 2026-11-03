import { Button, Callout } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

/** Вместо действия, для которого нужна анкета: объясняем зачем и ведём на неё с возвратом обратно */
export async function ProfileRequired({ next, action, className }: { next: string; action: string; className?: string }) {
  const t = await getT();
  return (
    <Callout
      tone="warn"
      title={t("Сначала заполните анкету игрока")}
      className={className}
      action={
        <Button href={`/me/profile?next=${encodeURIComponent(next)}`} size="sm">
          {t("Заполнить анкету")}
        </Button>
      }
    >
      {t("Чтобы {action}, нужна анкета: ФИО, дата рождения, телефон и место учёбы или работы. Её видите только вы и администраторы.", { action: t(action) })}
    </Callout>
  );
}
