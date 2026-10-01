import { mapLabel } from "./maps";
import type { RegistrationStatus, TournamentStatus } from "./types";

const TZ = "Asia/Almaty";

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function formatShortDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
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
  draft: "Черновик",
  registration: "Регистрация открыта",
  registration_closed: "Регистрация закрыта",
  checkin: "Идёт check-in",
  live: "Идёт турнир",
  finished: "Завершён",
  cancelled: "Отменён",
};

export const registrationStatusLabel: Record<RegistrationStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
  withdrawn: "Отозвана",
};

export const bracketLabel: Record<string, string> = {
  double_elimination: "Double Elimination",
  single_elimination: "Single Elimination",
  round_robin: "Круговая система",
  groups_playoff: "Группы + плей-офф",
  swiss: "Швейцарская система",
  swiss_playoff: "Швейцарка + плей-офф",
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
