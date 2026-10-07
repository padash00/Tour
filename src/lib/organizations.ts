/**
 * Подсказки организаций (место работы/учёбы, организация команды): стартовый список + то, что уже ввели другие.
 * Свободный ввод разрешён — подсказки только помогают писать одно название одинаково.
 */

/**
 * Стартовый список учебных заведений Усть-Каменогорска. Редактируемый: проверьте официальные
 * названия и дополняйте — порядок здесь и есть порядок в подсказках.
 */
export const SEED_ORGANIZATIONS: readonly string[] = [
  "ВКТУ им. Д. Серикбаева",
  "ВКУ им. С. Аманжолова",
  "Казахстанско-Американский свободный университет",
  "Восточно-Казахстанский гуманитарный колледж",
  "Восточно-Казахстанский политехнический колледж",
  "Усть-Каменогорский строительный колледж",
];

/** Ключ сравнения: без регистра, кавычек, «ё», лишних пробелов и точек — «ВКТУ им.Д.Серикбаева» = «вкту им. д. серикбаева» */
export function organizationKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'“”„`]/g, "")
    .replace(/\./g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim()
    .replace(/\.$/, "");
}

/**
 * Список подсказок без повторов: первым встреченным написанием (стартовый список идёт первым),
 * пустые и слишком длинные строки отбрасываются. limit — сколько отдать в форму.
 */
export function dedupeOrganizations(names: Iterable<string | null | undefined>, limit = 300): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.replace(/\s+/g, " ").trim();
    if (!name || name.length < 2 || name.length > 160) continue;
    const key = organizationKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}
