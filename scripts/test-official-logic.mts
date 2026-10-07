// Чистые функции официального турнира и анкеты игрока: возраст на дату турнира, телефон, заполненность анкеты,
// подсказки организаций, проверка заявки (5 игроков + тренер, без запасных, возраст) и строки выгрузки Excel.
// Без базы и без .env.
import assert from "node:assert/strict";
import { dedupeOrganizations, organizationKey, SEED_ORGANIZATIONS } from "../src/lib/organizations";
import {
  buildOfficialExport,
  checkPlayer,
  coachAgeWarning,
  officialChecklist,
  officialRoster,
  parseApplication,
  type ExportTeam,
  type OfficialSettings,
  type PlayerCheck,
} from "../src/lib/official";
import {
  ageOn,
  almatyDay,
  formatPhone,
  isProfileComplete,
  missingProfileFields,
  normalizePhone,
  parseDay,
  parseProfileForm,
  tournamentDay,
  yearsLabel,
  type ProfileLike,
} from "../src/lib/profile";

let checks = 0;
const test = (name: string, work: () => void) => { work(); checks++; console.log(`✓ ${name}`); };

const T: OfficialSettings = { is_official: true, min_age: 16, max_age: 35, city: "Усть-Каменогорск", require_coach: true, allow_substitutes: false, format: "5v5" };
const DAY = "2026-11-15";

/** Полная анкета студента; birth — дата рождения */
const profile = (birth: string, extra: Partial<ProfileLike> = {}): ProfileLike => ({
  last_name: "Иванов",
  first_name: "Иван",
  patronymic: null,
  birth_date: birth,
  phone: "+77051234567",
  city: "Усть-Каменогорск",
  occupation: "studies",
  organization: "ВКТУ им. Д. Серикбаева",
  position: null,
  course: "2",
  study_group: "ИС-21",
  consent_at: "2026-10-09T10:00:00Z",
  ...extra,
});

test("ageOn counts the birthday on the day itself and not the day before", () => {
  assert.equal(ageOn("2000-11-15", "2026-11-15"), 26);
  assert.equal(ageOn("2000-11-16", "2026-11-15"), 25);
  assert.equal(ageOn("2000-12-01", "2026-11-15"), 25);
  assert.equal(ageOn("2000-01-01", "2026-11-15"), 26);
});

test("ageOn: born on 29 February turns a year older on 1 March in a common year (as PostgreSQL age())", () => {
  assert.equal(ageOn("2008-02-29", "2027-02-28"), 18);
  assert.equal(ageOn("2008-02-29", "2027-03-01"), 19);
  assert.equal(ageOn("2008-02-29", "2028-02-29"), 20);
  assert.equal(ageOn("2008-02-28", "2027-02-28"), 19);
});

test("Age bounds 16 and 35 are inclusive on the tournament day", () => {
  const ok = (birth: string) => checkPlayer({ id: "p", nickname: "Ник" }, profile(birth), T, DAY).issues.length === 0;
  assert.equal(ok("2010-11-15"), true, "16 today");
  assert.equal(ok("2010-11-16"), false, "16 tomorrow — still 15");
  assert.equal(ok("1990-11-16"), true, "35, turns 36 tomorrow");
  assert.equal(ok("1990-11-15"), false, "36 today");
  const old = checkPlayer({ id: "p", nickname: "Ivan" }, profile("1989-01-01"), T, DAY);
  assert.deepEqual(old.issues, ["Ivan: 37 лет — не проходит по возрасту (16–35 лет)"]);
});

test("tournamentDay uses the start date in Kazakhstan time (UTC+5), otherwise today", () => {
  assert.equal(tournamentDay({ starts_at: "2026-11-14T20:00:00Z" }), "2026-11-15");
  assert.equal(tournamentDay({ starts_at: "2026-11-14T18:59:00Z" }), "2026-11-14");
  assert.equal(tournamentDay({ starts_at: null }, Date.parse("2026-11-14T19:30:00Z")), "2026-11-15");
  assert.equal(almatyDay("2026-12-31T19:00:00Z"), "2027-01-01");
});

