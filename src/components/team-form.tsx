import type { Team } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "./forms";
import { Field } from "./ui";

export function TeamForm({ action, team, submitLabel }: { action: FormAction; team?: Team; submitLabel: string }) {
  return (
    <ActionForm action={action}>
      <div className="space-y-6">
        <div className="grid sm:grid-cols-[1fr_140px] gap-4">
          <Field label="Название">
            <input name="name" required maxLength={32} defaultValue={team?.name} placeholder="Night Raid" className="field" />
          </Field>
          <Field label="Тег" hint="2–6 символов">
            <input name="tag" required maxLength={6} defaultValue={team?.tag} placeholder="NR" className="field uppercase num" />
          </Field>
        </div>
        <Field label="Регион">
          <input name="region" maxLength={48} defaultValue={team?.region ?? ""} placeholder="Алматы" className="field" />
        </Field>
        <Field label="Логотип" hint="PNG, JPG или WEBP до 1 МБ, лучше квадратный">
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="field pt-[7px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-xs file:text-fg-2"
          />
        </Field>
        <Field label="Описание">
          <textarea
            name="description"
            rows={3}
            maxLength={400}
            defaultValue={team?.description ?? ""}
            placeholder="Пару слов о команде — необязательно"
            className="field resize-none"
          />
        </Field>
      </div>
      <div className="mt-8">
        <SubmitButton size="lg">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
