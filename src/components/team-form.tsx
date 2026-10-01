import type { Team } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "./forms";
import { FormField, Input, Textarea } from "./primitives";
import { LogoInput } from "./public/logo-input";

/** Форма команды: создание и настройки. Подписи над полями, подсказки под ними */
export function TeamForm({ action, team, submitLabel }: { action: FormAction; team?: Team; submitLabel: string }) {
  return (
    <ActionForm action={action}>
      <div className="space-y-7">
        <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
          <FormField label="Название" hint="До 32 символов — так команду увидят в сетке">
            <Input name="name" required maxLength={32} defaultValue={team?.name} placeholder="Night Raid" autoComplete="off" className="h-12 text-[15px]" />
          </FormField>
          <FormField label="Тег" hint="2–6 символов">
            <Input
              name="tag"
              required
              minLength={2}
              maxLength={6}
              defaultValue={team?.tag}
              placeholder="NR"
              autoComplete="off"
              className="num h-12 text-[15px] uppercase tracking-[0.12em]"
            />
          </FormField>
        </div>
        <FormField label="Регион" hint="Город или регион команды">
          <Input name="region" maxLength={48} defaultValue={team?.region ?? ""} placeholder="Алматы" className="h-12 text-[15px]" />
        </FormField>
        <div>
          <span className="mb-3 block text-[11px] font-medium uppercase tracking-[0.2em] text-fg-3">Логотип</span>
          <LogoInput current={team?.logo_url} tag={team?.tag} />
        </div>
        <FormField label="Описание" hint="Необязательно, до 400 символов">
          <Textarea
            name="description"
            rows={3}
            maxLength={400}
            defaultValue={team?.description ?? ""}
            placeholder="Пару слов о команде"
            className="text-[15px]"
          />
        </FormField>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-8">
        <SubmitButton size="lg" pendingText="Сохраняем…" className="min-w-[240px]">
          {submitLabel}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
