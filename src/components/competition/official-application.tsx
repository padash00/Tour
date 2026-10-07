"use client";

import { usePathname, useRouter } from "next/navigation";
import { Check, TriangleAlert, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { registerTeam } from "@/app/actions/tournament";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { Button, Callout, Field, Input, cn } from "@/components/ds";
import { OrganizationInput } from "@/components/profile/profile-form";
import { RosterPicker, type PickerMember, type Slot } from "@/components/competition/registration";
import { coachAgeWarning, officialChecklist, officialRoster, parseApplication, type CheckItem, type OfficialSettings, type PlayerCheck } from "@/lib/official";
import { parseDay } from "@/lib/profile";

/*
 * Заявка на официальный турнир: состав без запасных, данные организации, ответственного лица и тренера,
 * чек-лист ✓/✕ до отправки. Отправить можно, только когда все пункты выполнены.
 * Те же проверки — в registerTeam и в RPC save_official_registration (главные).
 */

export type ApplicationValues = Record<
  "organization" | "captain_phone" | "responsible_name" | "responsible_phone" | "coach_name" | "coach_birth_date" | "coach_workplace" | "coach_position",
  string
>;

export function OfficialApplicationForm({
  tournamentId,
  settings,
  day,
  members,
  initial,
  checks,
  values,
  suggestions,
  update,
  label,
  footer,
}: {
  tournamentId: string;
  settings: OfficialSettings;
  /** день турнира YYYY-MM-DD — возраст считается на него */
  day: string;
  members: PickerMember[];
  initial: Record<string, Slot>;
  /** итог проверки анкет игроков команды — без самих персональных данных */
  checks: PlayerCheck[];
  values: ApplicationValues;
  suggestions: string[];
  update: boolean;
  label: string;
  footer: string;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(registerTeam, null);
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const { size, subs } = officialRoster(settings);
  const [slots, setSlots] = useState<Record<string, Slot>>(initial);
  const [v, setV] = useState<ApplicationValues>(values);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!state?.success) return;
    if (update) toast.success(state.success);
    else router.replace(`${path}?sent=1`, { scroll: false });
  }, [state, update, toast, router, path]);

  const chosen = members.filter((m) => !m.banned && (slots[m.player_id] === "main" || slots[m.player_id] === "sub"));
  const subCount = chosen.filter((m) => slots[m.player_id] === "sub").length;
  const { errors } = useMemo(() => parseApplication((k) => v[k as keyof ApplicationValues], settings.require_coach), [v, settings.require_coach]);
  const items = officialChecklist({
    t: settings,
    players: chosen.map(
      (m) => checks.find((c) => c.player_id === m.player_id) ?? { player_id: m.player_id, nickname: m.nickname, issues: [`${m.nickname}: анкета не заполнена`], warnings: [] },
    ),
    mains: chosen.length - subCount,
    subs: subCount,
    application: errors,
  });
  const coachWarning = settings.require_coach ? coachAgeWarning(settings, parseDay(v.coach_birth_date), day) : null;
  const blocked = items.filter((i) => !i.ok);
  const set = (k: keyof ApplicationValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const show = (k: keyof ApplicationValues) => (touched && errors[k] ? errors[k] : undefined);

  const text = (k: keyof ApplicationValues, labelText: string, opts: { type?: string; placeholder?: string; hint?: string; max?: number } = {}) => (
    <Field label={labelText} required error={show(k)} hint={opts.hint}>
      {(p) => <Input {...p} name={k} type={opts.type ?? "text"} value={v[k]} onChange={set(k)} onBlur={() => setTouched(true)} placeholder={opts.placeholder} maxLength={opts.max ?? 200} state={show(k) ? "error" : undefined} />}
    </Field>
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        setTouched(true);
        if (blocked.length) e.preventDefault();
      }}
      noValidate
      data-f16-action-pending={pending ? "true" : undefined}
      aria-busy={pending}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />

      {/* состав */}
      <div className="border-b border-line-subtle px-4 pb-1 pt-4 sm:px-5">
        <h3 className="text-title text-fg">Игроки</h3>
        <p className="mt-0.5 text-meta text-fg-3">
          В основе {size}
          {subs ? `, запасных — до ${subs}` : ", без запасных — состав в заявке окончательный"}. У каждого должна быть заполнена анкета.
        </p>
      </div>
      <RosterPicker members={members} size={size} subs={subs} initial={initial} onChange={setSlots} />

      {/* организация и контакты */}
      <div className="space-y-5 border-t border-line-subtle px-4 py-5 sm:px-5">
        <h3 className="text-title text-fg">Организация</h3>
        <Field label="Полное название организации, которую представляет команда" required error={show("organization")} hint="Предприятие, учреждение, вуз или колледж — как в Приложении №1">
          {(p) => (
            <OrganizationInput
              {...p}
              suggestions={suggestions}
              name="organization"
              value={v.organization}
              onChange={set("organization")}
              onBlur={() => setTouched(true)}
              maxLength={200}
              placeholder="ВКТУ им. Д. Серикбаева"
              state={show("organization") ? "error" : undefined}
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          {text("captain_phone", "Телефон капитана", { type: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
          {text("responsible_name", "Ответственное лицо (ФИО)", { placeholder: "Петров Пётр Петрович", max: 120 })}
          {text("responsible_phone", "Телефон ответственного", { type: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
        </div>
      </div>

      {/* тренер */}
      {settings.require_coach && (
        <div className="space-y-5 border-t border-line-subtle px-4 py-5 sm:px-5">
          <div>
            <h3 className="text-title text-fg">Тренер</h3>
            <p className="mt-0.5 text-meta text-fg-3">Шестой участник команды. Аккаунт на сайте тренеру не нужен.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {text("coach_name", "ФИО тренера", { placeholder: "Сидоров Сидор Сидорович", max: 120 })}
            {text("coach_birth_date", "Дата рождения", { type: "date" })}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {text("coach_workplace", "Место работы или учёбы")}
            {text("coach_position", "Должность или курс, группа", { max: 120 })}
          </div>
        </div>
      )}

      {/* чек-лист */}
      <div className="border-t border-line-subtle px-4 py-5 sm:px-5">
        <h3 className="text-title text-fg">Проверка заявки</h3>
        <ul className="mt-3 divide-y divide-line-subtle">
          {items.map((i) => (
            <ChecklistRow key={i.key} item={i} />
          ))}
          {coachWarning && <ChecklistRow item={{ key: "coach-age", label: "Возраст тренера", ok: true, warn: true, detail: coachWarning }} />}
        </ul>
        <p className="mt-3 text-meta text-fg-3">
          Справки с места работы или учёбы (студенческие билеты) участники сдают организатору на бумаге — без полного комплекта документов команда не
          допускается.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-meta text-fg-3">{blocked.length ? `Осталось исправить: ${blocked.length}` : footer}</div>
        <Button type="submit" size="lg" loading={pending} disabled={blocked.length > 0} className="w-full sm:w-auto">
          {pending ? (update ? "Сохраняем…" : "Отправляем…") : label}
        </Button>
      </div>
      {state?.error && (
        <div className="px-4 pb-4 sm:px-5">
          <Callout tone="danger">{state.error}</Callout>
        </div>
      )}
    </form>
  );
}

function ChecklistRow({ item }: { item: CheckItem }) {
  const tone = !item.ok ? "fail" : item.warn ? "warn" : "ok";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
          tone === "ok" && "bg-ok/15 text-ok",
          tone === "warn" && "bg-warn/15 text-warn",
          tone === "fail" && "bg-danger/15 text-danger",
        )}
      >
        {tone === "ok" ? <Check className="size-3.5" /> : tone === "warn" ? <TriangleAlert className="size-3.5" /> : <X className="size-3.5" />}
        <span className="sr-only">{tone === "ok" ? "выполнено" : tone === "warn" ? "предупреждение" : "не выполнено"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-fg">{item.label}</span>
        {item.detail && <span className={cn("block text-meta", tone === "fail" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg-3")}>{item.detail}</span>}
      </span>
    </li>
  );
}