test("parseDay accepts real calendar dates only", () => {
  assert.equal(parseDay("2008-02-29"), "2008-02-29");
  assert.equal(parseDay("2007-02-29"), null);
  assert.equal(parseDay("2026-13-01"), null);
  assert.equal(parseDay("15.11.2026"), null);
  assert.equal(parseDay(undefined), null);
});

test("yearsLabel declines год / года / лет", () => {
  assert.deepEqual([1, 2, 5, 11, 12, 14, 21, 22, 25, 35, 111].map(yearsLabel), [
    "1 год", "2 года", "5 лет", "11 лет", "12 лет", "14 лет", "21 год", "22 года", "25 лет", "35 лет", "111 лет",
  ]);
});

test("normalizePhone brings Kazakhstan numbers to +7XXXXXXXXXX", () => {
  for (const raw of ["+7 705 123 45 67", "8 (705) 123-45-67", "87051234567", "7051234567", "+7-705-123-45-67", " 7 705 1234567 "]) {
    assert.equal(normalizePhone(raw), "+77051234567", raw);
  }
  for (const raw of ["", "12345", "+1 202 555 0100", "8-800-ABC-1234", "+7 005 123 45 67", "+770512345678", null]) {
    assert.equal(normalizePhone(raw), null, String(raw));
  }
  assert.equal(formatPhone("+77051234567"), "+7 705 123 45 67");
});

test("Profile completeness follows occupation: position for workers, course and group for students", () => {
  assert.equal(isProfileComplete(profile("2000-01-01")), true);
  assert.deepEqual(missingProfileFields(profile("2000-01-01", { study_group: " " })), ["группа"]);
  assert.deepEqual(missingProfileFields(profile("2000-01-01", { occupation: "works", course: null, study_group: null })), ["должность"]);
  assert.equal(isProfileComplete(profile("2000-01-01", { occupation: "works", position: "Инженер" })), true);
  assert.equal(isProfileComplete(profile("2000-01-01", { occupation: "other", organization: null, course: null, study_group: null })), true);
  assert.deepEqual(missingProfileFields(profile("2000-01-01", { consent_at: null })), ["согласие на обработку данных"]);
  assert.deepEqual(missingProfileFields(profile("2000-01-01", { phone: null, birth_date: null })), ["дата рождения", "телефон"]);
  assert.deepEqual(missingProfileFields(null), ["анкета не заполнена"]);
});

