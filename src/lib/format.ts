import { mapLabel } from "./maps";
import type { RegistrationStatus, TournamentStatus } from "./types";
import { intlLocale, tr, type Lang } from "./i18n/core";

const TZ = "Asia/Almaty";

export function formatDate(iso: string | null | undefined, lang: Lang = "ru") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, lang: Lang = "ru") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined, lang: Lang = "ru") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function formatShortDateTime(iso: string | null | undefined, lang: Lang = "ru") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

/** datetime-local value (в часовом поясе Алматы) → ISO */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) return null;
  // Казахстан — UTC+5 круглый год
  return new Date(`${value}:00+05:00`).toISOString();
}

/** ISO → значение для <input type="datetime-local"> в часовом поясе Алматы */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export const tournamentStatusLabel: Record<TournamentStatus, string> = {
  draft: tr("Черновик"),
  registration: tr("Регистрация открыта"),
  registration_closed: tr("Регистрация закрыта"),
  checkin: tr("Идёт check-in"),
  live: tr("Идёт турнир"),
  finished: tr("Завершён"),
  cancelled: tr("Отменён"),
};

export const registrationStatusLabel: Record<RegistrationStatus, string> = {
  pending: tr("На рассмотрении"),
  approved: tr("Одобрена"),
  rejected: tr("Отклонена"),
  withdrawn: tr("Отозвана"),
};

export const bracketLabel: Record<string, string> = {
  double_elimination: "Double Elimination",
  single_elimination: "Single Elimination",
  round_robin: tr("Круговая система"),
  groups_playoff: tr("Группы + плей-офф"),
  swiss: tr("Швейцарская система"),
  swiss_playoff: tr("Швейцарка + плей-офф"),
};

export function mapName(map: string) {
  return mapLabel(map); // workshop: «aim_map@123456» → aim_map
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Деньги из свободного поля турнира: «800000» → «800 000 ₸»; текст («Кубок и мерч») — как есть */
export function formatMoney(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!/^\d[\d\s]*$/.test(raw)) return raw;
  return `${new Intl.NumberFormat("ru-RU").format(Number(raw.replace(/\s/g, "")))} ₸`;
}
