"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LANG, makeT, type Lang } from "./core";

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
/** Переводчик для клиентских компонентов: const t = useT() */
export const useT = () => makeT(useContext(LangContext));
