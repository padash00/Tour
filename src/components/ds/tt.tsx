"use client";

import type { ComponentProps } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Перевод для общих компонентов, которые рендерятся и на сервере, и на клиенте (хук useT там недоступен).
 * Tt — текст; TSpan — span, у которого подсказка (title) и aria-label переводятся.
 * Сам русский текст нужно пометить tr("…") там, где он задан, — тогда проверка словаря его увидит.
 */
export function Tt({ text, vars }: { text: string; vars?: Record<string, string | number | null | undefined> }) {
  const t = useT();
  return <>{t(text, vars)}</>;
}

export function TSpan({ text, vars, ...props }: { text: string; vars?: Record<string, string | number | null | undefined> } & ComponentProps<"span">) {
  const t = useT();
  const label = t(text, vars);
  return <span title={label} aria-label={label} {...props} />;
}
