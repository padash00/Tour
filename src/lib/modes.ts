import { makeT, tr, type T } from "./i18n/core";

/** Режимы турнира. От режима зависят размер состава, проверка заявки и check-in, конфиг MatchZy и маппул. */
export const MODES = {
  "5v5": {
    label: tr("5 на 5"),
    title: tr("Соревновательный 5×5"),
    text: tr("Классический CS2: 5 основных игроков и до 2 запасных."),
    size: 5,
    subs: 2,
    wingman: false,
    maps: ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"],
  },
  "2v2": {
    label: tr("2 на 2"),
    title: tr("Wingman 2×2"),
    text: tr("Режим Wingman: компактные карты, 2 основных игрока и до 1 запасного."),
    size: 2,
    subs: 1,
    wingman: true,
    maps: ["de_inferno", "de_nuke", "de_overpass", "de_vertigo"],
  },
  "1v1": {
    label: tr("1 на 1"),
    title: tr("Дуэль 1×1"),
    text: tr("Один на один на соревновательных картах. Команда — это сам игрок."),
    size: 1,
    subs: 0,
    wingman: false,
    maps: ["de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"],
  },
} as const;

export type ModeKey = keyof typeof MODES;

export function modeOf(format: string | null | undefined) {
  return MODES[(format as ModeKey) in MODES ? (format as ModeKey) : "5v5"];
}

/** «5 основных игроков» / «2 основных игрока» / «1 игрок» */
export function mainPlayersLabel(size: number, t: T = makeT("ru")) {
  if (size === 1) return t("1 игрок");
  return t.plural(size, "{n} основной игрок", "{n} основных игрока", "{n} основных игроков").replace("{n}", String(size));
}
