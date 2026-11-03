/**
 * Казахский словарь: ключ — русский текст из интерфейса, значение — перевод.
 * Разбит по разделам сайта; если перевода нет — показывается русский.
 * Проверка, что ничего не забыто: node scripts/i18n-check.mjs
 */
import common from "./common";
import shell from "./shell";
import home from "./home";
import tournaments from "./tournaments";
import matches from "./matches";
import team from "./team";
import profile from "./profile";
import players from "./players";
import lobby from "./lobby";
import info from "./info";
import actions from "./actions";
import lib from "./lib";

export const KK: Record<string, string> = { ...common, ...shell, ...home, ...tournaments, ...matches, ...team, ...profile, ...players, ...lobby, ...info, ...actions, ...lib };
