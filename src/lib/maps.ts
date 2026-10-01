/**
 * Все официальные карты CS2 — по файлам игры на серверном ПК (D:\\cs2server\\game\\csgo\\maps).
 * active — соревновательный пул (выбран по умолчанию в новом турнире).
 * Какие карты вообще предлагать в турнирах, админ решает в «Настройки → Карты».
 */
export const CS2_MAPS = [
  { id: "de_ancient", name: "Ancient", active: true, tint: "#6cc59a" },
  { id: "de_anubis", name: "Anubis", active: true, tint: "#e3b465" },
  { id: "de_dust2", name: "Dust II", active: true, tint: "#d9a96b" },
  { id: "de_inferno", name: "Inferno", active: true, tint: "#ef7a7a" },
  { id: "de_mirage", name: "Mirage", active: true, tint: "#e8c27a" },
  { id: "de_nuke", name: "Nuke", active: true, tint: "#7fc4d8" },
  { id: "de_train", name: "Train", active: true, tint: "#a7b2c3" },
  { id: "de_overpass", name: "Overpass", active: false, tint: "#8bb8ff" },
  { id: "de_vertigo", name: "Vertigo", active: false, tint: "#b49cff" },
  { id: "de_cache", name: "Cache", active: false, tint: "#9fb3a0" },
  { id: "de_ancient_night", name: "Ancient Night", active: false, tint: "#6c8fc5" },
  { id: "de_boulder", name: "Boulder", active: false, tint: "#b0a08a" },
  { id: "de_debris", name: "Debris", active: false, tint: "#a89a86" },
  { id: "de_eldorado", name: "Eldorado", active: false, tint: "#c8a85a" },
  { id: "de_fachwerk", name: "Fachwerk", active: false, tint: "#b08a74" },
  { id: "de_poseidon", name: "Poseidon", active: false, tint: "#7fb0c8" },
  { id: "cs_office", name: "Office", active: false, tint: "#9aa6b8" },
  { id: "cs_italy", name: "Italy", active: false, tint: "#d0a070" },
  { id: "cs_shelter", name: "Shelter", active: false, tint: "#8a9aa0" },
] as const;

const NAMES: Record<string, string> = Object.fromEntries(CS2_MAPS.map((m) => [m.id, m.name]));

/** Название карты для людей: de_dust2 → Dust II, cs_office → Office, aim_map@123 → aim_map */
export function mapLabel(map: string) {
  if (map.includes("@")) return map.split("@")[0];
  if (NAMES[map]) return NAMES[map];
  const name = map.replace(/^(de|cs)_/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const ACTIVE_POOL = CS2_MAPS.filter((m) => m.active).map((m) => m.id);

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** «F16 Open Cup #1» → «f16-open-cup-1» */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .split("")
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
