// Вымышленные участники демо-турнира: ФИО, даты рождения, телефоны, места учёбы и работы, команды и заявки.
// Детерминированно (одно зерно — одни и те же люди), без базы. Все данные выдуманы; SteamID — из
// зарезервированного диапазона 765611999990000xx (выше выданных Steam номеров), телефоны — +7 7xx 555 xx xx.
import { SEED_ORGANIZATIONS } from "../../src/lib/organizations";
import { ageOn, almatyDay } from "../../src/lib/profile";
import { pick, rngFrom, ROLES, type Rng } from "./demo-sim";

export const DEMO_SLUG = "demo-cs-uka-2026";
export const DEMO_NAME = "DEMO · CS Uka-2026";
/** SteamID демо-игроков: префикс + две цифры (01–80 — участники, 81–90 — неверные заявки, 99 — организатор) */
export const DEMO_STEAM_PREFIX = "765611999990000";
export const DEMO_INVITE_PREFIX = "DEMO-UKA-";
export const DEMO_ORGANIZER_STEAM = `${DEMO_STEAM_PREFIX}99`;
export const DEMO_MAP_POOL = ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_train"];
export const demoSteamId = (n: number) => `${DEMO_STEAM_PREFIX}${String(n).padStart(2, "0")}`;
export const isDemoSteamId = (steamId: string) => /^765611999990000\d{2}$/.test(steamId);

const KZ_FIRST = ["Арман", "Ерлан", "Нурсултан", "Данияр", "Алибек", "Асхат", "Бауыржан", "Дамир", "Ерасыл", "Жанибек", "Канат", "Мирас", "Нуржан", "Олжас", "Рустем", "Санжар", "Тимур", "Ержан", "Азамат", "Айдос", "Бекзат", "Мадияр", "Елдос", "Нурлан", "Ильяс", "Аслан", "Дастан", "Темирлан", "Алихан", "Ернар"];
const KZ_LAST = ["Ахметов", "Жумабаев", "Сериков", "Нурланов", "Касымов", "Тулегенов", "Омаров", "Байжанов", "Мукашев", "Абенов", "Есенов", "Искаков", "Кенжебаев", "Садыков", "Утегенов", "Жакупов", "Байменов", "Сагинтаев", "Токтаров", "Алимжанов", "Бекмуханов", "Оспанов"];
const KZ_PATRONYMIC = ["Ерланович", "Маратович", "Сакенович", "Болатович", "Кайратович", "Нурланович", "Асхатович", "Бахытжанович", "Серикович", "Талгатович"];
const RU_FIRST = ["Алексей", "Дмитрий", "Сергей", "Андрей", "Максим", "Иван", "Никита", "Артём", "Егор", "Кирилл", "Владислав", "Денис", "Роман", "Павел", "Илья", "Михаил", "Евгений", "Антон", "Виктор", "Олег"];
const RU_LAST = ["Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев", "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев", "Орлов", "Макаров", "Зайцев", "Шевченко", "Ковальчук"];
const RU_PATRONYMIC = ["Александрович", "Сергеевич", "Андреевич", "Викторович", "Владимирович", "Игоревич", "Олегович", "Николаевич", "Дмитриевич", "Евгеньевич"];
const F_KZ = [["Ахметова", "Айгерим", "Болатовна"], ["Сарсенова", "Динара", "Маратовна"], ["Касымова", "Гульнара", "Ерлановна"], ["Нурланова", "Асель", "Кайратовна"], ["Жакупова", "Мадина", "Серикова"]];
const F_RU = [["Смирнова", "Елена", "Викторовна"], ["Кузнецова", "Ольга", "Сергеевна"], ["Попова", "Наталья", "Андреевна"], ["Волкова", "Ирина", "Николаевна"], ["Лебедева", "Татьяна", "Игоревна"]];
const NICK = ["frost", "reflex", "nova", "viper", "blaze", "zenit", "rush", "flick", "storm", "ghost", "hawk", "pulse", "echo", "drift", "spark", "lynx", "raven", "bolt", "kaiser", "orbit", "sniper", "spray", "tempo", "zeus", "apex", "kobra", "jet", "sage", "fury", "nomad", "steppe", "altai", "irtysh", "ronin", "titan", "wolf", "eagle", "falcon", "shadow", "comet"];
const POSITIONS = ["Инженер", "Техник", "Оператор", "Мастер участка", "Менеджер", "Бухгалтер", "Программист", "Логист", "Электромонтёр", "Специалист отдела кадров", "Механик", "Аналитик"];

const UNI_ORGS = SEED_ORGANIZATIONS.slice(0, 3);