test("parseProfileForm normalizes values and reports field errors", () => {
  const form = (values: Record<string, string>) => parseProfileForm((k) => values[k] ?? "", "2026-10-09");
  const good = form({ last_name: "  Иванова-Петрова ", first_name: "Анна", birth_date: "2005-03-14", phone: "8 705 123 45 67", city: "Усть-Каменогорск", occupation: "works", organization: "Казцинк", position: "Инженер" });
  assert.deepEqual(good.errors, {});
  assert.equal(good.value.last_name, "Иванова-Петрова");
  assert.equal(good.value.phone, "+77051234567");
  assert.equal(good.value.course, null, "course is dropped for workers");
  const bad = form({ last_name: "Ivanov1", first_name: "", birth_date: "2030-01-01", phone: "123", city: "", occupation: "studies" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["birth_date", "city", "course", "first_name", "last_name", "organization", "phone", "study_group"]);
});

test("Organization suggestions dedupe case-insensitively, ignoring quotes, dots, spacing and ё", () => {
  assert.equal(organizationKey("ВКТУ им.Д.Серикбаева"), organizationKey("вкту им. д. серикбаева"));
  assert.equal(organizationKey("ТОО «Казцинк»"), organizationKey('тоо "казцинк"'));
  assert.equal(organizationKey("Учёба"), organizationKey("учеба"));
  const list = dedupeOrganizations([...SEED_ORGANIZATIONS, "вкту им.Д.Серикбаева", "  ТОО «Казцинк» ", 'ТОО "Казцинк"', "", null, "x", "Новая  организация"]);
  assert.equal(list.filter((x) => organizationKey(x) === organizationKey("ВКТУ им. Д. Серикбаева")).length, 1);
  assert.equal(list[0], SEED_ORGANIZATIONS[0], "seed spelling wins");
  assert.ok(list.includes("ТОО «Казцинк»"));
  assert.ok(!list.includes('ТОО "Казцинк"'));
  assert.ok(list.includes("Новая организация"));
  assert.ok(!list.includes("x") && !list.includes(""));
});

const players = (n: number, broken: Partial<Record<number, string>> = {}): PlayerCheck[] =>
  Array.from({ length: n }, (_, i) => ({ player_id: `p${i}`, nickname: `P${i}`, issues: broken[i] ? [`P${i}: ${broken[i]}`] : [], warnings: [] }));
const fullApp = parseApplication((k) => ({
  organization: "ВКТУ им. Д. Серикбаева",
  captain_phone: "+7 705 123 45 67",
  responsible_name: "Петров Пётр",
  responsible_phone: "87051112233",
  coach_name: "Сидоров Сидор",
  coach_birth_date: "1980-05-05",
  coach_workplace: "ВКТУ",
  coach_position: "Преподаватель",
} as Record<string, string>)[k], true);

test("Official application: 5 players + coach with complete data passes the checklist", () => {
  assert.deepEqual(fullApp.errors, {});
  assert.equal(fullApp.value.responsible_phone, "+77051112233");
  const items = officialChecklist({ t: T, players: players(5), mains: 5, subs: 0, application: fullApp.errors });
  assert.ok(items.every((i) => i.ok), JSON.stringify(items.filter((i) => !i.ok)));
  assert.equal(items.filter((i) => i.key.startsWith("player:")).length, 5);
  assert.deepEqual(officialRoster(T), { size: 5, subs: 0 });
  assert.deepEqual(officialRoster({ ...T, allow_substitutes: true }), { size: 5, subs: 2 });
});

test("Official application blocks short roster, substitutes, age and profile problems, missing coach", () => {
  const failed = (items: { key: string; ok: boolean }[]) => items.filter((i) => !i.ok).map((i) => i.key);
  assert.deepEqual(failed(officialChecklist({ t: T, players: players(4), mains: 4, subs: 0, application: fullApp.errors })), ["roster"]);
  assert.deepEqual(failed(officialChecklist({ t: T, players: players(6), mains: 5, subs: 1, application: fullApp.errors })), ["subs"]);
  assert.deepEqual(failed(officialChecklist({ t: { ...T, allow_substitutes: true }, players: players(6), mains: 5, subs: 1, application: fullApp.errors })), []);
  assert.deepEqual(failed(officialChecklist({ t: T, players: players(5, { 2: "37 лет — не проходит по возрасту (16–35 лет)" }), mains: 5, subs: 0, application: fullApp.errors })), ["player:p2"]);
  const noCoach = parseApplication((k) => (k.startsWith("coach") ? "" : ({ organization: "ВКУ", captain_phone: "87051234567", responsible_name: "А Б", responsible_phone: "87051234567" } as Record<string, string>)[k]), true);
  assert.deepEqual(Object.keys(noCoach.errors).sort(), ["coach_birth_date", "coach_name", "coach_position", "coach_workplace"]);
  assert.deepEqual(failed(officialChecklist({ t: T, players: players(5), mains: 5, subs: 0, application: noCoach.errors })), ["coach"]);
  const withoutCoach = parseApplication((k) => (k.startsWith("coach") ? "" : ({ organization: "ВКУ", captain_phone: "87051234567", responsible_name: "А Б", responsible_phone: "87051234567" } as Record<string, string>)[k]), false);
  assert.deepEqual(withoutCoach.errors, {});
  assert.ok(!officialChecklist({ t: { ...T, require_coach: false }, players: players(5), mains: 5, subs: 0, application: withoutCoach.errors }).some((i) => i.key === "coach"));
  assert.match(coachAgeWarning(T, "1980-05-05", DAY) ?? "", /46 лет/);
  assert.equal(coachAgeWarning(T, "1995-05-05", DAY), null);
});

test("checkPlayer: missing profile fields are named, another city is only a warning", () => {
  const missing = checkPlayer({ id: "p", nickname: "Nick" }, profile("2000-01-01", { phone: null }), T, DAY);
  assert.deepEqual(missing.issues, ["Nick: в анкете не заполнено — телефон"]);
  assert.deepEqual(checkPlayer({ id: "p", nickname: "Nick" }, null, T, DAY).issues, ["Nick: анкета не заполнена"]);
  const city = checkPlayer({ id: "p", nickname: "Nick" }, profile("2000-01-01", { city: "Алматы" }), T, DAY);
  assert.deepEqual(city.issues, []);
  assert.equal(city.warnings.length, 1);
  assert.equal(checkPlayer({ id: "p", nickname: "Nick" }, profile("2000-01-01", { city: "г. Усть-каменогорск" }), T, DAY).warnings.length, 0);
});

test("buildOfficialExport: participants sheet numbers rows, captain first, coach last, ages on the tournament day", () => {
  const teams: ExportTeam[] = [
    {
      team: "Bravo",
      status: "approved",
      application: {
        organization: "ВКУ им. С. Аманжолова",
        captain_phone: "+77050000001",
        responsible_name: "Ответственный Б",
        responsible_phone: "+77050000002",
        coach_name: "Тренер Б",
        coach_birth_date: "1985-06-01",
        coach_workplace: "ВКУ",
        coach_position: "Преподаватель",
        coach_documents_at: "2026-11-01T10:00:00Z",
      },
      players: [
        { nickname: "b2", captain: false, profile: profile("2008-02-29", { last_name: "Бобров", first_name: "Борис" }), documents: false },
        { nickname: "b1", captain: true, profile: profile("2000-11-15", { last_name: "Белов", first_name: "Олег", patronymic: "Ильич", occupation: "works", position: "Инженер" }), documents: true },
      ],
    },
    {
      team: "Alpha",
      status: "pending",
      application: null,
      players: [{ nickname: "a1", captain: true, profile: null, documents: false }],
    },
  ];
  const { participants, teams: teamRows, results } = buildOfficialExport(teams, DAY, [{ place: "1", team: "Bravo", wins: 3, losses: 0, mapWins: 6, mapLosses: 1 }]);
  assert.equal(participants[0].length, 12);
  assert.ok(participants.every((r) => r.length === 12));
  assert.deepEqual(participants.slice(1).map((r) => [r[0], r[1], r[3], r[9]]), [
    [1, "Alpha", "a1", "капитан"],
    [2, "Bravo", "Белов Олег Ильич", "капитан"],
    [3, "Bravo", "Бобров Борис", "игрок"],
    [4, "Bravo", "Тренер Б", "тренер"],
  ]);
  assert.deepEqual(participants[2].slice(4, 12), ["15.11.2000", 2000, 26, "ВКТУ им. Д. Серикбаева", "Инженер", "капитан", "+7 705 123 45 67", "да"]);
  assert.deepEqual(participants[3].slice(4, 9), ["29.02.2008", 2008, 18, "ВКТУ им. Д. Серикбаева", "2 курс, гр. ИС-21"]);
  assert.deepEqual(participants[4].slice(4, 12), ["01.06.1985", 1985, 41, "ВКУ", "Преподаватель", "тренер", "", "да"]);
  assert.deepEqual(teamRows[2], ["Bravo", "ВКУ им. С. Аманжолова", "Белов Олег Ильич", "+7 705 000 00 01", "Ответственный Б", "+7 705 000 00 02", "одобрена"]);
  assert.deepEqual(teamRows[1], ["Alpha", "", "a1", "", "", "", "на рассмотрении"]);
  assert.deepEqual(results[1], ["1", "Bravo", "ВКУ им. С. Аманжолова", 3, 0, "6:1"]);
});

console.log(`\n${checks} official/profile checks passed`);
