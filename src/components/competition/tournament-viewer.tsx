"use client";

import Link from "next/link";
import { Check, CircleAlert, Circle } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { formatDateTime, formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/core";
import { modeOf } from "@/lib/modes";
import type { RegistrationStatus, TournamentStatus } from "@/lib/types";
import { Button, Skeleton, Status, cn, registrationStatus } from "@/components/ds";
import { MobileStickyCta } from "../public/callout";

/*
 * Персональные части страницы турнира. Сама страница отдаётся из кэша CDN одинаковой для всех,
 * а «моё участие» (панель, кнопка, требования) подгружается отсюда: /api/tournaments/[id]/me.
 * Статус турнира и статус участника — разные вещи: панель показывает участника, шапка — турнир.
 */

export type TournamentLite = {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  format: string;
  max_teams: number;
  registration_closes_at: string | null;
  checkin_opens_at: string | null;
  checkin_closes_at: string | null;
};

export type TournamentMe = {
  loggedIn: boolean;
  isAdmin: boolean;
  team: { id: string; name: string; captain_id: string; mains: number; solo: boolean } | null;
  isCaptain: boolean;
  reg: { status: RegistrationStatus; checked_in_at: string | null; note: string | null; created_at: string } | null;
};

const ANON: TournamentMe = { loggedIn: false, isAdmin: false, team: null, isCaptain: false, reg: null };
const store = new Map<string, TournamentMe | null>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

function load(id: string) {
  if (!id || inflight.has(id)) return;
  const p = fetch(`/api/tournaments/${id}/me`, { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: TournamentMe | null) => void store.set(id, d ?? ANON))
    .catch(() => void store.set(id, ANON))
    .finally(() => {
      inflight.delete(id);
      listeners.forEach((l) => l());
    });
  inflight.set(id, p);
}

function useTournamentMe(id: string): TournamentMe | null {
  useEffect(() => {
    load(id);
  }, [id]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store.get(id) ?? null,
    () => null,
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";
type Participation = {
  tone: Tone;
  label: string;
  title: string;
  text?: ReactNode;
  status?: { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "danger" | "live" }[];
  cta?: { href: string; label: string; variant?: "primary" | "secondary" };
  extra?: { href: string; label: string };
};

/** Состояние участника → текст, статусы и одно главное действие (ведёт в существующие flows) */
function participation(t: TournamentLite, me: TournamentMe, approvedCount: number, tx: T): Participation {
  const base = `/tournaments/${t.slug}`;
  const free = Math.max(0, t.max_teams - approvedCount);
  const mode = modeOf(t.format);
  const soloFormat = mode.size === 1;
  const { loggedIn, team, isCaptain, reg } = me;
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  const canManage = isCaptain || soloFormat;
  const checkin = t.checkin_opens_at ? `${formatDateTime(t.checkin_opens_at, tx.lang)}${t.checkin_closes_at ? `–${formatTime(t.checkin_closes_at, tx.lang)}` : ""}` : null;

  if (t.status === "cancelled") return { tone: "neutral", label: tx("Турнир отменён"), title: tx("Турнир отменён") };
  if (t.status === "finished") {
    // участие = одобрена + check-in пройден; одобренная без check-in — не «участвовали»
    if (reg?.status === "approved" && reg.checked_in_at) {
      return { tone: "neutral", label: tx("Вы участвовали"), title: team?.name ?? tx("Участие"), text: tx("Итоги, сетка и статистика — во вкладках турнира."), cta: { href: `${base}?tab=recap`, label: tx("Итоги турнира"), variant: "secondary" } };
    }
    if (reg?.status === "approved") {
      return { tone: "neutral", label: tx("Заявка была одобрена"), title: team?.name ?? tx("Заявка"), text: tx("Команда не прошла check-in. Турнир уже завершён."), cta: { href: `${base}?tab=recap`, label: tx("Итоги турнира"), variant: "secondary" } };
    }
    return { tone: "neutral", label: tx("Турнир завершён"), title: tx("Турнир завершён"), text: tx("Итоги и статистика — во вкладках турнира.") };
  }

  if (active && reg) {
    if (reg.status === "pending") {
      return {
        tone: "warn",
        label: tx("Ваша заявка"),
        title: team?.name ?? tx("Заявка"),
        status: [registrationStatus.pending],
        text:
          t.status === "checkin"
            ? tx("Check-in уже открыт, а заявка ещё не одобрена. Обратитесь к администратору турнира.")
            : t.status === "registration"
              ? tx("Заявка на рассмотрении. Администратор рассмотрит её до check-in.")
              : tx("Заявка на рассмотрении. Она ожидает решения администратора."),
        cta: canManage && t.status === "registration" ? { href: `${base}/register`, label: tx("Управлять заявкой"), variant: "secondary" } : undefined,
      };
    }
    // одобрена
    if (reg.checked_in_at) {
      return {
        tone: "ok",
        label: tx("Вы участвуете"),
        title: team?.name ?? tx("Участие"),
        status: [registrationStatus.approved, { label: tx("Check-in пройден"), tone: "ok" }],
        text: t.status === "live" ? tx("Турнир идёт — ваши матчи во вкладке «Матчи» и в «Моей игре».") : tx("Сетку опубликуют после закрытия check-in — сообщим, когда соперник будет известен."),
        cta: t.status === "live" ? { href: `${base}?tab=matches`, label: tx("Матчи турнира"), variant: "secondary" } : undefined,
      };
    }
    if (t.status === "checkin") {
      return {
        tone: "accent",
        label: tx("Check-in открыт"),
        title: team?.name ?? tx("Участие"),
        status: [registrationStatus.approved, { label: tx("Check-in не пройден"), tone: "warn" }],
        text: canManage
          ? t.checkin_closes_at
            ? tx("Подтвердите участие до {date}, иначе место займёт другая команда.", { date: formatDateTime(t.checkin_closes_at, tx.lang) })
            : tx("Подтвердите участие, иначе место займёт другая команда.")
          : tx("Check-in проходит капитан команды."),
        cta: canManage ? { href: `${base}/checkin`, label: tx("Пройти check-in") } : { href: `${base}/checkin`, label: tx("Статус check-in"), variant: "secondary" },
      };
    }
    if (t.status === "live") {
      return { tone: "neutral", label: tx("Турнир идёт"), title: team?.name ?? tx("Участие"), status: [registrationStatus.approved], text: tx("Check-in не был пройден — если это ошибка, напишите администратору.") };
    }
    return {
      tone: "ok",
      label: tx("Вы участвуете"),
      title: team?.name ?? tx("Участие"),
      status: [registrationStatus.approved],
      text: checkin ? tx("Дальше: check-in {when}.", { when: checkin }) : tx("Дальше: check-in перед стартом — мы напомним."),
      cta: canManage && t.status === "registration" ? { href: `${base}/register`, label: tx("Управлять заявкой"), variant: "secondary" } : undefined,
    };
  }

  // отклонённая заявка важнее общего «регистрация закрыта»: причина остаётся видимой
  if (reg?.status === "rejected") {
    const open = t.status === "registration";
    return {
      tone: "danger",
      label: tx("Заявка отклонена"),
      title: team?.name ?? tx("Заявка"),
      status: [registrationStatus.rejected],
      text: (
        <>
          {reg.note ? tx("Причина: {note}", { note: reg.note }) : tx("Администратор отклонил заявку.")}{" "}
          {open ? tx("Исправьте состав и подайте снова, пока открыта регистрация.") : tx("Регистрация уже закрыта.")}
        </>
      ),
      cta: open && canManage ? { href: `${base}/register`, label: tx("Подать заявку снова") } : undefined,
    };
  }

  if (t.status !== "registration") {
    return t.status === "live"
      ? { tone: "neutral", label: tx("Турнир идёт"), title: tx("Регистрация закрыта"), text: tx("Следите за сеткой и матчами во вкладках турнира.") }
      : { tone: "neutral", label: tx("Регистрация закрыта"), title: tx("Регистрация закрыта"), text: checkin && t.status !== "checkin" ? tx("Check-in для участников: {when}.", { when: checkin }) : tx("Новые заявки не принимаются.") };
  }

  // регистрация открыта, активной заявки нет (отклонённая обработана выше)
  // мест нет: backend всё равно принимает заявку на рассмотрение, одобрят, если место освободится
  const seats = free > 0 ? tx("{free} из {max} мест свободно", { free, max: t.max_teams }) : tx("Свободных мест сейчас нет");
  const fullNote = tx("Заявку всё ещё можно отправить; её одобрение возможно, если место освободится.");
  if (!loggedIn) {
    return { tone: "accent", label: tx("Регистрация открыта"), title: seats, text: free > 0 ? tx("Войдите через Steam, чтобы подать заявку.") : `${fullNote} ${tx("Войдите через Steam.")}`, cta: { href: `/login?next=${encodeURIComponent(`${base}/register`)}`, label: tx("Войти через Steam") } };
  }
  if (soloFormat) {
    return { tone: "accent", label: tx("Регистрация открыта"), title: seats, text: free > 0 ? tx("Участие — сами за себя, команда не нужна.") : fullNote, cta: { href: `${base}/register`, label: tx("Участвовать") } };
  }
  if (!team || team.solo) {
    return {
      tone: "neutral",
      label: tx("Регистрация открыта"),
      title: tx("Для участия нужна команда"),
      text: (mode.subs as number) ? tx("Соберите команду: в основе {n}, до {subs} запасных.", { n: mode.size, subs: mode.subs as number }) : tx("Соберите команду: в основе {n}.", { n: mode.size }),
      cta: { href: "/team/create", label: tx("Создать команду") },
      extra: { href: "/find", label: tx("Найти команду") },
    };
  }
  if (team.mains < mode.size) {
    return {
      tone: "warn",
      label: tx("Состав неполный"),
      title: team.name,
      text: tx("Основа {a} из {b} — нужно ещё {c}, чтобы подать заявку.", { a: team.mains, b: mode.size, c: mode.size - team.mains }),
      cta: { href: isCaptain ? "/team?tab=roster" : "/team", label: isCaptain ? tx("Пригласить игроков") : tx("Открыть команду"), variant: "secondary" },
    };
  }
  return isCaptain
    ? {
        tone: "accent",
        label: tx("Команда готова"),
        title: team.name,
        status: [{ label: tx("Основа {a}/{b}", { a: team.mains, b: mode.size }), tone: "ok" }],
        text: free > 0 ? `${seats}${t.registration_closes_at ? ` · ${tx("заявки до {date}", { date: formatDateTime(t.registration_closes_at, tx.lang) })}` : ""}.` : `${seats}. ${fullNote}`,
        cta: { href: `${base}/register`, label: tx("Подать заявку") },
      }
    : { tone: "neutral", label: tx("Команда готова"), title: team.name, status: [{ label: tx("Основа {a}/{b}", { a: team.mains, b: mode.size }), tone: "ok" }], text: tx("Заявку на турнир подаёт капитан команды.") };
}

const BORDER: Record<Tone, string> = {
  neutral: "border-line-subtle",
  accent: "border-accent/35",
  ok: "border-ok/35",
  warn: "border-warn/35",
  danger: "border-danger/40",
};

/** Панель участия — главный блок боковой колонки «Обзора» */
export function ParticipationPanel({ t, approvedCount, preview }: { t: TournamentLite; approvedCount: number; /** для витрины дизайн-системы: состояние без запроса */ preview?: TournamentMe }) {
  const tx = useT();
  const live = useTournamentMe(preview ? "" : t.id);
  const me = preview ?? live;
  if (!me) {
    return (
      <div className="rounded-surface border border-line-subtle bg-surface p-5" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-5 w-2/3" />
        <Skeleton className="mt-4 h-11 w-full" />
      </div>
    );
  }
  const p = participation(t, me, approvedCount, tx);
  const fill = Math.min(100, (approvedCount / Math.max(1, t.max_teams)) * 100);
  return (
    <section aria-label={tx("Моё участие")} className={cn("rounded-surface border bg-surface p-5", BORDER[p.tone])}>
      <div className="text-meta font-medium text-fg-3">{p.label}</div>
      <div className="mt-1 break-words text-title text-fg">{p.title}</div>
      {p.status && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.status.map((s) => (
            <Status key={s.label} info={s} size="sm" />
          ))}
        </div>
      )}
      {p.text && <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{p.text}</p>}
      {t.status === "registration" && !(me.reg && ["pending", "approved"].includes(me.reg.status)) && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${fill}%` }} />
          </div>
          <div className="num mt-1.5 text-micro text-fg-3">
            {modeOf(t.format).size === 1 ? tx("{a} / {b} участников", { a: approvedCount, b: t.max_teams }) : tx("{a} / {b} команд", { a: approvedCount, b: t.max_teams })}
          </div>
        </div>
      )}
      {p.cta && (
        <Button href={p.cta.href} variant={p.cta.variant ?? "primary"} block className="mt-5">
          {p.cta.label}
        </Button>
      )}
      {p.extra && (
        <Link href={p.extra.href} className="mt-3 block text-center text-meta font-medium text-accent hover:text-accent-strong">
          {p.extra.label} →
        </Link>
      )}
    </section>
  );
}

/** Главная кнопка в шапке турнира — то же главное действие, что в панели участия (только действия, не пассив) */
export function HeroCta({ t, approvedCount }: { t: TournamentLite; approvedCount: number }) {
  const tx = useT();
  const me = useTournamentMe(t.id);
  if (!me) {
    return t.status === "registration" || t.status === "checkin" ? <span aria-hidden className="inline-block h-12 w-56 rounded-control bg-ink/[0.04]" /> : null;
  }
  const p = participation(t, me, approvedCount, tx);
  if (!p.cta || p.cta.variant === "secondary") return null;
  return (
    <Button href={p.cta.href} size="lg">
      {p.cta.label}
    </Button>
  );
}

/** На телефоне главное действие всегда под рукой — внизу экрана (только когда оно есть) */
export function MobileCta({ t, approvedCount }: { t: TournamentLite; approvedCount: number }) {
  const tx = useT();
  const me = useTournamentMe(t.id);
  if (!me) return null;
  const p = participation(t, me, approvedCount, tx);
  if (!p.cta || p.cta.variant === "secondary") return null;
  return (
    <MobileStickyCta note={p.title}>
      <Button href={p.cta.href} size="lg" block>
        {p.cta.label}
      </Button>
    </MobileStickyCta>
  );
}

export function AdminControlLink({ t }: { t: TournamentLite }) {
  const me = useTournamentMe(t.id);
  if (!me?.isAdmin) return null;
  return (
    <Link href={`/admin/tournaments/${t.id}`} className="text-meta text-fg-3 hover:text-fg">
      Управление в F16 Control →
    </Link>
  );
}

/** Требования для вашей команды — только то, что сайт знает точно */
export function MyRequirements({ t }: { t: TournamentLite }) {
  const tx = useT();
  const me = useTournamentMe(t.id);
  const mode = modeOf(t.format);
  if (!me?.loggedIn || !me.team || me.team.solo || mode.size === 1) return null;
  const items: { ok: boolean | null; text: string }[] = [
    { ok: true, text: tx("Вход через Steam") },
    { ok: me.team.mains >= mode.size, text: tx("Основа: {a} из {b}", { a: Math.min(me.team.mains, mode.size), b: mode.size }) },
    {
      ok: me.reg?.checked_in_at ? true : null,
      text: me.reg?.checked_in_at ? tx("Check-in пройден") : me.isCaptain ? tx("Check-in — вы, как капитан, в отведённое время") : tx("Check-in проходит капитан"),
    },
  ];
  return (
    <div className="mt-6 rounded-surface border border-line-subtle bg-surface p-4">
      <div className="text-meta font-medium text-fg-2">{tx("Ваша команда")} · {me.team.name}</div>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.text} className="flex items-center gap-2.5 text-[14px] text-fg-2">
            {it.ok === true ? <Check className="size-4 text-ok" aria-label={tx("выполнено")} /> : it.ok === false ? <CircleAlert className="size-4 text-warn" aria-label={tx("не выполнено")} /> : <Circle className="size-4 text-fg-4" aria-label={tx("впереди")} />}
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
