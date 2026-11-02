/** Роли организаций турнира: генеральный спонсор, организатор, площадка, поддержка, партнёр */
export const SPONSOR_ROLES = [
  { key: "general", label: "Генеральный спонсор" },
  { key: "organizer", label: "Организатор" },
  { key: "venue", label: "Площадка" },
  { key: "support", label: "При поддержке" },
  { key: "partner", label: "Партнёр" },
] as const;

export type SponsorRole = (typeof SPONSOR_ROLES)[number]["key"];
export type Sponsor = { name: string; url?: string; role?: SponsorRole };

export const isSponsorRole = (r: unknown): r is SponsorRole => SPONSOR_ROLES.some((x) => x.key === r);
export const sponsorRoleLabel = (r?: string) => SPONSOR_ROLES.find((x) => x.key === r)?.label ?? "Партнёр";
const order = (r?: string) => {
  const i = SPONSOR_ROLES.findIndex((x) => x.key === (r ?? "partner"));
  return i < 0 ? SPONSOR_ROLES.length : i;
};

/** Группы для страницы турнира: роль → организации, в порядке важности роли */
export function groupSponsors(list: Sponsor[]): { role: string; label: string; items: Sponsor[] }[] {
  const groups = new Map<string, Sponsor[]>();
  for (const s of [...list].sort((a, b) => order(a.role) - order(b.role))) {
    const k = s.role ?? "partner";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups].map(([role, items]) => ({ role, label: sponsorRoleLabel(role), items }));
}
