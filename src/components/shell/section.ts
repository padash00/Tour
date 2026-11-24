"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * Раздел меню, который страница просит подсветить вместо найденного по адресу.
 * Нужен комнате лобби: адрес у всех комнат один (/lobby/КОД), а игра на банк относится к «Миксу», не к «Лобби».
 */
let section: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function set(next: string | null) {
  if (section === next) return;
  section = next;
  for (const fn of listeners) fn();
}

/** Адрес раздела, который надо считать текущим (null — определять по адресу страницы) */
export const useNavSection = () => useSyncExternalStore(subscribe, () => section, () => null);

/** Пока компонент на экране, меню подсвечивает раздел href */
export function useSetNavSection(href: string | null) {
  useEffect(() => {
    set(href);
    return () => set(null);
  }, [href]);
}
