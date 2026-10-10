/**
 * SEO: общие тексты и структурированные данные (schema.org) для поисковиков.
 * Описания — живым языком и с городом: по ним сайт находят в Google и Яндексе.
 */
import { SITE_URL } from "./site";

export const SITE_NAME = "F16 Arena";
export const CLUB_CITY = "Усть-Каменогорск";
export const CLUB_SITE = "https://f16-arena.kz";

export const SITE_DESCRIPTION =
  "Турниры по CS2 в Усть-Каменогорске (Өскемен) от компьютерного клуба F16 Arena: регистрация через Steam, команды 5×5, 2×2 и 1×1, турнирные сетки, расписание матчей, рейтинг и статистика игроков.";

export const SITE_KEYWORDS = [
  "турнир CS2",
  "турниры CS2 Усть-Каменогорск",
  "CS2 Өскемен",
  "киберспорт Усть-Каменогорск",
  "киберспорт Казахстан",
  "F16 Arena",
  "компьютерный клуб Усть-Каменогорск",
  "LAN турнир",
  "Counter-Strike 2",
];

/** Обрезка описания под сниппет поисковика (~160 символов), по границе слова */
export function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

export const absolute = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`);

/** Организатор — клуб F16 Arena; одинаков во всех структурированных данных */
export const ORGANIZER = {
  "@type": "Organization",
  name: SITE_NAME,
  url: CLUB_SITE,
  logo: absolute("/icon.svg"),
  address: { "@type": "PostalAddress", addressLocality: CLUB_CITY, addressCountry: "KZ" },
} as const;