export type DemoProfile = {
  last_name: string;
  first_name: string;
  patronymic: string;
  birth_date: string;
  phone: string;
  city: string;
  occupation: "works" | "studies";
  organization: string;
  position: string | null;
  course: string | null;
  study_group: string | null;
};
export type DemoPlayer = { steamId: string; nickname: string; role: (typeof ROLES)[number]; skill: number; profile: DemoProfile };
export type DemoTeam = {
  tag: string;
  name: string;
  organization: string;
  /** уровень команды для симуляции (около 1.0) */
  strength: number;
  players: DemoPlayer[];
  application: {
    organization: string;
    captain_phone: string;
    responsible_name: string;
    responsible_phone: string;
    coach_name: string;
    coach_birth_date: string;
    coach_workplace: string;
    coach_position: string;
  };
};

type TeamDef = { name: string; org: string; kind: "uni" | "college" | "work"; groups: string[] };
/** Названия — вымышленные, без чужих торговых марок; организации — учебные заведения города и условные предприятия */
const TEAMS: TeamDef[] = [
  { name: "ВКТУ Titans", org: SEED_ORGANIZATIONS[0], kind: "uni", groups: ["ИС-22", "ВТ-23", "ПИ-21"] },
  { name: "ВКТУ Storm", org: SEED_ORGANIZATIONS[0], kind: "uni", groups: ["ЭЭ-22", "МТ-23", "АУ-24"] },
  { name: "ВКУ Falcons", org: SEED_ORGANIZATIONS[1], kind: "uni", groups: ["ИНФ-22", "МАТ-23", "ФК-21"] },
  { name: "ВКУ Ronin", org: SEED_ORGANIZATIONS[1], kind: "uni", groups: ["ИСТ-23", "ЮР-22", "ЭК-24"] },
  { name: "КАСУ Eagles", org: SEED_ORGANIZATIONS[2], kind: "uni", groups: ["CS-22", "BA-23", "IR-21"] },
  { name: "Колледж Wolves", org: SEED_ORGANIZATIONS[3], kind: "college", groups: ["ПО-24", "ПД-23", "ТО-24"] },
  { name: "Политех Vipers", org: SEED_ORGANIZATIONS[4], kind: "college", groups: ["ТЭ-23", "ПР-24", "СВ-23"] },
  { name: "Стройколледж Bears", org: SEED_ORGANIZATIONS[5], kind: "college", groups: ["СТ-23", "АР-24", "ГС-23"] },
  { name: "Иртыш Sharks", org: "ТОО «Иртыш-Сервис Демо»", kind: "work", groups: [] },
  { name: "Алтай Lynx", org: "ТОО «Алтай Логистик Демо»", kind: "work", groups: [] },
  { name: "Энергетик Volts", org: "ТОО «Восток Энерго Сервис Демо»", kind: "work", groups: [] },
  { name: "Металлург Forge", org: "ТОО «Металл Индустрия Демо»", kind: "work", groups: [] },
  { name: "Медики Pulse", org: "Городская поликлиника №3 (демо)", kind: "work", groups: [] },
  { name: "Строитель Hammers", org: "ТОО «УК Строй Монтаж Демо»", kind: "work", groups: [] },
  { name: "IT Hub Bytes", org: "ИП «Алтай IT Решения Демо»", kind: "work", groups: [] },
  { name: "Горняки Miners", org: "ТОО «Восток Горный Сервис Демо»", kind: "work", groups: [] },
];
/** Уровни команд (по номеру DM01…DM16) — разные, чтобы результаты выглядели естественно */
const STRENGTH = [1.18, 1.04, 1.12, 0.93, 1.07, 1.15, 0.88, 0.97, 1.1, 0.9, 1.0, 0.95, 0.86, 1.02, 1.21, 0.92];

/** Дата рождения, при которой на день `day` исполнилось ровно `age` полных лет */
function birthFor(rng: Rng, age: number, day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const start = Date.UTC(y - age - 1, m - 1, d) + 86_400_000; // день после (age+1)-летия назад
  const end = Date.UTC(y - age, m - 1, d); // ровно age лет назад
  const at = new Date(start + Math.floor(rng() * ((end - start) / 86_400_000 + 1)) * 86_400_000);
  const birth = at.toISOString().slice(0, 10);
  if (ageOn(birth, day) !== age) throw new Error(`birthFor: ${birth} on ${day} is not ${age}`);
  return birth;
}

const phone = (rng: Rng, used: Set<string>) => {
  for (;;) {
    const code = pick(rng, ["700", "701", "702", "705", "707", "708", "747", "771", "775", "776", "777", "778"]);
    const p = `+7${code}555${String(Math.floor(rng() * 10_000)).padStart(4, "0")}`;
    if (!used.has(p)) {
      used.add(p);
      return p;
    }
  }
};

function person(rng: Rng) {
  if (rng() < 0.62) return { last: pick(rng, KZ_LAST), first: pick(rng, KZ_FIRST), patronymic: pick(rng, KZ_PATRONYMIC) };
  return { last: pick(rng, RU_LAST), first: pick(rng, RU_FIRST), patronymic: pick(rng, RU_PATRONYMIC) };
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
};
const latin = (s: string) => s.toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("");

