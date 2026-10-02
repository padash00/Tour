"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * «Кто смотрит» на клиенте. Публичные страницы кэшируются CDN и одинаковы для всех —
 * персональное (шапка, «Моя команда», участие в турнире) подгружается отсюда.
 * Один запрос /api/me на загрузку страницы и при каждом переходе (обновляет счётчик уведомлений).
 */
export type Viewer = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  steam_id: string;
  isAdmin: boolean;
};
type State = { status: "loading" | "ready"; player: Viewer | null; unread: number };

let state: State = { status: "loading", player: null, unread: 0 };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function refreshViewer() {
  if (inflight) return inflight;
  inflight = fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { player: null, unread: 0 }))
    .then((d: { player: Viewer | null; unread: number }) => emit({ status: "ready", player: d.player, unread: d.unread ?? 0 }))
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
const SERVER: State = { status: "loading", player: null, unread: 0 };

export function useViewer(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

/** Ставится один раз в шапке: загружает зрителя и обновляет его при переходах */
export function ViewerSync() {
  const pathname = usePathname();
  useEffect(() => {
    refreshViewer();
  }, [pathname]);
  return null;
}
