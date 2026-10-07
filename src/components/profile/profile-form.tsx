"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState, useTransition } from "react";
import type { ProfileActionResult } from "@/app/actions/player-profile";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { Button, Callout, Checkbox, ConfirmDialog, Field, Input, Radio, cn } from "@/components/ds";
import { OCCUPATIONS, almatyDay, formatPhone, parseProfileForm, type Occupation, type ProfileErrors } from "@/lib/profile";
import type { PlayerProfile } from "@/lib/types";

/*
 * Анкета игрока (F16 DS). Ошибки — под полями. Проверка до отправки — та же функция parseProfileForm,
 * что на сервере; главная проверка всегда на сервере.
 */

type Values = Record<"last_name" | "first_name" | "patronymic" | "birth_date" | "phone" | "city" | "organization" | "position" | "course" | "study_group", string>;

const fromProfile = (p: PlayerProfile | null, defaultCity: string): Values => ({
  last_name: p?.last_name ?? "",
  first_name: p?.first_name ?? "",
  patronymic: p?.patronymic ?? "",
  birth_date: p?.birth_date ?? "",
  phone: formatPhone(p?.phone),
  city: p?.city ?? defaultCity,
  organization: p?.organization ?? "",
  position: p?.position ?? "",
  course: p?.course ?? "",
  study_group: p?.study_group ?? "",
});

