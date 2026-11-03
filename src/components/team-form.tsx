import type { ReactNode } from "react";
import type { Team } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "./forms";
import { Input, Textarea } from "@/components/ds";
import { LogoInput } from "./public/logo-input";
import { getT } from "@/lib/i18n/server";

function FieldBlock({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-fg-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-meta text-fg-3">{hint}</p>}
    </div>
  );
}

/** Форма команды: создание и настройки на общей F16 DS. */
export async function TeamForm({ action, team, submitLabel }: { action: FormAction; team?: Team; submitLabel: string }) {
  const t = await getT();
  return (
    <ActionForm action={action}>
      <div className="space-y-7">
        <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
          <FieldBlock id="team-name" label={t("Название")} hint={t("До 32 символов — так команду увидят в сетке")}>
            <Input id="team-name" name="name" required maxLength={32} defaultValue={team?.name} placeholder="Night Raid" autoComplete="off" className="h-12 text-[15px]" />
          </FieldBlock>
          <FieldBlock id="team-tag" label={t("Тег")} hint={t("2–6 символов")}>
            <Input
              id="team-tag"
              name="tag"
              required
              minLength={2}
              maxLength={6}
              defaultValue={team?.tag}
              placeholder="NR"
              autoComplete="off"
              className="num h-12 text-[15px] uppercase tracking-[0.12em]"
            />
          </FieldBlock>
        </div>

        <FieldBlock id="team-region" label={t("Регион")} hint={t("Город или регион команды")}>
          <Input id="team-region" name="region" maxLength={48} defaultValue={team?.region ?? ""} placeholder={t("Алматы")} className="h-12 text-[15px]" />
        </FieldBlock>

        <div>
          <span className="mb-3 block text-meta font-medium text-fg-2">{t("Логотип")}</span>
          <LogoInput current={team?.logo_url} tag={team?.tag} />
        </div>

        <FieldBlock id="team-description" label={t("Описание")} hint={t("Необязательно, до 400 символов")}>
          <Textarea
            id="team-description"
            name="description"
            rows={3}
            maxLength={400}
            defaultValue={team?.description ?? ""}
            placeholder={t("Пару слов о команде")}
            className="text-[15px]"
          />
        </FieldBlock>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-line-subtle pt-8">
        <SubmitButton size="lg" pendingText={t("Сохраняем…")} className="min-w-[240px]">
          {submitLabel}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
