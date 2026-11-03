/**
 * Официальный турнир (городской, с акиматом): проверка заявки и строки выгрузки. Чистые функции без базы —
 * их используют форма заявки (чек-лист до отправки), server actions, экспорт и тесты.
 * Та же проверка в базе — RPC save_official_registration (последняя защита).
 */
import { makeT, type T } from "./i18n/core";
import { modeOf } from "./modes";
import {
  ageOn,
  cleanText,
  formatDay,
  formatPhone,
  fullName,
  missingProfileFields,
  normalizePhone,
  parseDay,
  positionOf,
  sameCity,
  workplaceOf,
  type ProfileLike,
} from "./profile";
import type { RegistrationStatus, Tournament, TournamentApplication } from "./types";

export type OfficialSettings = Pick<Tournament, "is_official" | "min_age" | "max_age" | "city" | "require_coach" | "allow_substitutes" | "format">;

/** Сколько игроков в основе и сколько запасных разрешено в официальном турнире */
export function officialRoster(t: Pick<OfficialSettings, "format" | "allow_substitutes">) {
  const mode = modeOf(t.format);
  return { size: mode.size, subs: t.allow_substitutes ? mode.subs : 0 };
}

/** «35 лет» / «21 год» */
function yearsLabel(n: number, tx: T): string {
  return tx.plural(n, "{n} год", "{n} года", "{n} лет").replace("{n}", String(n));
}

/** «16–35 лет» */
export function ageRangeLabel(t: Pick<OfficialSettings, "min_age" | "max_age">, tx: T = makeT("ru")) {
  return `${t.min_age}–${yearsLabel(t.max_age, tx)}`;
}

// ───────────────────────── игроки

/**
 * Итог проверки одного игрока. Только производные сообщения (ник, возраст, названия пустых полей) —
 * их можно показать капитану: сами персональные данные товарищей по команде капитану не передаются.
 */
export type PlayerCheck = { player_id: string; nickname: string; issues: string[]; warnings: string[] };

export function checkPlayer(
  player: { id: string; nickname: string },
  profile: (ProfileLike & { birth_date: string | null }) | null,
  t: Pick<OfficialSettings, "min_age" | "max_age" | "city">,
  day: string,
  tx: T = makeT("ru"),
): PlayerCheck {
  const issues: string[] = [];
  const warnings: string[] = [];
  const missing = missingProfileFields(profile);
  if (missing.length) {
    issues.push(
      !profile
        ? `${player.nickname}: ${tx("анкета не заполнена")}`
        : `${player.nickname}: ${tx("в анкете не заполнено — {fields}", { fields: missing.map((m) => tx(m)).join(", ") })}`,
    );
  }
  if (profile?.birth_date) {
    const age = ageOn(profile.birth_date, day);
    if (age < t.min_age || age > t.max_age) issues.push(`${player.nickname}: ${tx("{age} — не проходит по возрасту ({range})", { age: yearsLabel(age, tx), range: ageRangeLabel(t, tx) })}`);
  }
  if (profile?.city && !sameCity(profile.city, t.city)) warnings.push(`${player.nickname}: ${tx("в анкете другой город — участвуют жители {city}", { city: t.city })}`);
  return { player_id: player.id, nickname: player.nickname, issues, warnings };
}

// ───────────────────────── заявка организации

export type ApplicationInput = {
  organization: string | null;
  captain_phone: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  coach_name: string | null;
  coach_birth_date: string | null;
  coach_workplace: string | null;
  coach_position: string | null;
};

export type ApplicationErrors = Partial<Record<keyof ApplicationInput, string>>;

