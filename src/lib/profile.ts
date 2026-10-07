/**
 * Анкета игрока: правила полей, телефон, возраст на дату турнира. Чистые функции без базы —
 * их используют форма (подсказки до отправки), server actions (главная проверка) и тесты.
 * Правило «анкета заполнена» совпадает с SQL-функцией player_profile_complete.
 */
import type { PlayerProfile } from "./types";

/** Версия политики /privacy. Меняется вместе с текстом политики — согласие хранится с версией */
export const PRIVACY_VERSION = "2026-10-09";

export type Occupation = "works" | "studies" | "other";

export const OCCUPATIONS: Record<Occupation, string> = {
  works: "Работаю",
  studies: "Учусь",
  other: "Не работаю и не учусь",
};

/** Поля анкеты, которые заполняет игрок */
export type ProfileInput = Pick<
  PlayerProfile,
  "last_name" | "first_name" | "patronymic" | "birth_date" | "phone" | "city" | "occupation" | "organization" | "position" | "course" | "study_group"
>;

export type ProfileLike = ProfileInput & Pick<PlayerProfile, "consent_at">;

const FIELD_LABELS = {
  last_name: "фамилия",
  first_name: "имя",
  birth_date: "дата рождения",
  phone: "телефон",
  city: "город",
  occupation: "занятость",
  organization: "место работы или учёбы",
  position: "должность",
  course: "курс",
  study_group: "группа",
  consent_at: "согласие на обработку данных",
} as const;

// ───────────────────────── текст

/** Убирает лишние пробелы; пустая строка → null; длинная — обрезается */
export function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

// ───────────────────────── телефон

/**
 * Телефон Казахстана в виде +7XXXXXXXXXX. Принимает «8 705 123 45 67», «+7 (705) 123-45-67», «7051234567».
 * null — номер не распознан.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // буквы в номере — не номер (защита от «8-800-ABC»)
  if (/[^\d\s()+\-.]/.test(raw.trim())) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  else if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  // код оператора/города не начинается с 0
  if (digits[1] === "0") return null;
  return `+${digits}`;
}

/** +77051234567 → «+7 705 123 45 67» */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

// ───────────────────────── даты и возраст

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Корректная календарная дата YYYY-MM-DD (31 февраля — нет) */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = DAY.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** День в Казахстане (UTC+5) как YYYY-MM-DD — так же считает база (at time zone '+05:00') */
export function almatyDay(at: Date | string | number = Date.now()): string {
  return new Date(new Date(at).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** День турнира для проверки возраста: дата старта, а без неё — сегодня */
export function tournamentDay(t: { starts_at: string | null }, now: number = Date.now()): string {
  return almatyDay(t.starts_at ?? now);
}

/**
 * Полных лет на дату `day` (обе — YYYY-MM-DD). День рождения засчитывается в сам день;
 * родившимся 29 февраля в невисокосный год — с 1 марта (как age() в PostgreSQL).
 */
export function ageOn(birth: string, day: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** 1 год, 2 года, 5 лет */
export function yearsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} год`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} года`;
  return `${n} лет`;
}

/** 2008-03-14 → 14.03.2008 */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "";
  const m = DAY.exec(day);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : day;
}

// ───────────────────────── анкета

/** Чего не хватает в анкете — подписи полей по-русски. Пусто — анкета заполнена */
export function missingProfileFields(p: ProfileLike | null | undefined): string[] {
  if (!p) return ["анкета не заполнена"];
  const missing: string[] = [];
  const empty = (v: string | null | undefined) => !v || !v.trim();
  if (empty(p.last_name)) missing.push(FIELD_LABELS.last_name);
  if (empty(p.first_name)) missing.push(FIELD_LABELS.first_name);
  if (!p.birth_date) missing.push(FIELD_LABELS.birth_date);
  if (!p.phone) missing.push(FIELD_LABELS.phone);
  if (empty(p.city)) missing.push(FIELD_LABELS.city);
  if (!p.occupation) missing.push(FIELD_LABELS.occupation);
  if ((p.occupation === "works" || p.occupation === "studies") && empty(p.organization)) missing.push(FIELD_LABELS.organization);
  if (p.occupation === "works" && empty(p.position)) missing.push(FIELD_LABELS.position);
  if (p.occupation === "studies" && empty(p.course)) missing.push(FIELD_LABELS.course);
  if (p.occupation === "studies" && empty(p.study_group)) missing.push(FIELD_LABELS.study_group);
  if (!p.consent_at) missing.push(FIELD_LABELS.consent_at);
  return missing;
}

