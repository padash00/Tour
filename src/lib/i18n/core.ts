import type { ReactNode } from "react";
import { Fragment, createElement } from "react";
import { KK } from "@/i18n/kk";

/**
 * Перевод интерфейса. Ключ — сам русский текст: t("Турниры") → по-казахски из словаря src/i18n/kk/*,
 * а если перевода нет — русский как есть (ничего не ломается, просто остаётся по-русски).
 * Подстановки: t("Команда {name} создана", { name }).
 */
export type Lang = "ru" | "kk";
export const LANGS: Lang[] = ["ru", "kk"];
export const LANG_COOKIE = "lang";
export const isLang = (v: unknown): v is Lang => v === "ru" || v === "kk";
/** Локаль для Intl (даты, числа) */
export const intlLocale = (lang: Lang) => (lang === "kk" ? "kk-KZ" : "ru-RU");

type Vars = Record<string, string | number | null | undefined>;

function fill(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

export type T = {
  (ru: string, vars?: Vars): string;
  lang: Lang;
  /** Число + слово. По-русски — три формы, по-казахски после числа всегда одна (перевод формы «one») */
  plural: (n: number, one: string, few: string, many: string) => string;
  /** Текст с разметкой: t.rich("Нажмите <b>Подать</b>", { b: (c) => <b>{c}</b> }) */
  rich: (ru: string, tags: Record<string, (chunk: ReactNode) => ReactNode>, vars?: Vars) => ReactNode;
};

function ruPlural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

const cache = new Map<Lang, T>();

export function makeT(lang: Lang): T {
  const hit = cache.get(lang);
  if (hit) return hit;
  const dict: Record<string, string> = lang === "kk" ? KK : {};
  const t = ((ru: string, vars?: Vars) => fill(dict[ru] ?? ru, vars)) as T;
  t.lang = lang;
  t.plural = (n, one, few, many) => (lang === "kk" ? (dict[one] ?? one) : ruPlural(n, one, few, many));
  t.rich = (ru, tags, vars) => {
    const s = t(ru, vars);
    const out: ReactNode[] = [];
    const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const fn = tags[m[1]];
      out.push(createElement(Fragment, { key: i++ }, fn ? fn(m[2]) : m[2]));
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return createElement(Fragment, null, ...out);
  };
  cache.set(lang, t);
  return t;
}

/** Язык по заголовку Accept-Language: казахский — если он стоит раньше русского */
export function langFromAccept(header: string | null | undefined): Lang {
  const h = (header ?? "").toLowerCase();
  const kk = h.search(/\bkk\b|\bkz\b/);
  const ru = h.search(/\bru\b/);
  return kk >= 0 && (ru < 0 || kk < ru) ? "kk" : "ru";
}

/** Метка «этот текст переводится» для констант (подписи статусов, пункты меню): возвращает как есть, переводится при показе через t(...) */
export const tr = <S extends string>(s: S) => s;
