/** Тема сайта: светлая (по умолчанию) или тёмная «Тянь-шаньская ель». Хранится в cookie, см. ThemeSwitch */
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";