/** 16 команд по 5 игроков. day — день турнира (YYYY-MM-DD по Алматы) для возраста 16–35 */
export function demoTeams(day = almatyDay(), seed = 2026): DemoTeam[] {
  const rng = rngFrom(seed);
  const phones = new Set<string>();
  const nicks = new Set<string>();
  const nickname = (first: string) => {
    for (;;) {
      const base = rng() < 0.45 ? `${latin(first).slice(0, 5)}${pick(rng, ["", "_", "."])}${pick(rng, NICK)}` : `${pick(rng, NICK)}${pick(rng, ["", "_", "-"])}${Math.floor(rng() * 99)}`;
      if (!nicks.has(base)) {
        nicks.add(base);
        return base;
      }
    }
  };
  return TEAMS.map((def, ti) => {
    const players: DemoPlayer[] = ROLES.map((role, pi) => {
      const who = person(rng);
      // учатся: студенты 17–22 (колледж 16–19); работают: 21–35; в рабочих командах один может учиться
      const studies = def.kind !== "work" || (pi === 4 && rng() < 0.5);
      const age = def.kind === "college" ? 16 + Math.floor(rng() * 4) : studies ? 17 + Math.floor(rng() * 6) : 21 + Math.floor(rng() * 15);
      const organization = studies && def.kind === "work" ? pick(rng, UNI_ORGS) : def.org;
      const course = studies ? String(Math.min(def.kind === "college" ? 3 : 4, Math.max(1, age - (def.kind === "college" ? 15 : 17)))) : null;
      return {
        steamId: demoSteamId(ti * 5 + pi + 1),
        nickname: nickname(who.first),
        role,
        skill: Number((0.88 + rng() * 0.3 + (role === "awp" || role === "entry" ? 0.06 : 0)).toFixed(3)),
        profile: {
          last_name: who.last,
          first_name: who.first,
          patronymic: who.patronymic,
          birth_date: birthFor(rng, age, day),
          phone: phone(rng, phones),
          city: "Усть-Каменогорск",
          occupation: studies ? "studies" : "works",
          organization,
          position: studies ? null : pick(rng, POSITIONS),
          course,
          study_group: studies ? (def.groups.length ? pick(rng, def.groups) : pick(rng, ["ИС-22", "ВТ-23", "ИНФ-22"])) : null,
        },
      };
    });
    const coach = person(rng);
    const resp = rng() < 0.5 ? pick(rng, F_KZ) : pick(rng, F_RU);
    return {
      tag: `DM${String(ti + 1).padStart(2, "0")}`,
      name: def.name,
      organization: def.org,
      strength: STRENGTH[ti],
      players,
      application: {
        organization: def.org,
        captain_phone: players[0].profile.phone,
        responsible_name: resp.join(" "),
        responsible_phone: phone(rng, phones),
        coach_name: `${coach.last} ${coach.first} ${coach.patronymic}`,
        coach_birth_date: `${1975 + Math.floor(rng() * 18)}-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 28)).padStart(2, "0")}`,
        coach_workplace: def.org,
        coach_position: def.kind === "uni" ? "Старший преподаватель кафедры физической культуры" : def.kind === "college" ? "Преподаватель информатики" : pick(rng, ["Инженер", "Начальник участка", "Руководитель IT-отдела"]),
      },
    };
  });
}

/**
 * Две заведомо неверные заявки (их отклоняет save_official_registration): в DM17 капитану 37 лет,
 * в DM18 у игрока не заполнена анкета (нет телефона и согласия). Игроки 81–90, удаляются сразу после проверки.
 */
export function invalidDemoTeams(day = almatyDay()): (DemoTeam & { expected: string; broken: { steamId: string; problem: string } })[] {
  const base = demoTeams(day, 77);
  const make = (index: number, tag: string, name: string, offset: number) => {
    const t = base[index];
    return {
      ...t,
      tag,
      name,
      players: t.players.map((p, i) => ({ ...p, steamId: demoSteamId(offset + i), nickname: `${p.nickname}_x${tag.slice(2)}` })),
    };
  };
  const old = make(0, "DM17", "Тест Возраст", 81);
  const rng = rngFrom(37);
  old.players[0].profile = { ...old.players[0].profile, birth_date: birthFor(rng, 37, day), occupation: "works", organization: "ТОО «Иртыш-Сервис Демо»", position: "Инженер", course: null, study_group: null };
  const incomplete = make(8, "DM18", "Тест Анкета", 86);
  return [
    { ...old, expected: "age_out_of_range", broken: { steamId: old.players[0].steamId, problem: "37 лет на день турнира (допуск 16–35)" } },
    { ...incomplete, expected: "profile_incomplete", broken: { steamId: incomplete.players[2].steamId, problem: "в анкете нет телефона и согласия на обработку данных" } },
  ];
}
