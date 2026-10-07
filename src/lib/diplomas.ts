/**
 * Дипломы турнира: чистые помощники текста (без базы).
 * Дипломы получают команды-призёры (места 1–3) и победители номинаций.
 */

/** «1» → «I», «2» → «II», «3» и «3–4» → «III»; иначе null (4 место диплома не получает) */
export function placeRoman(place: string): string | null {
  if (place === "1") return "I";
  if (place === "2") return "II";
  if (place === "3" || place === "3–4") return "III";
  return null;
}

/**
 * Организация, от которой заявлена команда (школа, колледж, предприятие).
 * Колонку добавляет заявка официального турнира; пока её нет в данных — null.
 */
export function registrationOrganization(registration: unknown): string | null {
  if (!registration || typeof registration !== "object") return null;
  const value = (registration as Record<string, unknown>).organization;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Как назван турнир в дипломе, в двух падежах */
export type EventKind = { prepositional: string; genitive: string };
export const CITY_TOURNAMENT: EventKind = { prepositional: "городском спортивном турнире", genitive: "городского спортивного турнира" };

export type Diploma = {
  key: string;
  /** кто награждается: команда или человек */
  recipient: string;
  /** вторая строка под именем: организация команды или команда игрока */
  subline: string | null;
  /** «за I место в …» или «в номинации «…»» */
  reason: string;
  /** продолжение для номинации: «городского спортивного турнира «…»» */
  event: string | null;
};

export function placeDiploma(key: string, place: string, team: string, organization: string | null, eventName: string, eventKind: EventKind = CITY_TOURNAMENT): Diploma | null {
  const roman = placeRoman(place);
  if (!roman) return null;
  return { key, recipient: team, subline: organization, reason: `за ${roman} место в ${eventKind.prepositional} «${eventName}»`, event: null };
}

export function nominationDiploma(key: string, title: string, person: string, team: string | null, eventName: string, eventKind: EventKind = CITY_TOURNAMENT): Diploma {
  return { key, recipient: person, subline: team, reason: `в номинации «${title}»`, event: `${eventKind.genitive} «${eventName}»` };
}
