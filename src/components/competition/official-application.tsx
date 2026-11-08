"use client";

import { usePathname, useRouter } from "next/navigation";
import { Check, TriangleAlert, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { registerTeam } from "@/app/actions/tournament";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { useRulesOk } from "@/components/rules-gate";
import { Button, Callout, Field, Input, cn } from "@/components/ds";
import { OrganizationInput } from "@/components/profile/profile-form";
import { RosterPicker, type PickerMember, type Slot } from "@/components/competition/registration";
import { coachAgeWarning, officialChecklist, officialRoster, parseApplication, type CheckItem, type OfficialSettings, type PlayerCheck } from "@/lib/official";
import { parseDay } from "@/lib/profile";
import { useT } from "@/lib/i18n/client";

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
  teamCoach,
  rulesGate,
}: {
  /** на странице стоит RulesGate: отправка только после прочтения регламента */
  rulesGate?: boolean;
  /** тренер команды на сайте: ready — анкета заполнена, данные подставит сервер (в браузер они не уходят) */
  teamCoach?: { nickname: string; ready: boolean } | null;
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
  const tx = useT();
  const [state, action, pending] = useActionState<ActionResult, FormData>(registerTeam, null);
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const { size, subs } = officialRoster(settings);
  const [slots, setSlots] = useState<Record<string, Slot>>(initial);
  const [v, setV] = useState<ApplicationValues>(values);
  const [touched, setTouched] = useState(false);
  const rulesOk = useRulesOk(tournamentId);
  const rulesLocked = !!rulesGate && !rulesOk;

  useEffect(() => {
    if (!state?.success) return;
    if (update) toast.success(state.success);
    else router.replace(`${path}?sent=1`, { scroll: false });
  }, [state, update, toast, router, path]);

  const chosen = members.filter((m) => !m.banned && (slots[m.player_id] === "main" || slots[m.player_id] === "sub"));
  const subCount = chosen.filter((m) => slots[m.player_id] === "sub").length;
  const coachFromTeam = settings.require_coach && !!teamCoach?.ready;
  const { errors } = useMemo(() => parseApplication((k) => v[k as keyof ApplicationValues], settings.require_coach && !coachFromTeam, tx), [v, settings.require_coach, coachFromTeam, tx]);
  const items = officialChecklist({
    t: settings,
    players: chosen.map(
      (m) => checks.find((c) => c.player_id === m.player_id) ?? { player_id: m.player_id, nickname: m.nickname, issues: [`${m.nickname}: ${tx("анкета не заполнена")}`], warnings: [] },
    ),
    mains: chosen.length - subCount,
    subs: subCount,
    application: errors,
    tx,
  });
  const coachWarning = settings.require_coach && !coachFromTeam ? coachAgeWarning(settings, parseDay(v.coach_birth_date), day, tx) : null;
  const blocked = items.filter((i) => !i.ok);
  const set = (k: keyof ApplicationValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const show = (k: keyof ApplicationValues) => (touched && errors[k] ? errors[k] : undefined);

  // красный пункт проверки — кнопка: прокрутить к полю, которое надо исправить, и поставить в него курсор
  const formRef = useRef<HTMLFormElement>(null);
  const firstError = (keys: (keyof ApplicationValues)[]) => keys.find((k) => errors[k]);
  const targetOf = (key: string): string | null => {
    if (key === "organization") return "organization";
    if (key === "captain") return "captain_phone";
    if (key === "responsible") return firstError(["responsible_name", "responsible_phone"]) ?? "responsible_name";
    if (key === "coach") return firstError(["coach_name", "coach_birth_date", "coach_workplace", "coach_position"]) ?? null;
    return null;
  };
  const goTo = (key: string) => {
    setTouched(true);
    const form = formRef.current;
    if (!form) return;
    const name = targetOf(key);
    const el = name ? form.querySelector<HTMLElement>(`[name="${name}"]`) : form.querySelector<HTMLElement>("[data-roster]");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (name) el.focus({ preventScroll: true });
  };

  const text = (k: keyof ApplicationValues, labelText: string, opts: { type?: string; placeholder?: string; hint?: string; max?: number } = {}) => (
    <Field label={labelText} required error={show(k)} hint={opts.hint}>
      {(p) => <Input {...p} name={k} type={opts.type ?? "text"} value={v[k]} onChange={set(k)} onBlur={() => setTouched(true)} placeholder={opts.placeholder} maxLength={opts.max ?? 200} state={show(k) ? "error" : undefined} />}
    </Field>
  );

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        setTouched(true);
        if (blocked.length || rulesLocked) e.preventDefault();
      }}
      noValidate
      data-f16-action-pending={pending ? "true" : undefined}
      aria-busy={pending}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {rulesGate && <input type="hidden" name="rules_ack" value={rulesOk ? "1" : ""} />}

      {/* состав */}
      <div data-roster className="scroll-mt-24 border-b border-line-subtle px-4 pb-1 pt-4 sm:px-5">
        <h3 className="text-title text-fg">{tx("Игроки")}</h3>
        <p className="mt-0.5 text-meta text-fg-3">
          {subs
            ? tx("В основе {size}, запасных — до {n}. У каждого должна быть заполнена анкета.", { size, n: subs })
            : tx("В основе {size}, без запасных — состав в заявке окончательный. У каждого должна быть заполнена анкета.", { size })}
        </p>
      </div>
      <RosterPicker members={members} size={size} subs={subs} initial={initial} onChange={setSlots} />

      {/* организация и контакты */}
      <div className="space-y-5 border-t border-line-subtle px-4 py-5 sm:px-5">
        <h3 className="text-title text-fg">{tx("Организация")}</h3>
        <Field label={tx("Полное название организации, которую представляет команда")} required error={show("organization")} hint={tx("Предприятие, учреждение, вуз или колледж — как в Приложении №1")}>
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
          {text("captain_phone", tx("Телефон капитана"), { type: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
          {text("responsible_name", tx("Ответственное лицо (ФИО)"), { placeholder: "Петров Пётр Петрович", max: 120 })}
          {text("responsible_phone", tx("Телефон ответственного"), { type: "tel", placeholder: "+7 705 123 45 67", max: 24 })}
        </div>
      </div>

      {/* тренер */}
      {coachFromTeam && (
        <div className="border-t border-line-subtle px-4 py-5 sm:px-5">
          <input type="hidden" name="coach_from_team" value="1" />
          <h3 className="text-title text-fg">{tx("Тренер")}</h3>
          <p className="mt-0.5 text-meta text-fg-3">
            {tx.rich("Тренер команды — <b>{name}</b>. ФИО, дата рождения, место работы и должность попадут в заявку из его анкеты.", { b: (c) => <span className="text-fg-2">{c}</span> }, { name: teamCoach!.nickname })}
          </p>
        </div>
      )}
      {settings.require_coach && !coachFromTeam && (
        <div className="space-y-5 border-t border-line-subtle px-4 py-5 sm:px-5">
          <div>
            <h3 className="text-title text-fg">{tx("Тренер")}</h3>
            <p className="mt-0.5 text-meta text-fg-3">
              {teamCoach
                ? tx("У тренера команды {name} не заполнена анкета — попросите его заполнить её или впишите данные вручную.", { name: teamCoach.nickname })
                : tx("Шестой участник команды. Можно вписать вручную или пригласить тренера в команду на сайте — тогда данные подставятся из его анкеты.")}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {text("coach_name", tx("ФИО тренера"), { placeholder: "Сидоров Сидор Сидорович", max: 120 })}
            {text("coach_birth_date", tx("Дата рождения"), { type: "date" })}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {text("coach_workplace", tx("Место работы или учёбы"))}
            {text("coach_position", tx("Должность или курс, группа"), { max: 120 })}
          </div>
        </div>
      )}

      {/* чек-лист */}
      <div className="border-t border-line-subtle px-4 py-5 sm:px-5">
        <h3 className="text-title text-fg">{tx("Проверка заявки")}</h3>
        <ul className="mt-3 divide-y divide-line-subtle">
          {items.map((i) => (
            <ChecklistRow key={i.key} item={i} onGo={i.ok ? undefined : () => goTo(i.key)} />
          ))}
          {coachWarning && <ChecklistRow item={{ key: "coach-age", label: tx("Возраст тренера"), ok: true, warn: true, detail: coachWarning }} />}
        </ul>
        <p className="mt-3 text-meta text-fg-3">
          {tx("Справки с места работы или учёбы (студенческие билеты) участники сдают организатору на бумаге — без полного комплекта документов команда не допускается.")}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className={cn("min-w-0 text-meta", rulesLocked && !blocked.length ? "font-medium text-warn" : "text-fg-3")}>
          {blocked.length ? tx("Осталось исправить: {n}", { n: blocked.length }) : rulesLocked ? tx("Сначала прочитайте регламент турнира выше и поставьте галочку.") : footer}
        </div>
        <Button type="submit" size="lg" loading={pending} disabled={blocked.length > 0 || rulesLocked} className="w-full sm:w-auto">
          {pending ? (update ? tx("Сохраняем…") : tx("Отправляем…")) : label}
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

function ChecklistRow({ item, onGo }: { item: CheckItem; onGo?: () => void }) {
  const tx = useT();
  const tone = !item.ok ? "fail" : item.warn ? "warn" : "ok";
  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
          tone === "ok" && "bg-ok/15 text-ok",
          tone === "warn" && "bg-warn/15 text-warn",
          tone === "fail" && "bg-danger/15 text-danger",
        )}
      >
        {tone === "ok" ? <Check className="size-3.5" /> : tone === "warn" ? <TriangleAlert className="size-3.5" /> : <X className="size-3.5" />}
        <span className="sr-only">{tone === "ok" ? tx("выполнено") : tone === "warn" ? tx("предупреждение") : tx("не выполнено")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-fg">{item.label}</span>
        {item.detail && <span className={cn("block text-meta", tone === "fail" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg-3")}>{item.detail}</span>}
      </span>
      {onGo && <span className="mt-0.5 shrink-0 text-meta font-medium text-accent">{tx("Исправить")} →</span>}
    </>
  );
  return (
    <li>
      {onGo ? (
        <button type="button" onClick={onGo} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-ink/[0.04]">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 py-2.5">{body}</div>
      )}
    </li>
  );
}
