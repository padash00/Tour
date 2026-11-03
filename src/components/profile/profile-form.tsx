"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { saveContact, startTelegramLink, type ProfileActionResult } from "@/app/actions/player-profile";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { Button, Callout, Checkbox, ConfirmDialog, Dialog, Field, Input, Radio, cn } from "@/components/ds";

/** Флаг «анкета только что сохранена»: форма после сохранения пересоздаётся (key=updated_at), окно не должно пропасть */
const SAVED_FLAG = "f16-profile-saved";
import { OCCUPATIONS, almatyDay, formatPhone, parseProfileForm, type Occupation, type ProfileErrors } from "@/lib/profile";
import type { PlayerProfile } from "@/lib/types";
import { tr, type T } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

/*
 * Анкета игрока (F16 DS). Ошибки — под полями. Проверка до отправки — та же функция parseProfileForm,
 * что на сервере; главная проверка всегда на сервере.
 */

type Values = Record<"last_name" | "first_name" | "patronymic" | "birth_date" | "phone" | "city" | "organization" | "position" | "course" | "study_group" | "telegram", string>;

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
  telegram: p?.telegram ? `@${p.telegram}` : "",
});

/** Поля в порядке формы — для перехода к первой ошибке */
const FIELD_ORDER: { key: keyof ProfileErrors; label: string }[] = [
  { key: "last_name", label: tr("Фамилия") },
  { key: "first_name", label: tr("Имя") },
  { key: "patronymic", label: tr("Отчество") },
  { key: "birth_date", label: tr("Дата рождения") },
  { key: "phone", label: tr("Телефон") },
  { key: "telegram", label: tr("Связь (WhatsApp или Telegram)") },
  { key: "city", label: tr("Город") },
  { key: "occupation", label: tr("Работа или учёба") },
  { key: "organization", label: tr("Место работы или учёбы") },
  { key: "position", label: tr("Должность") },
  { key: "course", label: tr("Курс / класс") },
  { key: "study_group", label: tr("Группа") },
  { key: "consent", label: tr("Согласие на обработку данных") },
];

