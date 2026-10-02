import "server-only";

/**
 * Шрифт Onest для картинок next/og (встроенный шрифт — только латиница).
 * Google Fonts отдаёт CSS с отдельным файлом на каждый набор символов; satori читает woff/ttf/otf
 * (не woff2), поэтому просим CSS «старым браузером» и берём файлы кириллицы и латиницы.
 * Если сеть недоступна — пустой список: вызывающий код рисует без своего шрифта.
 */
const OLD_UA = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30";

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

async function weightFonts(weight: 400 | 700): Promise<OgFont[]> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Onest:wght@${weight}`, { headers: { "User-Agent": OLD_UA }, next: { revalidate: 86400 } })
    ).text();
    // блоки вида «/* cyrillic */ @font-face { … src: url(…) format('woff') … }»
    const urls: string[] = [];
    for (const m of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/[^}]*?src:\s*url\((https:[^)]+)\)\s*format\('(?:woff|truetype|opentype)'\)/g)) {
      if (m[1] === "cyrillic" || m[1] === "latin") urls.push(m[2]);
    }
    // CSS без комментариев о наборах (один файл на всё)
    if (!urls.length) {
      const one = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('(?:woff|truetype|opentype)'\)/)?.[1];
      if (one) urls.push(one);
    }
    const files = await Promise.all(urls.map(async (u) => (await fetch(u, { next: { revalidate: 86400 } })).arrayBuffer()));
    return files.map((data) => ({ name: "Onest", data, weight, style: "normal" as const }));
  } catch {
    return [];
  }
}

/** Onest 400 и 700 (кириллица + латиница) */
export async function ogFonts(): Promise<OgFont[]> {
  const [regular, bold] = await Promise.all([weightFonts(400), weightFonts(700)]);
  return [...regular, ...bold];
}
