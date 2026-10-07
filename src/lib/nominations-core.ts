/**
 * Индивидуальные номинации турнира (Положение: MVP, снайпер, рифлер, опорник, капитан, тренер).
 * Чистая логика без базы — покрыта тестом scripts/test-tournament-structure.mts.
 *
 * Кандидаты по статистике — только подсказка судьям: решение судей (таблица tournament_nominations)
 * всегда главнее. Капитан и тренер — только решением судей.
 *
 * Общее правило допуска (как у остальных наград): игрок сыграл не меньше половины карт своей команды
 * (минимум одну) и хотя бы один раунд.
 *
 * Метрики:
 * - «Лучший снайпер» — больше всего убийств из снайперских винтовок (AWP и SSG 08) по логу сервера;
 *   при равенстве — больше таких убийств за раунд. Нет лога с оружием — кандидата нет.
 * - «Лучший рифлер» — лучший F16 Rating среди игроков, у которых снайперские убийства — меньше 30%
 *   всех убийств по логу (то есть основное оружие — винтовки/автоматы); при равенстве — ADR.
 *   Если лог с оружием не собирался, рифлерами считаются все.
 * - «Лучший опорник» — индекс поддержки за раунд: (ассисты + флеш-ассисты) / раунды
 *   + урон гранатами / (100 · раунды). Например, 0,15 ассиста, 0,05 флеш-ассиста и 8 урона гранатами
 *   за раунд дают 0,28. При равенстве — KAST.
 */

export type NominationKey = "mvp" | "sniper" | "rifler" | "support" | "captain" | "coach";

export type NominationDef = {
  key: NominationKey;
  title: string;
  /** есть ли кандидат по статистике (иначе — только решение судей) */
  auto: boolean;
  /** как выбирается кандидат — показывается судьям в админке */
  rule: string;
  /** участник — не пользователь сайта (тренер): имя вводится текстом */
  freeText?: boolean;
};

export const NOMINATIONS: NominationDef[] = [
  { key: "mvp", title: "Лучший игрок (MVP)", auto: true, rule: "Лучший Swing (вклад в победу раунда), без данных Swing — F16 Rating; не меньше половины карт команды, минимум 2." },
  { key: "sniper", title: "Лучший снайпер", auto: true, rule: "Больше всего убийств из AWP и SSG 08 по логу сервера; при равенстве — за раунд." },
  { key: "rifler", title: "Лучший рифлер", auto: true, rule: "Лучший F16 Rating среди игроков, у кого снайперские убийства < 30% всех; при равенстве — ADR." },
  { key: "support", title: "Лучший опорник", auto: true, rule: "(Ассисты + флеш-ассисты) за раунд + урон гранатами / 100 за раунд; при равенстве — KAST." },
  { key: "captain", title: "Лучший капитан команды", auto: false, rule: "Решение судей." },
  { key: "coach", title: "Лучший тренер", auto: false, rule: "Решение судей. Тренер может не быть пользователем сайта — укажите ФИО.", freeText: true },
];

export const nominationTitle = (key: string) => NOMINATIONS.find((n) => n.key === key)?.title ?? key;

/** Снайперские винтовки CS2 по имени оружия в логе («awp», «weapon_ssg08») */
export const SNIPER_WEAPONS = ["awp", "ssg08"] as const;
export const isSniperWeapon = (weapon: string | null | undefined) =>
  !!weapon && (SNIPER_WEAPONS as readonly string[]).includes(weapon.toLowerCase().replace(/^weapon_/, ""));

/** Порог доли снайперских убийств, ниже которого игрок считается рифлером */
export const RIFLER_MAX_SNIPER_SHARE = 0.3;

export type NominationLine = {
  /** id игрока на сайте */
  key: string;
  teamId: string | null;
  maps: number;
  /** сколько карт сыграла команда игрока */
  teamMaps: number;
  rounds: number;
  assists: number;
  flashAssists: number;
  utilityDamage: number;
  /** % раундов с KAST */
  kast: number;
  adr: number;
  rating: number;
  /** убийства из AWP/SSG 08 по логу; null — лога с оружием нет */
  sniperKills: number | null;
  /** все убийства соперников по логу (для доли снайперских); null — лога нет */
  loggedKills: number | null;
};

export type NominationPick = { line: NominationLine; value: string; score: number };

export const eligibleLines = (lines: NominationLine[]) =>
  lines.filter((l) => l.rounds > 0 && l.maps >= Math.max(1, Math.ceil(l.teamMaps / 2)));

/** Лучший по score, при равенстве — по tie; score ≤ 0 — кандидата нет */
function top(lines: NominationLine[], score: (l: NominationLine) => number, tie: (l: NominationLine) => number) {
  const best = [...lines].sort((a, b) => score(b) - score(a) || tie(b) - tie(a))[0];
  return best && score(best) > 0 ? best : null;
}

const fixed = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

export function bestSniper(lines: NominationLine[]): NominationPick | null {
  const pool = eligibleLines(lines).filter((l) => l.sniperKills != null);
  const best = top(pool, (l) => l.sniperKills!, (l) => l.sniperKills! / l.rounds);
  return best ? { line: best, score: best.sniperKills!, value: `${best.sniperKills} убийств из AWP/SSG 08` } : null;
}

/** Доля снайперских убийств; null — лога с оружием нет */
export const sniperShare = (l: NominationLine) =>
  l.sniperKills == null || !l.loggedKills ? null : l.sniperKills / l.loggedKills;

export const isRifler = (l: NominationLine) => (sniperShare(l) ?? 0) < RIFLER_MAX_SNIPER_SHARE;

export function bestRifler(lines: NominationLine[]): NominationPick | null {
  const pool = eligibleLines(lines).filter(isRifler);
  const best = top(pool, (l) => l.rating, (l) => l.adr);
  return best ? { line: best, score: best.rating, value: `Rating ${fixed(best.rating)} · ADR ${fixed(best.adr, 1)}` } : null;
}

export const supportScore = (l: NominationLine) =>
  l.rounds > 0 ? (l.assists + l.flashAssists) / l.rounds + l.utilityDamage / (100 * l.rounds) : 0;

export function bestSupport(lines: NominationLine[]): NominationPick | null {
  const pool = eligibleLines(lines);
  const best = top(pool, supportScore, (l) => l.kast);
  if (!best) return null;
  const r = best.rounds;
  return {
    line: best,
    score: supportScore(best),
    value: `индекс ${fixed(supportScore(best))} · ассисты ${fixed(best.assists / r)}/р · флеш ${fixed(best.flashAssists / r)}/р · гранаты ${fixed(best.utilityDamage / r, 1)}/р`,
  };
}