/** Прокрутить к первому полю с ошибкой, поставить в него курсор и сказать, что не так */
function showFirstError(t: T, form: HTMLFormElement, errs: Partial<Record<string, string | undefined>>, notify: (msg: string) => void) {
  const first = FIELD_ORDER.find((f) => errs[f.key]);
  if (!first) return;
  const el = form.querySelector<HTMLElement>(`[name="${first.key}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.focus({ preventScroll: true });
  notify(`${t(first.label)}: ${t(errs[first.key] ?? "")}`);
}

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
  submitLabel = tr("Сохранить анкету"),
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
  const t = useT();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ProfileActionResult, FormData>(action, null);
  const [v, setV] = useState<Values>(() => fromProfile(profile, defaultCity));
  const [occupation, setOccupation] = useState<Occupation | null>(profile?.occupation ?? null);
  const [whatsapp, setWhatsapp] = useState(!!profile?.whatsapp);
  const [consent, setConsent] = useState(false);
  const [local, setLocal] = useState<ProfileErrors | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // окно «Анкета сохранена» — заметнее тоста: игроки не видели подтверждения и жали «Сохранить» по нескольку раз
  const [savedOpen, setSavedOpen] = useState(false);
  useEffect(() => {
    if (admin) return;
    // после пересоздания формы: флаг из sessionStorage (внешнее состояние) → открыть окно
    const timer = setTimeout(() => {
      try {
        if (sessionStorage.getItem(SAVED_FLAG)) {
          sessionStorage.removeItem(SAVED_FLAG);
          setSavedOpen(true);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [admin]);

  useEffect(() => {
    if (state?.success && !admin) {
      try {
        sessionStorage.setItem(SAVED_FLAG, "1");
      } catch {}
      const timer = setTimeout(() => {
        try {
          sessionStorage.removeItem(SAVED_FLAG);
        } catch {}
        setSavedOpen(true);
      }, 0);
      return () => clearTimeout(timer);
    } else if (state?.success) toast.success(state.success);
    // ошибки с сервера — так же, как проверка в браузере: к первому полю и сообщение
    if (state?.fields && formRef.current) showFirstError(t, formRef.current, state.fields, toast.error);
  }, [state, toast, admin, t]);

  const errors: Record<string, string | undefined> = Object.fromEntries(Object.entries({ ...(state?.fields ?? {}), ...(local ?? {}) }).map(([k, msg]) => [k, msg ? t(msg) : msg]));
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (local?.[k as keyof ProfileErrors]) setLocal((x) => ({ ...x, [k]: undefined }));
  };
  const disabled = !!locked && !admin;
  const needConsent = !admin && !consentCurrent;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const { errors: found } = parseProfileForm((k) => fd.get(k), almatyDay(), !admin);
    const all: ProfileErrors = { ...found, ...(needConsent && !consent ? { consent: tr("Отметьте согласие") } : {}) };
    if (Object.values(all).some(Boolean)) {
      e.preventDefault();
      setLocal(all);
      // ошибка может быть выше экрана (телефон) — иначе кажется, что кнопка не работает
      showFirstError(t, e.currentTarget, all, toast.error);
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
    <>
    <Dialog
      open={savedOpen}
      onClose={() => setSavedOpen(false)}
      size="sm"
      title={
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-[22px] font-bold text-accent-ink" aria-hidden>
            ✓
          </span>
          {t("Анкета сохранена")}
        </span>
      }
      description={t("Данные записаны. Теперь можно собрать команду и подать заявку на турнир.")}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setSavedOpen(false)}>
            {t("Закрыть")}
          </Button>
          <Button href="/find" variant="secondary">
            {t("Поиск команды")}
          </Button>
          <Button href="/team">{t("Моя команда")}</Button>
        </div>
      }
    />
    {disabled && !admin && <LockedContact profile={profile} />}
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-8" data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
      {next && <input type="hidden" name="next" value={next} />}
      {playerId && <input type="hidden" name="playerId" value={playerId} />}
      {locked && (
        <Callout tone="warn" title={admin ? t("Анкета зафиксирована для игрока") : t("Анкета зафиксирована")}>
          {locked}
        </Callout>
      )}

      <fieldset className="space-y-5" disabled={disabled}>
        <legend className="mb-4 text-title text-fg">{t("Личные данные")}</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("last_name", t("Фамилия"), { required: true, placeholder: "Иванов" })}
          {text("first_name", t("Имя"), { required: true, placeholder: "Иван" })}
          {text("patronymic", t("Отчество"), { hint: t("Если есть"), placeholder: "Иванович" })}
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("birth_date", t("Дата рождения"), { required: true, type: "date", hint: t("Возраст проверяется на дату турнира") })}
          {text("phone", t("Телефон"), { required: true, type: "tel", inputMode: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
          {text("city", t("Город"), { required: true, placeholder: "Усть-Каменогорск", hint: t("Где живёте, учитесь или работаете") })}
        </div>
        {!disabled && (
        <div className="rounded-control border border-line-subtle bg-surface-2/40 p-4">
          <p className="text-[15px] font-semibold text-fg">
            {t("Связь с вами")} <span className="text-danger">*</span>
          </p>
          <p className="mt-0.5 text-meta text-fg-3">{t("Организатор напишет о матчах и изменениях. Отметьте WhatsApp или укажите Telegram — можно и то, и другое.")}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-end">
            <Checkbox
              name="whatsapp"
              checked={whatsapp}
              onChange={(e) => {
                setWhatsapp(e.target.checked);
                if (e.target.checked) setLocal((x) => (x ? { ...x, telegram: undefined } : x));
              }}
              label={t("На мой телефон можно писать в WhatsApp")}
            />
            {text("telegram", "Telegram", { placeholder: "@nickname", max: 40 })}
          </div>
          {!admin && <TelegramVerify verifiedAt={profile?.telegram_verified_at ?? null} />}
        </div>
        )}
      </fieldset>

      <fieldset className="space-y-5" disabled={disabled}>
        <legend className="mb-4 text-title text-fg">{t("Работа или учёба")}</legend>
        <div role="radiogroup" aria-label={t("Занятость")} className="flex flex-wrap gap-x-6 gap-y-3">
          {(Object.keys(OCCUPATIONS) as Occupation[]).map((o) => (
            <Radio
              key={o}
              name="occupation"
              value={o}
              label={t(OCCUPATIONS[o])}
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
              label={occupation === "works" ? t("Место работы") : occupation === "studies" ? t("Учебное заведение") : t("Место работы или учёбы")}
              required={occupation !== "other"}
              hint={occupation === "other" ? t("Необязательно") : t("Полное название — выберите из подсказок или впишите своё")}
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
                  placeholder={occupation === "studies" ? "ВКТУ им. Д. Серикбаева" : t("Название организации")}
                  disabled={disabled}
                  state={errors.organization ? "error" : undefined}
                />
              )}
            </Field>
            {occupation === "works" && text("position", t("Должность"), { required: true, placeholder: t("Инженер") })}
            {occupation === "studies" && (
              <>
                {text("course", t("Курс / класс"), { required: true, placeholder: "2", max: 20 })}
                {text("study_group", t("Группа"), { required: true, placeholder: "ИС-21", hint: t("Школьникам — буква класса, например «Б»"), max: 30 })}
              </>
            )}
          </div>
        )}
      </fieldset>

      {admin ? (
        !profile?.consent_at && (
          <Checkbox
            name="paper_consent"
            label={t("Согласие на обработку персональных данных получено (в том числе на бумаге)")}
            description={t("Без согласия анкета считается незаполненной.")}
          />
        )
      ) : (
        !disabled &&
        (consentCurrent ? (
          <p className="text-meta text-fg-3">
            {t.rich("Согласие на обработку персональных данных дано. <a>Политика обработки данных</a>", { a: (c) => <Link href="/privacy" className="text-accent hover:underline">{c}</Link> })}
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
                t.rich("Я согласен(-на) на сбор и обработку моих персональных данных в соответствии с Законом РК «О персональных данных и их защите» и <a>политикой обработки данных</a>", {
                  a: (c) => (
                    <Link href="/privacy" target="_blank" className="text-accent hover:underline">
                      {c}
                    </Link>
                  ),
                })
              }
              description={t("Данные нужны для организации турниров и отчётов соорганизаторам (например, акимату). Их видите только вы и администраторы.")}
            />
            {errors.consent && <p className="mt-1.5 text-meta text-danger">{errors.consent}</p>}
          </div>
        ))
      )}

      {state?.error && !state.fields && <Callout tone="danger">{state.error}</Callout>}
      {(state?.fields || local) && Object.values(errors).some(Boolean) && <Callout tone="danger">{t("Проверьте отмеченные поля.")}</Callout>}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-6">
          <Button type="submit" size="lg" loading={pending}>
            {pending ? t("Сохраняем…") : t(submitLabel)}
          </Button>
          {next && <span className="text-meta text-fg-3">{t("После сохранения вернём вас обратно.")}</span>}
        </div>
      )}
    </form>
    </>
  );
}

/** Удаление анкеты — с подтверждением в модальном окне */
export function DeleteProfileButton({
  action,
  label = tr("Удалить анкету"),
  title = tr("Удалить анкету?"),
  description = tr("ФИО, дата рождения, телефон и место учёбы или работы будут удалены. Аккаунт, команда и статистика останутся. Без анкеты нельзя создать команду и подать заявку на турнир."),
  fields,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  label?: string;
  title?: string;
  description?: string;
  fields?: Record<string, string>;
}) {
  const t = useT();
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
        {t(label)}
      </Button>
      <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={run} title={t(title)} description={t(description)} confirmLabel={t(label)} danger loading={pending} />
    </>
  );
}

/** Подтверждение Telegram через бота: одноразовая ссылка t.me/<бот>?start=<токен> */
function TelegramVerify({ verifiedAt }: { verifiedAt: string | null }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [opened, setOpened] = useState(false);
  if (verifiedAt) {
    return <p className="mt-3 text-meta font-semibold text-ok">✓ {t("Telegram подтверждён — уведомления приходят в бот @f16_tournament_bot")}</p>;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await startTelegramLink();
            if (r.error || !r.url) return toast.error(r.error ?? t("Не удалось открыть бота"));
            window.open(r.url, "_blank", "noopener");
            setOpened(true);
          })
        }
      >
        {t("Подтвердить через Telegram-бота")}
      </Button>
      <span className="text-meta text-fg-3">
        {opened ? t("В боте нажмите «Старт», затем обновите эту страницу.") : t("Бот пришлёт уведомления о команде, заявках и матчах.")}
      </span>
    </div>
  );
}

/** Связь при зафиксированной анкете: WhatsApp/Telegram и подтверждение бота — игрок меняет сам */
function LockedContact({ profile }: { profile: PlayerProfile | null }) {
  const t = useT();
  const toast = useToast();
  const [state, action, pending] = useActionState<ProfileActionResult, FormData>(saveContact, null);
  const [whatsapp, setWhatsapp] = useState(!!profile?.whatsapp);
  const [tg, setTg] = useState(profile?.telegram ? `@${profile.telegram}` : "");
  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state, toast]);
  return (
    <form action={action} className="mb-8 rounded-control border border-accent/40 bg-accent-dim/20 p-4">
      <p className="text-[15px] font-semibold text-fg">{t("Связь с вами")}</p>
      <p className="mt-0.5 text-meta text-fg-3">{t("Анкета зафиксирована турниром, но контакт для связи можно менять. Отметьте WhatsApp или укажите Telegram.")}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:items-end">
        <Checkbox name="whatsapp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} label={t("На мой телефон можно писать в WhatsApp")} />
        <Field label="Telegram" error={state?.fields?.telegram ? t(state.fields.telegram) : undefined}>
          {(p) => <Input {...p} name="telegram" value={tg} onChange={(e) => setTg(e.target.value)} placeholder="@nickname" maxLength={40} />}
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          {t("Сохранить контакт")}
        </Button>
      </div>
      <TelegramVerify verifiedAt={profile?.telegram_verified_at ?? null} />
    </form>
  );
}
