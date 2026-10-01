/** Карты CS2 для турнирного маппула. active — актуальный соревновательный пул (выбран по умолчанию). */
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
] as const;

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
