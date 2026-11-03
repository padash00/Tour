"use client";

import { usePathname, useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { checkIn, registerTeam, withdrawRegistration } from "@/app/actions/tournament";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { useRulesOk } from "@/components/rules-gate";
import { Avatar, Button, Callout, ConfirmDialog, FaceitLevel, Status, Timer, cn } from "@/components/ds";
import { formatDateTime, formatTime } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { tr } from "@/lib/i18n/core";

/*
 * Клиентская часть регистрации и check-in (F16 DS).
 * Бизнес-правила — в существующих server actions (registerTeam / withdrawRegistration / checkIn);
 * здесь только подсказки до отправки. Главная проверка всегда на сервере.
 */

// ───────────────────────── выбор состава

export type Slot = "main" | "sub" | "out";

export type PickerMember = {
  player_id: string;
  nickname: string;
  avatar_url: string | null;
  faceit_level: number | null;
  banned: boolean;
  captain: boolean;
};

const SLOT_LABEL: Record<Slot, string> = { main: tr("Основа"), sub: tr("Запас"), out: tr("Не играет") };

/** Капитан распределяет игроков: основа ровно под режим, запас — до лимита, остальные не играют */
export function RosterPicker({
  members,
  size,
  subs,
  initial,
  onChange,
}: {
  members: PickerMember[];
  size: number;
  subs: number;
  initial: Record<string, Slot>;
  /** выбор изменился — для проверок заявки до отправки (официальный турнир) */
  onChange?: (slots: Record<string, Slot>) => void;
}) {
  const tx = useT();
  const [slots, setSlotsState] = useState<Record<string, Slot>>(initial);
  const setSlots = (update: (cur: Record<string, Slot>) => Record<string, Slot>) => {
    const next = update(slots);
    setSlotsState(next);
    onChange?.(next);
  };
  const count = (s: Slot) => members.filter((m) => !m.banned && (slots[m.player_id] ?? "out") === s).length;
  const mains = count("main");
  const benched = count("sub");
  const need = size - mains;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-subtle px-4 py-3 sm:px-5">
        <div className="num flex items-center gap-2 text-[14px] font-medium text-fg">
          <span className={mains === size ? "text-ok" : "text-fg"}>
            {tx("Основа")} {mains}/{size}
          </span>
          {subs > 0 && (
            <>
              <span className="text-fg-4" aria-hidden>
                ·
              </span>
              <span className="text-fg-2">
                {tx("Запас")} {benched}/{subs}
              </span>
            </>
          )}
        </div>
        <p aria-live="polite" className={cn("flex items-center gap-1.5 text-meta", need === 0 ? "text-ok" : "text-warn")}>
          {need === 0 ? (
            <>
              <Check className="size-3.5" aria-hidden /> {tx("Основа собрана")}
            </>
          ) : (
            tx("Выберите в основу ещё {n}", { n: need })
          )}
        </p>
      </div>
      <ul className="divide-y divide-line-subtle">
        {members.map((m) => {
          const s = m.banned ? "out" : (slots[m.player_id] ?? "out");
          const options: Slot[] = subs > 0 ? ["main", "sub", "out"] : ["main", "out"];
          const full = (o: Slot) => (o === "main" && s !== "main" && mains >= size) || (o === "sub" && s !== "sub" && benched >= subs);
          return (
            <li key={m.player_id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-5", m.banned && "bg-danger-dim/30")}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={m.avatar_url} name={m.nickname} size="md" className={cn((m.banned || s === "out") && "opacity-60")} />
                <div className="min-w-0">
                  <div className={cn("truncate text-[15px] font-medium", m.banned || s === "out" ? "text-fg-3" : "text-fg")}>{m.nickname}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-meta text-fg-3">
                    {m.banned ? <span className="text-danger">{tx("Заблокирован")}</span> : m.captain ? tx("Капитан") : tx(SLOT_LABEL[s])}
                    <FaceitLevel level={m.faceit_level} />
                  </div>
                </div>
              </div>
              {m.banned ? (
                <Status info={{ label: tx("Недоступен"), tone: "danger" }} size="sm" />
              ) : (
                <div role="radiogroup" aria-label={tx("Роль в заявке: {name}", { name: m.nickname })} className="flex w-full rounded-control border border-line bg-surface-2 p-0.5 sm:w-auto">
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={s === o}
                      disabled={full(o)}
                      title={full(o) ? (o === "main" ? tx("Основа уже собрана") : tx("Запас заполнен")) : undefined}
                      onClick={() => setSlots((cur) => ({ ...cur, [m.player_id]: o }))}
                      className={cn(
                        "h-9 flex-1 whitespace-nowrap rounded-[6px] px-3 text-[13px] font-medium transition-colors duration-[var(--dur-hover)] disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none",
                        s === o ? (o === "main" ? "bg-accent text-accent-ink" : "bg-ink/[0.1] text-fg") : "text-fg-3 hover:text-fg",
                      )}
                    >
                      {tx(SLOT_LABEL[o])}
                    </button>
                  ))}
                </div>
              )}
              {s === "main" && <input type="hidden" name="main" value={m.player_id} />}
              {s === "sub" && <input type="hidden" name="sub" value={m.player_id} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── отправка заявки

/**
 * Форма заявки поверх registerTeam. mains — сколько игроков должно быть в основе (проверка до отправки);
 * update — правка состава активной заявки (успех — тостом), иначе после успеха страница показывает «заявка отправлена».
 */
export function RegisterForm({
  tournamentId,
  mains,
  update,
  label,
  pendingLabel,
  variant = "primary",
  children,
  footer,
  rulesGate,
}: {
  /** на странице стоит RulesGate: отправка только после прочтения регламента */
  rulesGate?: boolean;
  tournamentId: string;
  mains?: number;
  update?: boolean;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const tx = useT();
  const [state, action, pending] = useActionState<ActionResult, FormData>(registerTeam, null);
  const [local, setLocal] = useState<string | null>(null);
  const rulesOk = useRulesOk(tournamentId);
  const locked = !!rulesGate && !rulesOk;
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!state?.success) return;
    if (update) toast.success(state.success);
    else router.replace(`${path}?sent=1`, { scroll: false });
  }, [state, update, toast, router, path]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (mains == null) return;
    const chosen = new FormData(e.currentTarget).getAll("main").length;
    if (chosen !== mains) {
      e.preventDefault();
      setLocal(chosen < mains ? tx("В основе должно быть {n}: выберите ещё {m}.", { n: mains, m: mains - chosen }) : tx("В основе должно быть {n}, выбрано {m}.", { n: mains, m: chosen }));
    } else setLocal(null);
  };
  const error = local ?? state?.error ?? null;

  return (
    <form action={action} onSubmit={onSubmit} data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {rulesGate && <input type="hidden" name="rules_ack" value={rulesOk ? "1" : ""} />}
      {children}
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className={cn("min-w-0 text-meta", locked ? "font-medium text-warn" : "text-fg-3")}>{locked ? tx("Сначала прочитайте регламент турнира выше и поставьте галочку.") : footer}</div>
        <Button type="submit" variant={variant} size="lg" loading={pending} disabled={locked} className="w-full sm:w-auto">
          {pending ? (pendingLabel ?? tx("Отправляем…")) : label}
        </Button>
      </div>
      {error && (
        <div className="px-4 pb-4 sm:px-5">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
    </form>
  );
}

/** Отозвать заявку (капитан, пока открыта регистрация) — только с подтверждением */
export function WithdrawApplication({ tournamentId, solo }: { tournamentId: string; solo?: boolean }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const act = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("tournamentId", tournamentId);
      const r = await withdrawRegistration(null, fd);
      setOpen(false);
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
    });
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {solo ? tx("Отменить участие") : tx("Отозвать заявку")}
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title={solo ? tx("Отменить участие?") : tx("Отозвать заявку команды?")}
        description={tx("Место в турнире освободится. Подать заявку снова можно, пока открыта регистрация.")}
        confirmLabel={solo ? tx("Отменить участие") : tx("Отозвать заявку")}
        danger
        loading={pending}
        onConfirm={act}
      />
    </>
  );
}

// ───────────────────────── check-in

export type CheckItem = { label: string; ok: boolean; detail?: string };
type Phase = "upcoming" | "waiting" | "open" | "closed" | "done" | "missed";

function phaseOf(p: { status: TournamentStatus; opensAt: string | null; closesAt: string | null; checkedInAt: string | null }, now: number): Phase {
  if (p.checkedInAt) return "done";
  if (p.status === "live" || p.status === "finished" || p.status === "cancelled") return "missed";
  if (p.status !== "checkin") return "upcoming";
  if (p.opensAt && now < new Date(p.opensAt).getTime()) return "waiting";
  if (p.closesAt && now > new Date(p.closesAt).getTime()) return "closed";
  return "open";
}

const ANNOUNCE: Record<Phase, string> = {
  upcoming: "",
  waiting: "",
  open: tr("Check-in открыт"),
  closed: tr("Check-in закрыт"),
  done: tr("Check-in пройден"),
  missed: tr("Check-in завершён"),
};

/**
 * Задача check-in: окно, отсчёт, проверки, действие капитана.
 * Фаза пересчитывается по часам браузера (окно открылось/закрылось без перезагрузки); смена фазы
 * объявляется один раз, тиканье таймера не озвучивается.
 */
export function CheckinTask({
  tournamentId,
  tournamentHref,
  status,
  opensAt,
  closesAt,
  checkedInAt,
  serverNow,
  isCaptain,
  captainName,
  checks,
  solo,
}: {
  tournamentId: string;
  tournamentHref: string;
  status: TournamentStatus;
  opensAt: string | null;
  closesAt: string | null;
  checkedInAt: string | null;
  serverNow: number;
  isCaptain: boolean;
  captainName: string | null;
  checks: CheckItem[];
  solo?: boolean;
}) {
  const tx = useT();
  // Держим phase/checks синхронизированными с временем сервера.
  // setState вызывается только из таймера, поэтому строгий React lint не ловит cascading render.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [serverNow]);
  const [state, action, pending] = useActionState<ActionResult, FormData>(checkIn, null);
  const toast = useToast();
  useEffect(() => {
    if (state?.success) toast.success(state.success);
  }, [state, toast]);

  const phase = phaseOf({ status, opensAt, closesAt, checkedInAt }, now);
  const [announce, setAnnounce] = useState("");
  const prev = useRef(phase);
  useEffect(() => {
    if (prev.current === phase) return;
    prev.current = phase;
    const id = setTimeout(() => setAnnounce(ANNOUNCE[phase] ? tx(ANNOUNCE[phase]) : ""), 0);
    return () => clearTimeout(id);
  }, [phase, tx]);

  const blocked = checks.filter((c) => !c.ok);
  const left = closesAt ? new Date(closesAt).getTime() - now : null;
  const hurry = phase === "open" && left != null && left <= 5 * 60_000;

  const doneNext =
    status === "live"
      ? tx("Турнир уже идёт. Следите за сеткой и своими матчами.")
      : status === "finished"
        ? tx("Турнир завершён. Результаты, сетка и статистика доступны на странице турнира.")
        : status === "cancelled"
          ? tx("Турнир отменён.")
          : tx("Что дальше: ждите публикации сетки и первого матча.");

  const windowItem = {
    upcoming: { state: "wait" as const, text: opensAt ? tx("Откроется {date}", { date: formatDateTime(opensAt, tx.lang) }) : tx("Время объявит администратор") },
    waiting: { state: "wait" as const, text: opensAt ? tx("Откроется в {time}", { time: formatTime(opensAt, tx.lang) }) : tx("Скоро откроется") },
    open: { state: "ok" as const, text: closesAt ? tx("Открыто до {time}", { time: formatTime(closesAt, tx.lang) }) : tx("Открыто") },
    closed: { state: "fail" as const, text: tx("Окно закрыто") },
    done: { state: "ok" as const, text: tx("Пройден") },
    missed: { state: "fail" as const, text: tx("Окно закрыто") },
  }[phase];

  return (
    <div className="overflow-hidden rounded-feature border border-line bg-surface">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {/* главное: что сейчас и что делать */}
      <div className={cn("p-5 sm:p-7", phase === "done" && "bg-ok-dim/50")}>
        {phase === "done" ? (
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok/15 text-ok" aria-hidden>
              <Check className="size-6" />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading text-fg">{solo ? tx("Вы прошли check-in") : tx("Команда прошла check-in")}</h2>
              <p className="mt-1 text-meta text-fg-3">{tx("Подтверждено {date}", { date: formatDateTime(checkedInAt, tx.lang) })}</p>
              <p className="mt-3 text-[15px] text-fg-2">{doneNext}</p>
              <Button href={tournamentHref} variant="secondary" size="sm" className="mt-4">
                {tx("К турниру")}
              </Button>
            </div>
          </div>
        ) : phase === "open" ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-meta text-fg-3">{closesAt ? tx("До конца check-in") : tx("Check-in открыт")}</div>
                {closesAt ? (
                  <Timer deadline={closesAt} urgentAt={60} serverNow={serverNow} className={cn("mt-1 block text-[40px] font-semibold leading-none tracking-[-0.02em] sm:text-[48px]", hurry && "text-warn")} />
                ) : (
                  <div className="mt-1 text-title text-fg">{tx("Окно закроет администратор")}</div>
                )}
              </div>
              <Status info={{ label: tx("Check-in открыт"), tone: "accent" }} />
            </div>
            {hurry && (
              <Callout tone="warn" className="mt-5">
                {isCaptain ? tx("Осталось меньше 5 минут — подтвердите участие сейчас.") : tx("Осталось меньше 5 минут. Напомните капитану подтвердить участие.")}
              </Callout>
            )}
            <div className="mt-6">
              {blocked.length ? (
                <Callout tone="danger" title={tx("Подтвердить участие нельзя")}>
                  {tx("Исправить заявку после закрытия регистрации может только администратор турнира — напишите ему.")}
                </Callout>
              ) : isCaptain ? (
                <form action={action} data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto sm:min-w-64">
                    {pending ? tx("Подтверждаем…") : tx("Подтвердить участие")}
                  </Button>
                  {state?.error && (
                    <Callout tone="danger" className="mt-4">
                      {state.error}
                    </Callout>
                  )}
                </form>
              ) : (
                <div className="flex items-start gap-3 rounded-control border border-line bg-ink/[0.03] px-4 py-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                  <div className="text-[14px] leading-relaxed">
                    <div className="font-medium text-fg">{tx("Check-in проходит капитан команды")}</div>
                    <div className="text-fg-2">{captainName ? tx("Ждём подтверждения от {name}. Вам ничего делать не нужно.", { name: captainName }) : tx("Ждём подтверждения. Вам ничего делать не нужно.")}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : phase === "waiting" ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-meta text-fg-3">{tx("Check-in откроется через")}</div>
              <Timer deadline={opensAt!} urgentAt={0} serverNow={serverNow} className="mt-1 block text-[40px] font-semibold leading-none tracking-[-0.02em] text-fg-2 sm:text-[48px]" />
              <p className="mt-3 text-[14px] text-fg-2">
                {isCaptain ? tx("Кнопка подтверждения появится здесь, когда окно откроется.") : tx("Check-in пройдёт капитан команды, когда окно откроется.")}
              </p>
            </div>
            <Status info={{ label: tx("Скоро"), tone: "neutral" }} />
          </div>
        ) : phase === "upcoming" ? (
          <div>
            <h2 className="text-heading text-fg">{tx("Check-in ещё не начался")}</h2>
            <p className="mt-2 text-[15px] text-fg-2">
              {opensAt ? tx("Окно откроется {date}.", { date: formatDateTime(opensAt, tx.lang) }) : tx("Время check-in объявит администратор.")} {tx("Мы пришлём уведомление, когда он начнётся.")}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-heading text-fg">{tx("Check-in закрыт")}</h2>
            <p className="mt-2 text-[15px] text-fg-2">
              {solo ? tx("Участие не подтверждено вовремя. Если это ошибка — напишите администратору турнира.") : tx("Команда не подтвердила участие вовремя. Если это ошибка — напишите администратору турнира.")}
            </p>
            <Button href={tournamentHref} variant="secondary" size="sm" className="mt-4">
              {tx("К турниру")}
            </Button>
          </div>
        )}
      </div>

      {/* проверки — только реальные условия, которые проверяются при check-in */}
      <div className="border-t border-line-subtle p-5 sm:p-7">
        <h3 className="text-title text-fg">{tx("Проверка готовности")}</h3>
        <ul className="mt-3 divide-y divide-line-subtle">
          {checks.map((c) => (
            <CheckRow key={c.label} state={c.ok ? "ok" : "fail"} label={c.label} detail={c.detail} />
          ))}
          <CheckRow state={windowItem.state} label={tx("Окно check-in")} detail={windowItem.text} />
        </ul>
      </div>
    </div>
  );
}

function CheckRow({ state, label, detail }: { state: "ok" | "fail" | "wait"; label: string; detail?: string }) {
  const tx = useT();
  const icon = state === "ok" ? <Check className="size-3.5" /> : state === "fail" ? <X className="size-3.5" /> : <Clock className="size-3.5" />;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full",
          state === "ok" && "bg-ok/15 text-ok",
          state === "fail" && "bg-danger/15 text-danger",
          state === "wait" && "bg-ink/[0.06] text-fg-3",
        )}
      >
        {icon}
        <span className="sr-only">{state === "ok" ? tx("выполнено") : state === "fail" ? tx("не выполнено") : tx("ожидание")}</span>
      </span>
      <span className="flex-1 text-[14px] text-fg">{label}</span>
      {detail && <span className={cn("text-right text-meta", state === "fail" ? "text-danger" : "text-fg-3")}>{detail}</span>}
    </li>
  );
}
