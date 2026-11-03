/**
 * Навигация сайта.
 * Основное меню — разделы продукта. Игроки — через поиск, рейтинг, команды и матчи (не отдельный пункт).
 * «Поиск команды» живёт в контексте команд. О платформе, правила и FAQ — второстепенное (подвал, меню «Ещё» на телефоне).
 * match — какие пути подсвечивают пункт.
 */
import { tr } from "@/lib/i18n/core";

export type NavItem = { href: string; label: string; match: string[] };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/tournaments", label: tr("Турниры"), match: ["/tournaments"] },
  { href: "/matches", label: tr("Матчи"), match: ["/matches"] },
  { href: "/lobbies", label: tr("Лобби"), match: ["/lobbies", "/lobby"] },
  { href: "/stats", label: tr("Рейтинг"), match: ["/stats", "/players"] },
  { href: "/teams", label: tr("Команды"), match: ["/teams", "/team", "/find", "/join"] },
];

export const SECONDARY_NAV: { href: string; label: string }[] = [
  { href: "/players", label: tr("Игроки") },
  { href: "/find", label: tr("Поиск команды") },
  { href: "/chat", label: tr("Чат") },
  { href: "/tg", label: tr("Telegram-чат") },
  { href: "/about", label: tr("О платформе") },
  { href: "/help", label: tr("Как это работает") },
  { href: "/rules", label: tr("Правила") },
  { href: "/rules#faq", label: "FAQ" },
  { href: "/privacy", label: tr("Персональные данные") },
];

export function isActive(pathname: string, item: NavItem) {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Страницы без шапки и подвала сайта: F16 Control, режим ТВ, оверлей и экран перерыва трансляции (OBS) */
export function noChrome(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname === "/tv" ||
    pathname.startsWith("/tv/") ||
    pathname.endsWith("/tv") ||
    pathname === "/overlay" ||
    pathname === "/broadcast"
  );
}
