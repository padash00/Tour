"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { Activity } from "@/lib/activity";

/**
 * «Кто смотрит» на клиенте. Публичные страницы кэшируются CDN и одинаковы для всех —
 * персональное (шапка, глобальная активность, «Моя команда», участие в турнире) подгружается отсюда.
 * Запрос /api/me — при загрузке и каждом переходе, дальше опрос: чаще, когда есть срочное действие.
 */
export type Viewer = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  steam_id: string;
  isAdmin: boolean;
};
export type { Activity };
/** profileIncomplete — анкета игрока не заполнена (напоминание под шапкой) */
type State = { status: "loading" | "ready"; player: Viewer | null; unread: number; activity: Activity | null; moreActivity: number; profileIncomplete: boolean };

const EMPTY: State = { status: "loading", player: null, unread: 0, activity: null, moreActivity: 0, profileIncomplete: false };
let state: State = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

type MeResponse = { player: Viewer | null; unread: number; activity?: { top: Activity | null; more: number }; profileIncomplete?: boolean };

export function refreshViewer() {
  if (inflight) return inflight;
  inflight = fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : { player: null, unread: 0 }))
    .then((d: MeResponse) =>
      emit({
        status: "ready",
        player: d.player,
        unread: d.unread ?? 0,
        activity: d.activity?.top ?? null,
        moreActivity: d.activity?.more ?? 0,
        profileIncomplete: !!d.player && !!d.profileIncomplete,
      }),
    )
    .catch(() => emit({ ...state, status: "ready" }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useViewer(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** Ставится один раз в шапке: загружает зрителя и обновляет его при переходах */
export function ViewerSync() {
  const pathname = usePathname();
  useEffect(() => {
    refreshViewer();
  }, [pathname]);
  // вошедшему игроку: есть срочное действие — раз в 5 с (ход в вето, проверка готовности), иначе раз в 15 с
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const ms = state.activity && state.activity.priority <= 3 ? 5_000 : 15_000;
      timer = setTimeout(async () => {
        if (state.player && document.visibilityState === "visible") await refreshViewer();
        loop();
      }, ms);
    };
    loop();
    const onVisible = () => document.visibilityState === "visible" && state.player && refreshViewer();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
