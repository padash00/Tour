"use client";

import Link from "next/link";
import { Check, CircleAlert, Circle } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
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
function participation(t: TournamentLite, me: TournamentMe, approvedCount: number): Participation {
  const base = `/tournaments/${t.slug}`;
  const free = Math.max(0, t.max_teams - approvedCount);
  const mode = modeOf(t.format);
  const soloFormat = mode.size === 1;
  const { loggedIn, team, isCaptain, reg } = me;
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  const canManage = isCaptain || soloFormat;
  const checkin = t.checkin_opens_at ? `${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? `–${formatDateTime(t.checkin_closes_at).split(", ").pop()}` : ""}` : null;

  if (t.status === "cancelled") return { tone: "neutral", label: "Турнир отменён", title: "Турнир отменён" };
  if (t.status === "finished") {
    // участие = одобрена + check-in пройден; одобренная без check-in — не «участвовали»
    if (reg?.status === "approved" && reg.checked_in_at) {
      return { tone: "neutral", label: "Вы участвовали", title: team?.name ?? "Участие", text: "Итоги, сетка и статистика — во вкладках турнира.", cta: { href: `${base}?tab=recap`, label: "Итоги турнира", variant: "secondary" } };
    }
    if (reg?.status === "approved") {
      return { tone: "neutral", label: "Заявка была одобрена", title: team?.name ?? "Заявка", text: "Команда не прошла check-in. Турнир уже завершён.", cta: { href: `${base}?tab=recap`, label: "Итоги турнира", variant: "secondary" } };
    }
    return { tone: "neutral", label: "Турнир завершён", title: "Турнир завершён", text: "Итоги и статистика — во вкладках турнира." };
  }

  if (active && reg) {
    if (reg.status === "pending") {
      return {
        tone: "warn",
        label: "Ваша заявка",
        title: team?.name ?? "Заявка",
        status: [registrationStatus.pending],
        text:
          t.status === "checkin"
            ? "Check-in уже открыт, а заявка ещё не одобрена. Обратитесь к администратору турнира."
            : t.status === "registration"
              ? "Заявка на рассмотрении. Администратор рассмотрит её до check-in."
              : "Заявка на рассмотрении. Она ожидает решения администратора.",
        cta: canManage && t.status === "registration" ? { href: `${base}/register`, label: "Управлять заявкой", variant: "secondary" } : undefined,
      };
    }
    // одобрена
    if (reg.checked_in_at) {
      return {
        tone: "ok",
        label: "Вы участвуете",
        title: team?.name ?? "Участие",
        status: [registrationStatus.approved, { label: "Check-in пройден", tone: "ok" }],
        text: t.status === "live" ? "Турнир идёт — ваши матчи во вкладке «Матчи» и в «Моей игре»." : "Сетку опубликуют после закрытия check-in — сообщим, когда соперник будет известен.",
        cta: t.status === "live" ? { href: `${base}?tab=matches`, label: "Матчи турнира", variant: "secondary" } : undefined,
      };
    }
    if (t.status === "checkin") {
      return {
        tone: "accent",
        label: "Check-in открыт",
        title: team?.name ?? "Участие",
        status: [registrationStatus.approved, { label: "Check-in не пройден", tone: "warn" }],
        text: canManage ? `Подтвердите участие${t.checkin_closes_at ? ` до ${formatDateTime(t.checkin_closes_at)}` : ""}, иначе место займёт другая команда.` : "Check-in проходит капитан команды.",
        cta: canManage ? { href: `${base}/checkin`, label: "Пройти check-in" } : { href: `${base}/checkin`, label: "Статус check-in", variant: "secondary" },
      };
    }
    if (t.status === "live") {
      return { tone: "neutral", label: "Турнир идёт", title: team?.name ?? "Участие", status: [registrationStatus.approved], text: "Check-in не был пройден — если это ошибка, напишите администратору." };
    }
    return {
      tone: "ok",
      label: "Вы участвуете",
      title: team?.name ?? "Участие",
      status: [registrationStatus.approved],
      text: checkin ? `Дальше: check-in ${checkin}.` : "Дальше: check-in перед стартом — мы напомним.",
      cta: canManage && t.status === "registration" ? { href: `${base}/register`, label: "Управлять заявкой", variant: "secondary" } : undefined,
    };
  }

  // отклонённая заявка важнее общего «регистрация закрыта»: причина остаётся видимой
  if (reg?.status === "rejected") {
    const open = t.status === "registration";
    return {
      tone: "danger",
      label: "Заявка отклонена",
      title: team?.name ?? "Заявка",
      status: [registrationStatus.rejected],
      text: (
        <>
          {reg.note ? `Причина: ${reg.note}` : "Администратор отклонил заявку."}
          {open ? " Исправьте состав и подайте снова, пока открыта регистрация." : " Регистрация уже закрыта."}
        </>
      ),
      cta: open && canManage ? { href: `${base}/register`, label: "Подать заявку снова" } : undefined,
    };
  }

  if (t.status !== "registration") {
    return t.status === "live"
      ? { tone: "neutral", label: "Турнир идёт", title: "Регистрация закрыта", text: "Следите за сеткой и матчами во вкладках турнира." }
      : { tone: "neutral", label: "Регистрация закрыта", title: "Регистрация закрыта", text: checkin && t.status !== "checkin" ? `Check-in для участников: ${checkin}.` : "Новые заявки не принимаются." };
  }

  // регистрация открыта, активной заявки нет (отклонённая обработана выше)
  // мест нет: backend всё равно принимает заявку на рассмотрение, одобрят, если место освободится
  const seats = free > 0 ? `${free} из ${t.max_teams} мест свободно` : "Свободных мест сейчас нет";
  const fullNote = "Заявку всё ещё можно отправить; её одобрение возможно, если место освободится.";
  if (!loggedIn) {
    return { tone: "accent", label: "Регистрация открыта", title: seats, text: free > 0 ? "Войдите через Steam, чтобы подать заявку." : `${fullNote} Войдите через Steam.`, cta: { href: `/login?next=${encodeURIComponent(`${base}/register`)}`, label: "Войти через Steam" } };
  }
  if (soloFormat) {
    return { tone: "accent", label: "Регистрация открыта", title: seats, text: free > 0 ? "Участие — сами за себя, команда не нужна." : fullNote, cta: { href: `${base}/register`, label: "Участвовать" } };
  }
  if (!team || team.solo) {
    return { tone: "neutral", label: "Регистрация открыта", title: "Для участия нужна команда", text: `Соберите команду: в основе ${mode.size}${mode.subs ? `, до ${mode.subs} запасных` : ""}.`, cta: { href: "/team/create", label: "Создать команду" }, extra: { href: "/find", label: "Найти команду" } };
  }
  if (team.mains < mode.size) {
    return {
      tone: "warn",
      label: "Состав неполный",
      title: team.name,
      text: `Основа ${team.mains} из ${mode.size} — нужно ещё ${mode.size - team.mains}, чтобы подать заявку.`,
      cta: { href: isCaptain ? "/team?tab=roster" : "/team", label: isCaptain ? "Пригласить игроков" : "Открыть команду", variant: "secondary" },
    };
  }
  return isCaptain
    ? {
        tone: "accent",
        label: "Команда готова",
        title: team.name,
        status: [{ label: `Основа ${team.mains}/${mode.size}`, tone: "ok" }],
        text: free > 0 ? `${seats}${t.registration_closes_at ? ` · заявки до ${formatDateTime(t.registration_closes_at)}` : ""}.` : `${seats}. ${fullNote}`,
        cta: { href: `${base}/register`, label: "Подать заявку" },
      }
    : { tone: "neutral", label: "Команда готова", title: team.name, status: [{ label: `Основа ${team.mains}/${mode.size}`, tone: "ok" }], text: "Заявку на турнир подаёт капитан команды." };
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
  const p = participation(t, me, approvedCount);
  const fill = Math.min(100, (approvedCount / Math.max(1, t.max_teams)) * 100);
  return (
    <section aria-label="Моё участие" className={cn("rounded-surface border bg-surface p-5", BORDER[p.tone])}>
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
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${fill}%` }} />
          </div>
          <div className="num mt-1.5 text-micro text-fg-3">
            {approvedCount} / {t.max_teams} {modeOf(t.format).size === 1 ? "участников" : "команд"}
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
  const me = useTournamentMe(t.id);
  if (!me) {
    return t.status === "registration" || t.status === "checkin" ? <span aria-hidden className="inline-block h-12 w-56 rounded-control bg-white/[0.04]" /> : null;
  }
  const p = participation(t, me, approvedCount);
  if (!p.cta || p.cta.variant === "secondary") return null;
  return (
    <Button href={p.cta.href} size="lg">
      {p.cta.label}
    </Button>
  );
}

/** На телефоне главное действие всегда под рукой — внизу экрана (только когда оно есть) */
export function MobileCta({ t, approvedCount }: { t: TournamentLite; approvedCount: number }) {
  const me = useTournamentMe(t.id);
  if (!me) return null;
  const p = participation(t, me, approvedCount);
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
  const me = useTournamentMe(t.id);
  const mode = modeOf(t.format);
  if (!me?.loggedIn || !me.team || me.team.solo || mode.size === 1) return null;
  const items: { ok: boolean | null; text: string }[] = [
    { ok: true, text: "Вход через Steam" },
    { ok: me.team.mains >= mode.size, text: `Основа: ${Math.min(me.team.mains, mode.size)} из ${mode.size}` },
    {
      ok: me.reg?.checked_in_at ? true : null,
      text: me.reg?.checked_in_at ? "Check-in пройден" : me.isCaptain ? "Check-in — вы, как капитан, в отведённое время" : "Check-in проходит капитан",
    },
  ];
  return (
    <div className="mt-6 rounded-surface border border-line-subtle bg-surface p-4">
      <div className="text-meta font-medium text-fg-2">Ваша команда · {me.team.name}</div>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.text} className="flex items-center gap-2.5 text-[14px] text-fg-2">
            {it.ok === true ? <Check className="size-4 text-ok" aria-label="выполнено" /> : it.ok === false ? <CircleAlert className="size-4 text-warn" aria-label="не выполнено" /> : <Circle className="size-4 text-fg-4" aria-label="впереди" />}
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
