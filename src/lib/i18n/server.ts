import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, makeT, type Lang } from "./core";

/**
 * Язык текущего запроса: cookie «lang» (переключатель ҚАЗ/РУС; при входе через Steam
 * ставится из профиля игрока — так выбор переезжает на новое устройство), иначе казахский
 */
export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
});

/** Переводчик для серверных компонентов, server actions и API: const t = await getT() */
export async function getT() {
  return makeT(await getLang());
}
