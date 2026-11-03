import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, isLang, langFromAccept, makeT, type Lang } from "./core";

/** Язык текущего запроса: cookie «lang» (переключатель в шапке), иначе язык браузера */
export const getLang = cache(async (): Promise<Lang> => {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return langFromAccept((await headers()).get("accept-language"));
});

/** Переводчик для серверных компонентов, server actions и API: const t = await getT() */
export async function getT() {
  return makeT(await getLang());
}
