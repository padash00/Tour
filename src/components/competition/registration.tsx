"use client";

import { usePathname, useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { checkIn, registerTeam, withdrawRegistration } from "@/app/actions/tournament";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { Avatar, Button, Callout, ConfirmDialog, FaceitLevel, Status, Timer, cn } from "@/components/ds";
import { formatDateTime, formatTime } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";

/*
 * Клиентская часть регистрации и check-in (F16 DS).
 * Бизнес-правила — в существующих server actions (registerTeam / withdrawRegistration / checkIn);
 * здесь только подсказки до отправки. Главная проверка всегда на сервере.
 */

// ───────────────────────── выбор состава

export type PickerMember = {
  player_id: string;
  nickname: string;
  avatar_url: string | null;
  faceit_level: number | null;
  banned: boolean;
  captain: boolean;
};
type Slot = "main" | "sub" | "out";

const SLOT_LABEL: Record<Slot, string> = { main: "Основа", sub: "Запас", out: "Не играет" };

/** Капитан распределяет игроков: основа ровно под режим, запас — до лимита, остальные не играют */
export function RosterPicker({ members, size, subs, initial }: { members: PickerMember[]; size: number; subs: number; initial: Record<string, Slot> }) {
  const [slots, setSlots] = useState<Record<string, Slot>>(initial);
  const count = (s: Slot) => members.filter((m) => !m.banned && (slots[m.player_id] ?? "out") === s).length;
  const mains = count("main");
  const benched = count("sub");
  const need = size - mains;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line-subtle px-4 py-3 sm:px-5">
        <div className="num flex items-center gap-2 text-[14px] font-medium text-fg">
          <span className={mains === size ? "text-ok" : "text-fg"}>
            Основа {mains}/{size}
          </span>
          {subs > 0 && (
            <>
              <span className="text-fg-4" aria-hidden>
                ·
              </span>
              <span className="text-fg-2">
                Запас {benched}/{subs}
              </span>
            </>
          )}
        </div>
        <p aria-live="polite" className={cn("flex items-center gap-1.5 text-meta", need === 0 ? "text-ok" : "text-warn")}>
          {need === 0 ? (
            <>
              <Check className="size-3.5" aria-hidden /> Основа собрана
            </>
          ) : (
            `Выберите в основу ещё ${need}`
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
                    {m.banned ? <span className="text-danger">Заблокирован</span> : m.captain ? "Капитан" : SLOT_LABEL[s]}
                    <FaceitLevel level={m.faceit_level} />
                  </div>
                </div>
              </div>
              {m.banned ? (
                <Status info={{ label: "Недоступен", tone: "danger" }} size="sm" />
              ) : (
                <div role="radiogroup" aria-label={`Роль в заявке: ${m.nickname}`} className="flex w-full rounded-control border border-line bg-surface-2 p-0.5 sm:w-auto">
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={s === o}
                      disabled={full(o)}
                      title={full(o) ? (o === "main" ? "Основа уже собрана" : "Запас заполнен") : undefined}
                      onClick={() => setSlots((cur) => ({ ...cur, [m.player_id]: o }))}
                      className={cn(
                        "h-9 flex-1 whitespace-nowrap rounded-[6px] px-3 text-[13px] font-medium transition-colors duration-[var(--dur-hover)] disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none",
                        s === o ? (o === "main" ? "bg-accent text-accent-ink" : "bg-white/[0.1] text-fg") : "text-fg-3 hover:text-fg",
                      )}
                    >
                      {SLOT_LABEL[o]}
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
  pendingLabel = "Отправляем…",
  variant = "primary",
  children,
  footer,
}: {
  tournamentId: string;
  mains?: number;
  update?: boolean;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(registerTeam, null);
  const [local, setLocal] = useState<string | null>(null);
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
      setLocal(chosen < mains ? `В основе должно быть ${mains}: выберите ещё ${mains - chosen}.` : `В основе должно быть ${mains}, выбрано ${chosen}.`);
    } else setLocal(null);
  };
  const error = local ?? state?.error ?? null;

  return (
    <form action={action} onSubmit={onSubmit} data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {children}
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-meta text-fg-3">{footer}</div>
        <Button type="submit" variant={variant} size="lg" loading={pending} className="w-full sm:w-auto">
          {pending ? pendingLabel : label}
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
        {solo ? "Отменить участие" : "Отозвать заявку"}
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title={solo ? "Отменить участие?" : "Отозвать заявку команды?"}
        description="Место в турнире освободится. Подать заявку снова можно, пока открыта регистрация."
        confirmLabel={solo ? "Отменить участие" : "Отозвать заявку"}
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
  open: "Check-in открыт",
  closed: "Check-in закрыт",
  done: "Check-in пройден",
  missed: "Check-in завершён",
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
    const id = setTimeout(() => setAnnounce(ANNOUNCE[phase]), 0);
    return () => clearTimeout(id);
  }, [phase]);

  const blocked = checks.filter((c) => !c.ok);
  const left = closesAt ? new Date(closesAt).getTime() - now : null;
  const hurry = phase === "open" && left != null && left <= 5 * 60_000;

  const doneNext =
    status === "live"
      ? "Турнир уже идёт. Следите за сеткой и своими матчами."
      : status === "finished"
        ? "Турнир завершён. Результаты, сетка и статистика доступны на странице турнира."
        : status === "cancelled"
          ? "Турнир отменён."
          : "Что дальше: ждите публикации сетки и первого матча.";

  const windowItem = {
    upcoming: { state: "wait" as const, text: opensAt ? `Откроется ${formatDateTime(opensAt)}` : "Время объявит администратор" },
    waiting: { state: "wait" as const, text: opensAt ? `Откроется в ${formatTime(opensAt)}` : "Скоро откроется" },
    open: { state: "ok" as const, text: closesAt ? `Открыто до ${formatTime(closesAt)}` : "Открыто" },
    closed: { state: "fail" as const, text: "Окно закрыто" },
    done: { state: "ok" as const, text: "Пройден" },
    missed: { state: "fail" as const, text: "Окно закрыто" },
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
              <h2 className="text-heading text-fg">{solo ? "Вы прошли check-in" : "Команда прошла check-in"}</h2>
              <p className="mt-1 text-meta text-fg-3">Подтверждено {formatDateTime(checkedInAt)}</p>
              <p className="mt-3 text-[15px] text-fg-2">{doneNext}</p>
              <Button href={tournamentHref} variant="secondary" size="sm" className="mt-4">
                К турниру
              </Button>
            </div>
          </div>
        ) : phase === "open" ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-meta text-fg-3">{closesAt ? "До конца check-in" : "Check-in открыт"}</div>
                {closesAt ? (
                  <Timer deadline={closesAt} urgentAt={60} serverNow={serverNow} className={cn("mt-1 block text-[40px] font-semibold leading-none tracking-[-0.02em] sm:text-[48px]", hurry && "text-warn")} />
                ) : (
                  <div className="mt-1 text-title text-fg">Окно закроет администратор</div>
                )}
              </div>
              <Status info={{ label: "Check-in открыт", tone: "accent" }} />
            </div>
            {hurry && (
              <Callout tone="warn" className="mt-5">
                {isCaptain ? "Осталось меньше 5 минут — подтвердите участие сейчас." : "Осталось меньше 5 минут. Напомните капитану подтвердить участие."}
              </Callout>
            )}
            <div className="mt-6">
              {blocked.length ? (
                <Callout tone="danger" title="Подтвердить участие нельзя">
                  Исправить заявку после закрытия регистрации может только администратор турнира — напишите ему.
                </Callout>
              ) : isCaptain ? (
                <form action={action} data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending}>
                  <input type="hidden" name="tournamentId" value={tournamentId} />
                  <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto sm:min-w-64">
                    {pending ? "Подтверждаем…" : "Подтвердить участие"}
                  </Button>
                  {state?.error && (
                    <Callout tone="danger" className="mt-4">
                      {state.error}
                    </Callout>
                  )}
                </form>
              ) : (
                <div className="flex items-start gap-3 rounded-control border border-line bg-white/[0.03] px-4 py-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                  <div className="text-[14px] leading-relaxed">
                    <div className="font-medium text-fg">Check-in проходит капитан команды</div>
                    <div className="text-fg-2">Ждём подтверждения{captainName ? ` от ${captainName}` : ""}. Вам ничего делать не нужно.</div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : phase === "waiting" ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-meta text-fg-3">Check-in откроется через</div>
              <Timer deadline={opensAt!} urgentAt={0} serverNow={serverNow} className="mt-1 block text-[40px] font-semibold leading-none tracking-[-0.02em] text-fg-2 sm:text-[48px]" />
              <p className="mt-3 text-[14px] text-fg-2">
                {isCaptain ? "Кнопка подтверждения появится здесь, когда окно откроется." : "Check-in пройдёт капитан команды, когда окно откроется."}
              </p>
            </div>
            <Status info={{ label: "Скоро", tone: "neutral" }} />
          </div>
        ) : phase === "upcoming" ? (
          <div>
            <h2 className="text-heading text-fg">Check-in ещё не начался</h2>
            <p className="mt-2 text-[15px] text-fg-2">
              {opensAt ? `Окно откроется ${formatDateTime(opensAt)}.` : "Время check-in объявит администратор."} Мы пришлём уведомление, когда он начнётся.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-heading text-fg">Check-in закрыт</h2>
            <p className="mt-2 text-[15px] text-fg-2">{solo ? "Участие не подтверждено" : "Команда не подтвердила участие"} вовремя. Если это ошибка — напишите администратору турнира.</p>
            <Button href={tournamentHref} variant="secondary" size="sm" className="mt-4">
              К турниру
            </Button>
          </div>
        )}
      </div>

      {/* проверки — только реальные условия, которые проверяются при check-in */}
      <div className="border-t border-line-subtle p-5 sm:p-7">
        <h3 className="text-title text-fg">Проверка готовности</h3>
        <ul className="mt-3 divide-y divide-line-subtle">
          {checks.map((c) => (
            <CheckRow key={c.label} state={c.ok ? "ok" : "fail"} label={c.label} detail={c.detail} />
          ))}
          <CheckRow state={windowItem.state} label="Окно check-in" detail={windowItem.text} />
        </ul>
      </div>
    </div>
  );
}

function CheckRow({ state, label, detail }: { state: "ok" | "fail" | "wait"; label: string; detail?: string }) {
  const icon = state === "ok" ? <Check className="size-3.5" /> : state === "fail" ? <X className="size-3.5" /> : <Clock className="size-3.5" />;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full",
          state === "ok" && "bg-ok/15 text-ok",
          state === "fail" && "bg-danger/15 text-danger",
          state === "wait" && "bg-white/[0.06] text-fg-3",
        )}
      >
        {icon}
        <span className="sr-only">{state === "ok" ? "выполнено" : state === "fail" ? "не выполнено" : "ожидание"}</span>
      </span>
      <span className="flex-1 text-[14px] text-fg">{label}</span>
      {detail && <span className={cn("text-right text-meta", state === "fail" ? "text-danger" : "text-fg-3")}>{detail}</span>}
    </li>
  );
}
