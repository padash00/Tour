/** Форматирование и цвета статистики — без "use client", чтобы ими пользовались и серверные страницы */

export function ratingColor(r: number) {
  if (r >= 1.2) return "text-ok";
  if (r >= 1.0) return "text-fg";
  if (r >= 0.85) return "text-fg-2";
  return "text-danger";
}

export function swingColor(s: number | null) {
  if (s == null) return "text-fg-3";
  return s >= 1 ? "text-ok" : s <= -1 ? "text-danger" : "text-fg-2";
}

export const fmt = {
  swing: (s: number | null) => (s == null ? "—" : `${s > 0 ? "+" : ""}${s.toFixed(1)}%`),
  r: (n: number) => n.toFixed(2),
  d1: (n: number) => n.toFixed(1),
  pct: (n: number) => `${Math.round(n)}%`,
};

const WEAPONS: Record<string, string> = {
  ak47: "AK-47",
  m4a1: "M4A4",
  m4a1_silencer: "M4A1-S",
  m4a1_silencer_off: "M4A1-S",
  awp: "AWP",
  ssg08: "SSG 08",
  deagle: "Desert Eagle",
  revolver: "R8 Revolver",
  usp_silencer: "USP-S",
  usp_silencer_off: "USP-S",
  hkp2000: "P2000",
  glock: "Glock-18",
  p250: "P250",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  cz75a: "CZ75-Auto",
  elite: "Dual Berettas",
  galilar: "Galil AR",
  famas: "FAMAS",
  sg556: "SG 553",
  aug: "AUG",
  g3sg1: "G3SG1",
  scar20: "SCAR-20",
  mac10: "MAC-10",
  mp9: "MP9",
  mp7: "MP7",
  mp5sd: "MP5-SD",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  nova: "Nova",
  xm1014: "XM1014",
  mag7: "MAG-7",
  sawedoff: "Sawed-Off",
  negev: "Negev",
  m249: "M249",
  taser: "Zeus x27",
  hegrenade: "HE-граната",
  inferno: "Молотов",
  molotov: "Молотов",
  incgrenade: "Зажигательная",
  knife: "Нож",
  world: "Падение",
};

/** weapon_ak47 / ak47 → AK-47; ножи любых скинов → «Нож» */
export function weaponName(raw: string) {
  const w = raw.replace(/^weapon_/, "").toLowerCase();
  if (w.startsWith("knife") || w === "bayonet") return "Нож";
  return WEAPONS[w] ?? w.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
