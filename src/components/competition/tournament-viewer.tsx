"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { formatDateTime, registrationStatusLabel } from "@/lib/format";
import type { RegistrationStatus, TournamentStatus } from "@/lib/types";
import { Button, Eyebrow, OutlineBtn, PrimaryBtn, StatusChip } from "../primitives";
import { Callout, MobileStickyCta } from "../public/callout";
import { IconArrow } from "../ui";

/*
 * Персональные части страницы турнира. Сама страница отдаётся из кэша CDN одинаковой для всех,
 * а «моё участие» (кнопка, статус заявки, check-in) подгружается отсюда: /api/tournaments/[id]/me.
 */

export type TournamentLite = {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  format: string;
  max_teams: number;
  registration_closes_at: string | null;
};

type TournamentMe = {
  loggedIn: boolean;
  isAdmin: boolean;
  team: { id: string; name: string; captain_id: string } | null;
  isCaptain: boolean;
  reg: { status: RegistrationStatus; checked_in_at: string | null; note: string | null } | null;
};

const store = new Map<string, TournamentMe | null>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

function load(id: string) {
  if (inflight.has(id)) return;
  const p = fetch(`/api/tournaments/${id}/me`, { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: TournamentMe | null) => {
      store.set(id, d ?? { loggedIn: false, isAdmin: false, team: null, isCaptain: false, reg: null });
      listeners.forEach((l) => l());
    })
    .catch(() => {
      store.set(id, { loggedIn: false, isAdmin: false, team: null, isCaptain: false, reg: null });
      listeners.forEach((l) => l());
    })
    .finally(() => inflight.delete(id));
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

const isActive = (me: TournamentMe | null) => !!me?.reg && (me.reg.status === "pending" || me.reg.status === "approved");

/** Одна главная кнопка в шапке турнира — по состоянию участия */
function CtaButton({ t, me, full }: { t: TournamentLite; me: TournamentMe; full?: boolean }) {
  const base = `/tournaments/${t.slug}`;
  const wide = full ? "w-full min-w-0 lg:min-w-0" : undefined;
  const { loggedIn, team, isCaptain, reg } = me;
  if (t.status === "checkin" && reg?.status === "approved" && !reg.checked_in_at) {
    return (
      <PrimaryBtn href={`${base}/checkin`} className={wide}>
        Пройти check-in
      </PrimaryBtn>
    );
  }
  if (t.status !== "registration" || isActive(me)) return null;
  const solo = t.format === "1v1";
  const label = solo ? "Участвовать" : !team && loggedIn ? "Создать команду" : isCaptain || !loggedIn ? "Зарегистрировать команду" : "Заявку подаёт капитан";
  const href = !loggedIn ? `/login?next=${base}/register` : !team && !solo ? "/team/create" : `${base}/register`;
  return !team && loggedIn && !solo ? (
    <OutlineBtn href={href} className={wide}>
      {label}
    </OutlineBtn>
  ) : (
    <PrimaryBtn href={href} className={wide}>
      {label}
    </PrimaryBtn>
  );
}

export function HeroCta({ t }: { t: TournamentLite }) {
  const me = useTournamentMe(t.id);
  if (!me) {
    // место под кнопку, пока уточняем участие — без прыжка вёрстки
    return t.status === "registration" || t.status === "checkin" ? (
      <span aria-hidden className="inline-block h-[52px] w-[230px] rounded-[8px] bg-white/[0.04] lg:h-[60px] lg:w-[300px]" />
    ) : null;
  }
  return <CtaButton t={t} me={me} />;
}

/** На телефоне главная кнопка всегда под рукой — внизу экрана */
export function MobileCta({ t }: { t: TournamentLite }) {
  const me = useTournamentMe(t.id);
  if (!me) return null;
  const reg = me.reg;
  const shows =
    (t.status === "checkin" && reg?.status === "approved" && !reg.checked_in_at) || (t.status === "registration" && !isActive(me));
  if (!shows) return null;
  return (
    <MobileStickyCta note={t.name}>
      <CtaButton t={t} me={me} full />
    </MobileStickyCta>
  );
}

export function AdminControlLink({ t }: { t: TournamentLite }) {
  const me = useTournamentMe(t.id);
  if (!me?.isAdmin) return null;
  return (
    <Link href={`/admin/tournaments/${t.id}`} className="text-fg-3 hover:text-fg">
      Control →
    </Link>
  );
}

export function RegistrationBox({ t, approvedCount }: { t: TournamentLite; approvedCount: number }) {
  const me = useTournamentMe(t.id);
  const base = `/tournaments/${t.slug}`;
  const solo = t.format === "1v1";
  const reg = me?.reg ?? null;
  const loggedIn = !!me?.loggedIn;
  const team = me?.team ?? null;
  const isCaptain = !!me?.isCaptain;

  let body: ReactNode;
  if (me && isActive(me) && reg) {
    body = (
      <>
        <div className="flex items-center gap-4">
          <StatusChip tone={reg.status === "approved" ? "ok" : "warn"} size="sm">
            {registrationStatusLabel[reg.status]}
          </StatusChip>
          {reg.checked_in_at && (
            <StatusChip tone="ok" size="sm">
              Check-in пройден
            </StatusChip>
          )}
        </div>
        <p className="mt-3 text-sm text-fg-2">
          {team?.name} {reg.status === "approved" ? "участвует в турнире." : "ждёт решения администратора."}
        </p>
        {t.status === "checkin" && reg.status === "approved" && !reg.checked_in_at && (
          <Button href={`${base}/checkin`} size="md" className="mt-5 w-full">
            Пройти check-in
          </Button>
        )}
        {isCaptain && t.status === "registration" && (
          <Button href={`${base}/register`} variant="secondary" size="md" className="mt-5 w-full">
            Управлять заявкой
          </Button>
        )}
      </>
    );
  } else if (t.status === "registration") {
    body = (
      <>
        <div className="flex items-baseline gap-2">
          <span className="num text-[26px] font-semibold">{Math.max(0, t.max_teams - approvedCount)}</span>
          <span className="text-sm text-fg-3">из {t.max_teams} мест свободно</span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-ok/70" style={{ width: `${Math.min(100, (approvedCount / Math.max(1, t.max_teams)) * 100)}%` }} />
        </div>
        {t.registration_closes_at && <div className="mt-3 text-[13px] text-fg-3">до {formatDateTime(t.registration_closes_at)}</div>}
        {reg?.status === "rejected" && (
          <div className="mt-4">
            <Callout tone="danger">Предыдущая заявка отклонена{reg.note ? `: ${reg.note}` : "."}</Callout>
          </div>
        )}
        {!me ? (
          <span aria-hidden className="mt-5 block h-11 w-full rounded-[8px] bg-white/[0.04]" />
        ) : (
          <Button
            href={!loggedIn ? `/login?next=${base}/register` : !team && !solo ? "/team/create" : `${base}/register`}
            size="md"
            className="mt-5 w-full"
            iconRight={<IconArrow />}
          >
            {solo
              ? loggedIn
                ? "Участвовать"
                : "Войти и участвовать"
              : !loggedIn
                ? "Войти и зарегистрироваться"
                : !team
                  ? "Сначала создайте команду"
                  : isCaptain
                    ? "Зарегистрировать команду"
                    : "Заявку подаёт капитан"}
          </Button>
        )}
      </>
    );
  } else {
    body = (
      <p className="text-sm text-fg-2">
        {t.status === "finished" ? "Турнир завершён." : t.status === "cancelled" ? "Турнир отменён." : "Регистрация закрыта."}
      </p>
    );
  }

  return (
    <div>
      <Eyebrow className="mb-4">Регистрация</Eyebrow>
      <div className="text-[15px]">{body}</div>
    </div>
  );
}
