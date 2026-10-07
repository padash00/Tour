/**
 * Навигация сайта.
 * Основное меню — разделы продукта. Игроки — через поиск, рейтинг, команды и матчи (не отдельный пункт).
 * «Поиск команды» живёт в контексте команд. О платформе, правила и FAQ — второстепенное (подвал, меню «Ещё» на телефоне).
 * match — какие пути подсвечивают пункт.
 */
export type NavItem = { href: string; label: string; match: string[] };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/tournaments", label: "Турниры", match: ["/tournaments"] },
  { href: "/matches", label: "Матчи", match: ["/matches"] },
  { href: "/lobbies", label: "Лобби", match: ["/lobbies", "/lobby"] },
  { href: "/stats", label: "Рейтинг", match: ["/stats", "/players"] },
  { href: "/teams", label: "Команды", match: ["/teams", "/team", "/find", "/join"] },
];

export const SECONDARY_NAV: { href: string; label: string }[] = [
  { href: "/players", label: "Игроки" },
  { href: "/find", label: "Поиск команды" },
  { href: "/about", label: "О платформе" },
  { href: "/rules", label: "Правила" },
  { href: "/rules#faq", label: "FAQ" },
  { href: "/privacy", label: "Персональные данные" },
];

export function isActive(pathname: string, item: NavItem) {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Страницы без шапки и подвала сайта: F16 Control и режим ТВ */
export function noChrome(pathname: string) {
  return pathname.startsWith("/admin") || pathname === "/tv" || pathname.startsWith("/tv/") || pathname.endsWith("/tv");
}