/** Разбор полей заявки из формы: телефоны нормализуются, тексты чистятся */
export function parseApplication(get: (key: string) => unknown, requireCoach: boolean, tx: T = makeT("ru")): { value: ApplicationInput; errors: ApplicationErrors } {
  const value: ApplicationInput = {
    organization: cleanText(get("organization"), 200),
    captain_phone: normalizePhone(get("captain_phone")),
    responsible_name: cleanText(get("responsible_name"), 120),
    responsible_phone: normalizePhone(get("responsible_phone")),
    coach_name: cleanText(get("coach_name"), 120),
    coach_birth_date: parseDay(get("coach_birth_date")),
    coach_workplace: cleanText(get("coach_workplace"), 200),
    coach_position: cleanText(get("coach_position"), 120),
  };
  const errors: ApplicationErrors = {};
  const phoneError = (key: string) => (cleanText(get(key)) ? tx("Номер в формате +7 7XX XXX XX XX") : tx("Укажите телефон"));
  if (!value.organization) errors.organization = tx("Укажите полное название организации");
  if (!value.captain_phone) errors.captain_phone = phoneError("captain_phone");
  if (!value.responsible_name) errors.responsible_name = tx("Укажите ФИО ответственного лица");
  if (!value.responsible_phone) errors.responsible_phone = phoneError("responsible_phone");
  if (requireCoach) {
    if (!value.coach_name) errors.coach_name = tx("Укажите ФИО тренера");
    if (!value.coach_birth_date) errors.coach_birth_date = cleanText(get("coach_birth_date")) ? tx("Неверная дата") : tx("Укажите дату рождения тренера");
    if (!value.coach_workplace) errors.coach_workplace = tx("Укажите место работы или учёбы тренера");
    if (!value.coach_position) errors.coach_position = tx("Укажите должность или курс тренера");
  }
  return { value, errors };
}

// ───────────────────────── чек-лист заявки

export type CheckItem = { key: string; label: string; ok: boolean; detail?: string; warn?: boolean };

/**
 * Что проверяется перед отправкой заявки: состав, анкеты и возраст каждого игрока, данные организации и тренера.
 * Отправить можно, когда все пункты ok; warn — предупреждение, не блокирует (решает администратор).
 */
export function officialChecklist({
  t,
  players,
  mains,
  subs,
  application,
  tx = makeT("ru"),
}: {
  t: OfficialSettings;
  tx?: T;
  /** проверки всех выбранных игроков (основа и запасные) */
  players: PlayerCheck[];
  mains: number;
  subs: number;
  application: ApplicationErrors;
}): CheckItem[] {
  const { size, subs: maxSubs } = officialRoster(t);
  const playersText = tx.plural(size, "{n} игрок", "{n} игрока", "{n} игроков").replace("{n}", String(size));
  const items: CheckItem[] = [
    {
      key: "roster",
      label: t.require_coach ? tx("Состав: {players} в основе и тренер", { players: playersText }) : tx("Состав: {players} в основе", { players: playersText }),
      ok: mains === size,
      detail: mains === size ? undefined : tx("выбрано {a} из {b}", { a: mains, b: size }),
    },
  ];
  if (maxSubs === 0) items.push({ key: "subs", label: tx("Без запасных — состав в заявке окончательный"), ok: subs === 0, detail: subs ? tx("запасных: {n}", { n: subs }) : undefined });
  else if (subs > maxSubs) items.push({ key: "subs", label: tx("Запасных — не больше {n}", { n: maxSubs }), ok: false, detail: tx("выбрано {n}", { n: subs }) });
  for (const p of players) {
    items.push({
      key: `player:${p.player_id}`,
      label: p.nickname,
      ok: p.issues.length === 0,
      detail: p.issues.length ? p.issues.map((x) => x.replace(`${p.nickname}: `, "")).join("; ") : p.warnings.length ? p.warnings.map((x) => x.replace(`${p.nickname}: `, "")).join("; ") : tx("анкета заполнена, возраст подходит"),
      warn: p.issues.length === 0 && p.warnings.length > 0,
    });
  }
  items.push({ key: "organization", label: tx("Организация, которую представляет команда"), ok: !application.organization, detail: application.organization });
  items.push({ key: "captain", label: tx("Телефон капитана"), ok: !application.captain_phone, detail: application.captain_phone });
  const resp = application.responsible_name ?? application.responsible_phone;
  items.push({ key: "responsible", label: tx("Ответственное лицо: ФИО и телефон"), ok: !resp, detail: resp });
  if (t.require_coach) {
    const coach = application.coach_name ?? application.coach_birth_date ?? application.coach_workplace ?? application.coach_position;
    items.push({ key: "coach", label: tx("Тренер: ФИО, дата рождения, место работы и должность"), ok: !coach, detail: coach });
  }
  return items;
}

/** Предупреждение о возрасте тренера (не блокирует: решает организатор) */
export function coachAgeWarning(t: Pick<OfficialSettings, "min_age" | "max_age">, birth: string | null, day: string, tx: T = makeT("ru")): string | null {
  if (!birth) return null;
  const age = ageOn(birth, day);
  return age < t.min_age || age > t.max_age ? tx("Тренеру {age} — вне возраста участников ({range}), проверьте по Положению", { age: yearsLabel(age, tx), range: ageRangeLabel(t, tx) }) : null;
}

// ───────────────────────── выгрузка

