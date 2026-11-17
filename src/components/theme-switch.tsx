"use client";

import { Moon, Sun } from "lucide-react";
import { saveThemeChoice } from "@/app/actions/theme";
import { cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Переключатель светлой и тёмной темы. Выбор лежит в cookie на год: сервер сразу отдаёт страницу
 * в нужной теме (атрибут data-theme у <html>), без вспышки белого при загрузке. У вошедшего игрока
 * выбор ещё и в профиле — на другом устройстве откроется его тема.
 * Значок выбирает CSS по data-theme: компоненту не нужно знать тему до нажатия.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const t = useT();
  const toggle = () => {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // профиль — не обязателен: cookie уже стоит, гостю её хватает
    saveThemeChoice(next).catch(() => {});
  };
  const label = t("Светлая или тёмная тема");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-fg-2 transition-colors hover:bg-ink/[0.09] hover:text-fg", className)}
    >
      <Moon className="size-[18px] [[data-theme=dark]_&]:hidden" />
      <Sun className="hidden size-[18px] [[data-theme=dark]_&]:block" />
    </button>
  );
}