export function isProfileComplete(p: ProfileLike | null | undefined): boolean {
  return missingProfileFields(p).length === 0;
}

/** «Иванов Иван Иванович» */
export function fullName(p: Pick<ProfileInput, "last_name" | "first_name" | "patronymic"> | null | undefined): string {
  if (!p) return "";
  return [p.last_name, p.first_name, p.patronymic].filter((x) => x && x.trim()).join(" ");
}

/** Место работы или учёбы для заявки */
export function workplaceOf(p: Pick<ProfileInput, "occupation" | "organization"> | null | undefined): string {
  if (!p) return "";
  return p.organization?.trim() || (p.occupation === "other" ? "не работает и не учится" : "");
}

/** Должность или курс и группа: «инженер» / «2 курс» — группа отдельно */
export function positionOf(p: Pick<ProfileInput, "occupation" | "position" | "course"> | null | undefined): string {
  if (!p) return "";
  if (p.occupation === "works") return p.position?.trim() ?? "";
  if (p.occupation === "studies") return p.course?.trim() ? (/^\d+$/.test(p.course.trim()) ? `${p.course.trim()} курс` : p.course.trim()) : "";
  return "";
}

/** Город без учёта регистра, «ё», дефисов и пробелов: «усть каменогорск» = «Усть-Каменогорск» */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const k = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/ё/g, "е").replace(/^г\.?\s*/, "").replace(/[\s\-–—.]+/g, "");
  return !!a && !!b && k(a) === k(b);
}

export type ProfileErrors = Partial<Record<keyof ProfileInput | "consent", string>>;

/**
 * Разбор и проверка формы анкеты. Возвращает нормализованные значения или ошибки по полям.
 * today — для проверки даты рождения (не в будущем, не старше 100 лет).
 */
export function parseProfileForm(get: (key: string) => unknown, today: string = almatyDay()): { value: ProfileInput; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const occupationRaw = get("occupation");
  const occupation = occupationRaw === "works" || occupationRaw === "studies" || occupationRaw === "other" ? occupationRaw : null;
  const value: ProfileInput = {
    last_name: cleanText(get("last_name"), 60),
    first_name: cleanText(get("first_name"), 60),
    patronymic: cleanText(get("patronymic"), 60),
    birth_date: parseDay(get("birth_date")),
    phone: normalizePhone(get("phone")),
    city: cleanText(get("city"), 60),
    occupation,
    // для «не работаю и не учусь» организация необязательна
    organization: cleanText(get("organization"), 160),
    position: occupation === "works" ? cleanText(get("position"), 80) : null,
    course: occupation === "studies" ? cleanText(get("course"), 20) : null,
    study_group: occupation === "studies" ? cleanText(get("study_group"), 30) : null,
  };
  // в ФИО — буквы, пробел, дефис и апостроф
  const badName = (v: string | null) => !!v && !/^\p{L}[\p{L}' -]*$/u.test(v);
  if (!value.last_name) errors.last_name = "Укажите фамилию";
  else if (badName(value.last_name)) errors.last_name = "Только буквы, пробел и дефис";
  if (!value.first_name) errors.first_name = "Укажите имя";
  else if (badName(value.first_name)) errors.first_name = "Только буквы, пробел и дефис";
  if (badName(value.patronymic)) errors.patronymic = "Только буквы, пробел и дефис";
  if (!value.birth_date) errors.birth_date = cleanText(get("birth_date")) ? "Неверная дата" : "Укажите дату рождения";
  else if (value.birth_date > today) errors.birth_date = "Дата рождения в будущем";
  else if (ageOn(value.birth_date, today) > 100) errors.birth_date = "Проверьте год рождения";
  if (!value.phone) errors.phone = cleanText(get("phone")) ? "Номер в формате +7 7XX XXX XX XX" : "Укажите телефон";
  if (!value.city) errors.city = "Укажите город";
  if (!occupation) errors.occupation = "Выберите вариант";
  if ((occupation === "works" || occupation === "studies") && !value.organization) {
    errors.organization = occupation === "works" ? "Укажите место работы" : "Укажите учебное заведение";
  }
  if (occupation === "works" && !value.position) errors.position = "Укажите должность";
  if (occupation === "studies" && !value.course) errors.course = "Укажите курс или класс";
  if (occupation === "studies" && !value.study_group) errors.study_group = "Укажите группу";
  return { value, errors };
}