/** Поле ввода организации с подсказками (стартовый список и уже введённые названия) */
export function OrganizationInput({ suggestions, ...props }: React.ComponentProps<typeof Input> & { suggestions: string[] }) {
  const listId = useId();
  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

export function ProfileForm({
  action,
  profile,
  suggestions,
  next,
  admin,
  playerId,
  locked,
  consentCurrent,
  defaultCity = "Усть-Каменогорск",
  submitLabel = "Сохранить анкету",
}: {
  action: (prev: ProfileActionResult, formData: FormData) => Promise<ProfileActionResult>;
  profile: PlayerProfile | null;
  suggestions: string[];
  /** куда вернуться после сохранения */
  next?: string;
  /** форма администратора: без согласия игрока, с отметкой «согласие получено на бумаге» */
  admin?: boolean;
  playerId?: string;
  /** почему игрок не может менять анкету (официальный турнир) */
  locked?: string | null;
  /** согласие текущей версии политики уже дано */
  consentCurrent?: boolean;
  defaultCity?: string;
  submitLabel?: string;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ProfileActionResult, FormData>(action, null);
  const [v, setV] = useState<Values>(() => fromProfile(profile, defaultCity));
  const [occupation, setOccupation] = useState<Occupation | null>(profile?.occupation ?? null);
  const [consent, setConsent] = useState(false);
  const [local, setLocal] = useState<ProfileErrors | null>(null);

  useEffect(() => {
    if (state?.success) toast.success(state.success);
  }, [state, toast]);

  const errors: Record<string, string | undefined> = { ...(state?.fields ?? {}), ...(local ?? {}) };
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (local?.[k as keyof ProfileErrors]) setLocal((x) => ({ ...x, [k]: undefined }));
  };
  const disabled = !!locked && !admin;
  const needConsent = !admin && !consentCurrent;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const { errors: found } = parseProfileForm((k) => fd.get(k), almatyDay());
    const all: ProfileErrors = { ...found, ...(needConsent && !consent ? { consent: "Отметьте согласие" } : {}) };
    if (Object.values(all).some(Boolean)) {
      e.preventDefault();
      setLocal(all);
    } else setLocal(null);
  };

  const text = (k: keyof Values, label: string, opts: { required?: boolean; hint?: string; placeholder?: string; type?: string; inputMode?: "tel" | "numeric"; max?: number } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint} error={errors[k]}>
      {(p) => (
        <Input
          {...p}
          name={k}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          value={v[k]}
          onChange={set(k)}
          placeholder={opts.placeholder}
          maxLength={opts.max ?? 80}
          disabled={disabled}
          state={errors[k] ? "error" : undefined}
        />
      )}
    </Field>
  );

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-8" data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
      {next && <input type="hidden" name="next" value={next} />}
      {playerId && <input type="hidden" name="playerId" value={playerId} />}
      {locked && (
        <Callout tone="warn" title={admin ? "Анкета зафиксирована для игрока" : "Анкета зафиксирована"}>
          {locked}
        </Callout>
      )}

      <fieldset className="space-y-5" disabled={disabled}>
        <legend className="mb-4 text-title text-fg">Личные данные</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("last_name", "Фамилия", { required: true, placeholder: "Иванов" })}
          {text("first_name", "Имя", { required: true, placeholder: "Иван" })}
          {text("patronymic", "Отчество", { hint: "Если есть", placeholder: "Иванович" })}
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("birth_date", "Дата рождения", { required: true, type: "date", hint: "Возраст проверяется на дату турнира" })}
          {text("phone", "Телефон", { required: true, type: "tel", inputMode: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
          {text("city", "Город", { required: true, placeholder: "Усть-Каменогорск", hint: "Где живёте, учитесь или работаете" })}
        </div>
      </fieldset>

      <fieldset className="space-y-5" disabled={disabled}>
        <legend className="mb-4 text-title text-fg">Работа или учёба</legend>
        <div role="radiogroup" aria-label="Занятость" className="flex flex-wrap gap-x-6 gap-y-3">
          {(Object.keys(OCCUPATIONS) as Occupation[]).map((o) => (
            <Radio
              key={o}
              name="occupation"
              value={o}
              label={OCCUPATIONS[o]}
              checked={occupation === o}
              onChange={() => {
                setOccupation(o);
                setLocal((x) => (x ? { ...x, occupation: undefined } : x));
              }}
            />
          ))}
        </div>
        {errors.occupation && <p className="text-meta text-danger">{errors.occupation}</p>}
        {occupation && (
          <div className={cn("grid gap-5", occupation === "studies" ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" : "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
            <Field
              label={occupation === "works" ? "Место работы" : occupation === "studies" ? "Учебное заведение" : "Место работы или учёбы"}
              required={occupation !== "other"}
              hint={occupation === "other" ? "Необязательно" : "Полное название — выберите из подсказок или впишите своё"}
              error={errors.organization}
            >
              {(p) => (
                <OrganizationInput
                  {...p}
                  suggestions={suggestions}
                  name="organization"
                  value={v.organization}
                  onChange={set("organization")}
                  maxLength={160}
                  placeholder={occupation === "studies" ? "ВКТУ им. Д. Серикбаева" : "Название организации"}
                  disabled={disabled}
                  state={errors.organization ? "error" : undefined}
                />
              )}
            </Field>
            {occupation === "works" && text("position", "Должность", { required: true, placeholder: "Инженер" })}
            {occupation === "studies" && (
              <>
                {text("course", "Курс / класс", { required: true, placeholder: "2", max: 20 })}
                {text("study_group", "Группа", { required: true, placeholder: "ИС-21", max: 30 })}
              </>
            )}
          </div>
        )}
      </fieldset>

      {admin ? (
        !profile?.consent_at && (
          <Checkbox
            name="paper_consent"
            label="Согласие на обработку персональных данных получено (в том числе на бумаге)"
            description="Без согласия анкета считается незаполненной."
          />
        )
      ) : (
        !disabled &&
        (consentCurrent ? (
          <p className="text-meta text-fg-3">
            Согласие на обработку персональных данных дано. <Link href="/privacy" className="text-accent hover:underline">Политика обработки данных</Link>
          </p>
        ) : (
          <div>
            <Checkbox
              name="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setLocal((x) => (x ? { ...x, consent: undefined } : x));
              }}
              label={
                <>
                  Я согласен(-на) на сбор и обработку моих персональных данных в соответствии с Законом РК «О персональных данных и их защите» и{" "}
                  <Link href="/privacy" target="_blank" className="text-accent hover:underline">
                    политикой обработки данных
                  </Link>
                </>
              }
              description="Данные нужны для организации турниров и отчётов соорганизаторам (например, акимату). Их видите только вы и администраторы."
            />
            {errors.consent && <p className="mt-1.5 text-meta text-danger">{errors.consent}</p>}
          </div>
        ))
      )}

      {state?.error && !state.fields && <Callout tone="danger">{state.error}</Callout>}
      {(state?.fields || local) && Object.values(errors).some(Boolean) && <Callout tone="danger">Проверьте отмеченные поля.</Callout>}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-6">
          <Button type="submit" size="lg" loading={pending}>
            {pending ? "Сохраняем…" : submitLabel}
          </Button>
          {next && <span className="text-meta text-fg-3">После сохранения вернём вас обратно.</span>}
        </div>
      )}
    </form>
  );
}

/** Удаление анкеты — с подтверждением в модальном окне */
export function DeleteProfileButton({
  action,
  label = "Удалить анкету",
  title = "Удалить анкету?",
  description = "ФИО, дата рождения, телефон и место учёбы или работы будут удалены. Аккаунт, команда и статистика останутся. Без анкеты нельзя создать команду и подать заявку на турнир.",
  fields,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  label?: string;
  title?: string;
  description?: string;
  fields?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = () =>
    start(async () => {
      const fd = new FormData();
      for (const [k, val] of Object.entries(fields ?? {})) fd.set(k, val);
      const r = await action(null, fd);
      setOpen(false);
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
    });
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger/80 hover:text-danger" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={run} title={title} description={description} confirmLabel={label} danger loading={pending} />
    </>
  );
}
