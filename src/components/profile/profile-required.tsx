import { Button, Callout } from "@/components/ds";

/** Вместо действия, для которого нужна анкета: объясняем зачем и ведём на неё с возвратом обратно */
export function ProfileRequired({ next, action, className }: { next: string; action: string; className?: string }) {
  return (
    <Callout
      tone="warn"
      title="Сначала заполните анкету игрока"
      className={className}
      action={
        <Button href={`/me/profile?next=${encodeURIComponent(next)}`} size="sm">
          Заполнить анкету
        </Button>
      }
    >
      Чтобы {action}, нужна анкета: ФИО, дата рождения, телефон и место учёбы или работы. Её видите только вы и администраторы.
    </Callout>
  );
}