export type ExportPlayer = { nickname: string; captain: boolean; profile: (ProfileLike & { birth_date: string | null }) | null; documents: boolean };

export type ExportTeam = {
  team: string;
  status: RegistrationStatus;
  application: Pick<
    TournamentApplication,
    | "organization"
    | "captain_phone"
    | "responsible_name"
    | "responsible_phone"
    | "coach_name"
    | "coach_birth_date"
    | "coach_workplace"
    | "coach_position"
    | "coach_documents_at"
  > | null;
  players: ExportPlayer[];
};

export type ExportResult = { place: string; team: string; wins: number; losses: number; mapWins: number; mapLosses: number };

export type Cell = string | number | null;

export const REGISTRATION_STATUS_RU: Record<RegistrationStatus, string> = {
  pending: "на рассмотрении",
  approved: "одобрена",
  rejected: "отклонена",
  withdrawn: "отозвана",
};

/** «2 курс, гр. ИС-21» / «инженер» */
export function positionCell(p: (NonNullable<Parameters<typeof positionOf>[0]> & { study_group?: string | null }) | null | undefined): string {
  if (!p) return "";
  const pos = positionOf(p);
  if (p?.occupation === "studies" && p.study_group?.trim()) return pos ? `${pos}, гр. ${p.study_group.trim()}` : `гр. ${p.study_group.trim()}`;
  return pos;
}

/**
 * Строки листов Excel: «Участники», «Команды», «Итоги». day — дата турнира для возраста.
 * Капитан первым, затем игроки, тренер — последним в команде.
 */
export function buildOfficialExport(teams: ExportTeam[], day: string, results: ExportResult[] = []) {
  const participants: Cell[][] = [
    ["№", "Команда", "Организация", "ФИО", "Дата рождения", "Год рождения", "Возраст", "Место работы/учёбы", "Должность/курс-группа", "Роль", "Телефон", "Документы сданы"],
  ];
  let n = 0;
  const sorted = [...teams].sort((a, b) => a.team.localeCompare(b.team, "ru"));
  for (const t of sorted) {
    const org = t.application?.organization ?? "";
    const players = [...t.players].sort((a, b) => Number(b.captain) - Number(a.captain));
    for (const p of players) {
      const birth = p.profile?.birth_date ?? null;
      participants.push([
        ++n,
        t.team,
        org,
        fullName(p.profile) || p.nickname,
        birth ? formatDay(birth) : "",
        birth ? Number(birth.slice(0, 4)) : "",
        birth ? ageOn(birth, day) : "",
        workplaceOf(p.profile),
        positionCell(p.profile),
        p.captain ? "капитан" : "игрок",
        formatPhone(p.profile?.phone),
        p.documents ? "да" : "нет",
      ]);
    }
    const a = t.application;
    if (a?.coach_name) {
      participants.push([
        ++n,
        t.team,
        org,
        a.coach_name,
        a.coach_birth_date ? formatDay(a.coach_birth_date) : "",
        a.coach_birth_date ? Number(a.coach_birth_date.slice(0, 4)) : "",
        a.coach_birth_date ? ageOn(a.coach_birth_date, day) : "",
        a.coach_workplace ?? "",
        a.coach_position ?? "",
        "тренер",
        "",
        a.coach_documents_at ? "да" : "нет",
      ]);
    }
  }

  const teamRows: Cell[][] = [
    ["Команда", "Организация", "Капитан (ФИО)", "Телефон капитана", "Ответственное лицо (ФИО)", "Телефон ответственного", "Статус заявки"],
    ...sorted.map((t) => {
      const captain = t.players.find((p) => p.captain);
      return [
        t.team,
        t.application?.organization ?? "",
        captain ? fullName(captain.profile) || captain.nickname : "",
        formatPhone(t.application?.captain_phone ?? captain?.profile?.phone),
        t.application?.responsible_name ?? "",
        formatPhone(t.application?.responsible_phone),
        REGISTRATION_STATUS_RU[t.status],
      ];
    }),
  ];

  const orgOf = new Map(teams.map((t) => [t.team, t.application?.organization ?? ""]));
  const resultRows: Cell[][] = [
    ["Место", "Команда", "Организация", "Победы", "Поражения", "Карты"],
    ...results.map((r) => [r.place, r.team, orgOf.get(r.team) ?? "", r.wins, r.losses, `${r.mapWins}:${r.mapLosses}`]),
  ];
  return { participants, teams: teamRows, results: resultRows };
}
